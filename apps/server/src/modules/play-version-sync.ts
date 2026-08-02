import jwt from "jsonwebtoken";
import { prisma } from "../db/client.js";
import { env } from "../config/env.js";
import { invalidateConfig } from "../lib/config-service.js";

/**
 * Play version sync — keeps ANDROID_LATEST_VERSION (the update-nudge's "latest
 * live versionCode") in step with the ACTUAL production track on Google Play, so
 * it's never a manual admin step and never nudges players toward a build that
 * isn't downloadable yet.
 *
 * Auth: a Google service-account key (PLAY_SERVICE_ACCOUNT_JSON) signs a short
 * RS256 JWT assertion, exchanged for an OAuth access token (no googleapis dep —
 * jsonwebtoken + native fetch). We then read the app's release tracks and take
 * the highest versionCode among the *completed* releases on the "production"
 * track — that is the newest version a user can actually update to.
 *
 * DISABLED by default: with PLAY_SERVICE_ACCOUNT_JSON empty, syncOnce() is a
 * no-op and the config value stays whatever an admin last set (or unset).
 */

const CONFIG_KEY = "ANDROID_LATEST_VERSION";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";

type ServiceAccount = { client_email: string; private_key: string };

function parseServiceAccount(): ServiceAccount | null {
  if (!env.PLAY_SERVICE_ACCOUNT_JSON.trim()) return null;
  try {
    const sa = JSON.parse(env.PLAY_SERVICE_ACCOUNT_JSON) as Partial<ServiceAccount>;
    if (!sa.client_email || !sa.private_key) return null;
    // Env vars often escape newlines in the PEM; restore them.
    return { client_email: sa.client_email, private_key: sa.private_key.replace(/\\n/g, "\n") };
  } catch {
    return null;
  }
}

/** Sign the service-account JWT and exchange it for an OAuth access token. */
async function getAccessToken(sa: ServiceAccount): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    { scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 },
    sa.private_key,
    { algorithm: "RS256", issuer: sa.client_email, header: { alg: "RS256", typ: "JWT" } },
  );
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string };
  return json.access_token ?? null;
}

/**
 * Distinguishes the ways this lookup can fail.
 *
 * Every failure used to collapse into `null`, which the caller reported as
 * "no completed production release found" — a message that sends you to check
 * your RELEASE when the actual cause is usually PERMISSIONS, and which made a
 * misconfigured sync indistinguishable from a correctly-configured one that
 * simply has nothing to sync yet. That ambiguity is why a sync configured long
 * ago could sit broken without anyone being able to tell.
 */
type TrackLookup =
  | { ok: true; versionCode: number }
  | { ok: false; reason: "no-completed-release"; staged: number[] }
  | { ok: false; reason: "edit-denied"; status: number }
  | { ok: false; reason: "track-read-failed"; status: number };

/**
 * Read the highest versionCode released on the PRODUCTION track. Uses the edits
 * API: create an edit, read the "production" track's releases, take the max
 * versionCode among releases with status "completed", then abandon the edit (we
 * never commit).
 *
 * PERMISSIONS: creating an edit is a WRITE-scoped call. A service account with
 * only "View app information and download bulk reports (read-only)" is refused
 * at that first step, before any track is read — so read-only is NOT sufficient
 * for this, despite the lookup itself being read-only in spirit. The account
 * needs release access on the app.
 */
async function fetchLiveProductionVersionCode(token: string, pkg: string): Promise<TrackLookup> {
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(pkg)}/edits`;
  const auth = { Authorization: `Bearer ${token}` };

  const editRes = await fetch(base, { method: "POST", headers: auth });
  if (!editRes.ok) return { ok: false, reason: "edit-denied", status: editRes.status };
  const edit = (await editRes.json()) as { id?: string };
  if (!edit.id) return { ok: false, reason: "edit-denied", status: editRes.status };

  try {
    const trackRes = await fetch(`${base}/${edit.id}/tracks/production`, { headers: auth });
    if (!trackRes.ok) return { ok: false, reason: "track-read-failed", status: trackRes.status };
    const track = (await trackRes.json()) as {
      releases?: { status?: string; versionCodes?: string[] }[];
    };
    let max = 0;
    // Track what we SAW but skipped, so a staged rollout can be reported as such
    // instead of looking identical to "nothing is published at all".
    const staged: number[] = [];
    for (const rel of track.releases ?? []) {
      const codes = (rel.versionCodes ?? [])
        .map((vc) => Number.parseInt(vc, 10))
        .filter((n) => Number.isFinite(n));
      if (rel.status !== "completed") {
        staged.push(...codes); // e.g. status "inProgress" — a staged rollout
        continue; // only fully-rolled-out releases count
      }
      for (const n of codes) if (n > max) max = n;
    }
    return max > 0 ? { ok: true, versionCode: max } : { ok: false, reason: "no-completed-release", staged };
  } finally {
    // Abandon the edit (best-effort; edits expire on their own anyway).
    await fetch(`${base}/${edit.id}`, { method: "DELETE", headers: auth }).catch(() => {});
  }
}

/**
 * Run one sync. No-op if the service account isn't configured. On success,
 * writes the live production versionCode into ANDROID_LATEST_VERSION (only when
 * it actually differs, to avoid needless writes) and invalidates the cache.
 * Never throws — a Play/API hiccup just leaves the current value in place.
 */
export async function syncPlayVersionOnce(): Promise<void> {
  const sa = parseServiceAccount();
  if (!sa) return; // disabled — no credentials

  try {
    const token = await getAccessToken(sa);
    if (!token) {
      console.warn("[play-version-sync] could not obtain access token");
      return;
    }
    const lookup = await fetchLiveProductionVersionCode(token, env.PLAY_PACKAGE_NAME);
    if (!lookup.ok) {
      // Say WHICH step failed. The old single message ("no completed production
      // release found") was emitted for permission errors too, which is why a
      // sync that never worked looked exactly like one with nothing to do.
      if (lookup.reason === "edit-denied") {
        console.warn(
          `[play-version-sync] Play refused to open an edit (HTTP ${lookup.status}) for ${env.PLAY_PACKAGE_NAME}. ` +
            "Creating an edit is write-scoped: a read-only service account cannot do it. " +
            "Grant the service account release access to this app in Play Console → Users and permissions.",
        );
      } else if (lookup.reason === "track-read-failed") {
        console.warn(`[play-version-sync] could not read the production track (HTTP ${lookup.status})`);
      } else if (lookup.staged.length > 0) {
        console.warn(
          `[play-version-sync] production has no COMPLETED release yet; ` +
            `versionCode(s) ${lookup.staged.join(", ")} are still rolling out. ` +
            "Bump the staged rollout to 100% and this will pick them up.",
        );
      } else {
        console.warn("[play-version-sync] no completed production release found");
      }
      return;
    }
    const latest = lookup.versionCode;
    const current = await prisma.config.findUnique({ where: { key: CONFIG_KEY }, select: { value: true } });
    if (current?.value === String(latest)) return; // already up to date

    // Upsert so it works even if the row somehow doesn't exist yet.
    await prisma.config.upsert({
      where: { key: CONFIG_KEY },
      update: { value: String(latest) },
      create: {
        key: CONFIG_KEY,
        value: String(latest),
        type: "int",
        category: "flag",
        label: "Android latest versionCode (integer, NOT the version name)",
      },
    });
    invalidateConfig(CONFIG_KEY);
    console.log(`[play-version-sync] ANDROID_LATEST_VERSION ${current?.value ?? "unset"} -> ${latest}`);
  } catch (e) {
    console.warn("[play-version-sync] sync failed (leaving current value):", (e as Error).message);
  }
}

/**
 * Start the periodic sync: run once on boot, then every [intervalMs] (default
 * 6h). No-op if disabled. The interval is unref'd so it never keeps the process
 * alive on its own.
 */
export function startPlayVersionSync(intervalMs = 6 * 60 * 60 * 1000): void {
  if (!env.PLAY_SERVICE_ACCOUNT_JSON.trim()) return; // disabled
  void syncPlayVersionOnce();
  const timer = setInterval(() => void syncPlayVersionOnce(), intervalMs);
  timer.unref?.();
}
