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
 * Read the highest versionCode released on the PRODUCTION track. Uses the
 * edits API: create an edit, read the "production" track's releases, take the
 * max versionCode among releases with status "completed", then abandon the edit
 * (read-only — we never commit). Returns null on any failure.
 */
async function fetchLiveProductionVersionCode(token: string, pkg: string): Promise<number | null> {
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(pkg)}/edits`;
  const auth = { Authorization: `Bearer ${token}` };

  const editRes = await fetch(base, { method: "POST", headers: auth });
  if (!editRes.ok) return null;
  const edit = (await editRes.json()) as { id?: string };
  if (!edit.id) return null;

  try {
    const trackRes = await fetch(`${base}/${edit.id}/tracks/production`, { headers: auth });
    if (!trackRes.ok) return null;
    const track = (await trackRes.json()) as {
      releases?: { status?: string; versionCodes?: string[] }[];
    };
    let max = 0;
    for (const rel of track.releases ?? []) {
      if (rel.status !== "completed") continue; // only fully-rolled-out releases
      for (const vc of rel.versionCodes ?? []) {
        const n = Number.parseInt(vc, 10);
        if (Number.isFinite(n) && n > max) max = n;
      }
    }
    return max > 0 ? max : null;
  } finally {
    // Abandon the read-only edit (best-effort; edits expire on their own anyway).
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
    const latest = await fetchLiveProductionVersionCode(token, env.PLAY_PACKAGE_NAME);
    if (latest == null) {
      console.warn("[play-version-sync] no completed production release found");
      return;
    }
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
