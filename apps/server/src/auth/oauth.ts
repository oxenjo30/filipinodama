import { randomBytes } from "node:crypto";
import type { User } from "@prisma/client";
import { containsProfanity } from "@dama/shared";
import { prisma } from "../db/client.js";
import { env, features } from "../config/env.js";
import { randomTag } from "./tokens.js";
import { err } from "../lib/errors.js";
import { grantDefaults } from "./service.js";
import { redis } from "../realtime/store.js";

/**
 * OAuth 2.0 (Google / Facebook) — authorization-code flow (web), plus a
 * Google ID-token flow (native Android via Credential Manager).
 *
 * 1. /api/auth/oauth/:provider          → redirect to the provider's consent screen
 * 2. /api/auth/oauth/:provider/callback → exchange code → profile → find/link/create
 *    user → issue our own session (same cookies as email login).
 * 3. /api/auth/oauth/google/token       → verify a Credential-Manager-issued Google
 *    ID token → same find/link/create user path → same session cookies.
 *
 * A short-lived signed `state` guards against CSRF on the redirect flow. Providers
 * with no configured credentials return a "not configured" error (the button is
 * disabled anyway).
 */

export type OAuthProvider = "google" | "facebook";

type Profile = { providerId: string; email: string | null; name: string | null; avatar: string | null };

const CALLBACK = (p: OAuthProvider) => `${env.OAUTH_CALLBACK_BASE}/api/auth/oauth/${p}/callback`;

// Ephemeral CSRF state store. Kept in REDIS (not an in-process Map) because the
// app runs multi-instance: the redirect that mints the state and the callback
// that consumes it may land on different instances, so an in-memory Map would
// fail the callback with "state not found" on any instance but the minting one.
// Each state carries the post-login `next` path the user was headed to. Redis
// key TTL enforces the same ~10-minute expiry the Map's `exp` used (fail-closed:
// once expired the key is gone, so the callback is rejected).
type StateEntry = { next: string; linkUserId?: string };
const STATE_KEY = (s: string) => `oauth:state:${s}`;
const STATE_TTL_SEC = 10 * 60;
/**
 * [linkUserId] turns the redirect flow into a LINK instead of a sign-in: the
 * callback attaches the returned Google identity to that already-signed-in user
 * rather than running find-or-create. Carried in the server-side state entry
 * (never a query param) so the browser cannot choose whose account gets linked.
 */
export async function makeState(next = "/", linkUserId?: string): Promise<string> {
  const s = randomBytes(16).toString("hex");
  await redis.set(STATE_KEY(s), JSON.stringify({ next, linkUserId } satisfies StateEntry), "EX", STATE_TTL_SEC);
  return s;
}
// Atomic GET+DEL so a state can only ever be consumed once (single-use), even if
// two callbacks race — done via a tiny Lua eval (matching store.ts's eval style)
// rather than GETDEL so it works regardless of the ioredis client's typed method
// surface.
const CONSUME_STATE_LUA = `local v = redis.call('GET', KEYS[1]); if v then redis.call('DEL', KEYS[1]) end; return v`;
/** Validate + consume a state; returns the stored entry, or null if invalid/expired. */
export async function consumeState(s: string): Promise<StateEntry | null> {
  const raw = (await redis.eval(CONSUME_STATE_LUA, 1, STATE_KEY(s))) as string | null;
  if (raw == null) return null; // missing or expired → fail-closed (login rejected)
  try {
    return JSON.parse(raw) as StateEntry;
  } catch {
    return null;
  }
}

export function isConfigured(p: OAuthProvider): boolean {
  return p === "google" ? features.googleOAuth : p === "facebook" ? features.facebookOAuth : false;
}

/** Build the provider's authorization URL to redirect the user to. */
export function authUrl(p: OAuthProvider, state: string): string {
  if (p === "google") {
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: CALLBACK("google"),
      response_type: "code",
      scope: "openid email profile",
      state,
      access_type: "online",
      prompt: "select_account",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }
  // facebook
  const params = new URLSearchParams({
    client_id: env.FACEBOOK_CLIENT_ID,
    redirect_uri: CALLBACK("facebook"),
    response_type: "code",
    scope: "email public_profile",
    state,
  });
  return `https://www.facebook.com/v19.0/dialog/oauth?${params}`;
}

/** Exchange the authorization code for the user's profile. */
export async function fetchProfile(p: OAuthProvider, code: string): Promise<Profile> {
  if (p === "google") {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: CALLBACK("google"),
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) throw err.badRequest("OAUTH_TOKEN", "Google token exchange failed");
    const { access_token } = (await tokenRes.json()) as { access_token: string };
    const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!infoRes.ok) throw err.badRequest("OAUTH_PROFILE", "Google profile fetch failed");
    const info = (await infoRes.json()) as {
      sub: string;
      email?: string;
      email_verified?: boolean | string; // OIDC userinfo returns a boolean; tolerate the string form too
      name?: string;
      picture?: string;
    };
    // SECURITY: only surface the email as a linkable identity if Google asserts it
    // is verified. Otherwise an attacker who controls an *unverified* Google
    // account whose email string matches a victim's local account could get
    // auto-linked to that victim in findOrCreateOAuthUser (link-by-email). Mirrors
    // the email_verified check on the native ID-token path (verifyGoogleIdToken).
    // Unverified → email = null → a fresh account is created instead of linking.
    const emailVerified = info.email_verified === true || info.email_verified === "true";
    const email = info.email && emailVerified ? info.email : null;
    return { providerId: info.sub, email, name: info.name ?? null, avatar: info.picture ?? null };
  }
  // facebook
  const tokenRes = await fetch(
    `https://graph.facebook.com/v19.0/oauth/access_token?${new URLSearchParams({
      client_id: env.FACEBOOK_CLIENT_ID,
      client_secret: env.FACEBOOK_CLIENT_SECRET,
      redirect_uri: CALLBACK("facebook"),
      code,
    })}`,
  );
  if (!tokenRes.ok) throw err.badRequest("OAUTH_TOKEN", "Facebook token exchange failed");
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const infoRes = await fetch(
    `https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${access_token}`,
  );
  if (!infoRes.ok) throw err.badRequest("OAUTH_PROFILE", "Facebook profile fetch failed");
  const info = (await infoRes.json()) as { id: string; email?: string; name?: string; picture?: { data?: { url?: string } } };
  return { providerId: info.id, email: info.email ?? null, name: info.name ?? null, avatar: info.picture?.data?.url ?? null };
}

/**
 * Verify a Google-issued ID token (native Credential Manager flow) and return
 * the profile it encodes, or throw if the token is invalid/untrustworthy.
 *
 * Verification is delegated to Google's tokeninfo endpoint over HTTPS, which
 * performs the signature check server-side (Google validates the JWT
 * signature against its own rotating keys before returning claims) — this
 * avoids adding a JWKS/JWT-verification dependency. We additionally re-check
 * aud/iss/exp/email_verified ourselves rather than trusting a 200 status
 * alone, since tokeninfo returns 200 for syntactically valid-but-untrusted
 * combinations too.
 *
 * HARDENING NOTE (future): swap this for local JWKS verification
 * (https://www.googleapis.com/oauth2/v3/certs) to remove the network
 * round-trip and the dependency on Google's tokeninfo endpoint staying
 * available; functionally equivalent for now.
 *
 * Exported as its own function (rather than inlined in the route) so tests
 * can stub the network boundary without hitting Google.
 */
type GoogleTokenInfo = {
  sub: string;
  aud: string;
  iss: string;
  exp: string; // seconds-since-epoch, as a string, per Google's tokeninfo response
  email?: string;
  email_verified?: string; // "true" | "false"
  name?: string;
  picture?: string;
};

export async function verifyGoogleIdToken(idToken: string): Promise<Profile> {
  if (!idToken || typeof idToken !== "string") throw err.badRequest("OAUTH_TOKEN", "Missing ID token");

  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
  );
  if (!res.ok) throw err.unauthorized("OAUTH_TOKEN_INVALID", "Google could not verify this token");
  const info = (await res.json()) as GoogleTokenInfo;

  if (info.aud !== env.GOOGLE_CLIENT_ID) {
    throw err.unauthorized("OAUTH_AUDIENCE_MISMATCH", "This token was not issued for this app");
  }
  if (info.iss !== "accounts.google.com" && info.iss !== "https://accounts.google.com") {
    throw err.unauthorized("OAUTH_ISSUER_MISMATCH", "Untrusted token issuer");
  }
  const expSeconds = Number(info.exp);
  if (!Number.isFinite(expSeconds) || expSeconds * 1000 <= Date.now()) {
    throw err.unauthorized("OAUTH_TOKEN_EXPIRED", "This sign-in has expired, please try again");
  }
  if (info.email_verified !== "true") {
    throw err.unauthorized("OAUTH_EMAIL_UNVERIFIED", "Your Google email is not verified");
  }

  return {
    providerId: info.sub,
    email: info.email ?? null,
    name: info.name ?? null,
    avatar: info.picture ?? null,
  };
}

async function uniqueUsername(base: string): Promise<string> {
  const clean = base.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 14) || "player";
  // OAuth must never hard-fail sign-in over a profane provider-derived name —
  // neutralize (fall back to a safe base) rather than reject.
  const safeBase = containsProfanity(clean) ? "player" : clean;
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? safeBase : `${safeBase}${Math.floor(Math.random() * 9999)}`;
    if (!(await prisma.user.findUnique({ where: { username: candidate } }))) return candidate;
  }
  return `player${Date.now().toString().slice(-6)}`;
}
async function uniqueTag(): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const t = randomTag();
    if (!(await prisma.user.findUnique({ where: { tag: t } }))) return t;
  }
  return "#" + Date.now().toString().slice(-4);
}

/**
 * Find or create the user for an OAuth profile:
 *  1. existing OAuthAccount (provider + providerId) → that user
 *  2. else an existing user with the same verified email → link the OAuth account
 *  3. else create a fresh verified user + OAuthAccount
 */
export async function findOrCreateOAuthUser(p: OAuthProvider, profile: Profile): Promise<User> {
  const existing = await prisma.oAuthAccount.findUnique({
    where: { provider_providerId: { provider: p, providerId: profile.providerId } },
    include: { user: true },
  });
  // A soft-deleted account must not be resurrected by signing in with Google.
  // Mirrors the deletedAt check in service.login: every downstream layer
  // (requireAuth, the socket guard, rotateSession) already rejects on deletedAt,
  // so without this the caller is handed a session that is instantly denied —
  // "signed in" and immediately signed out, with no way to recover.
  if (existing?.user.deletedAt) throw err.unauthorized("ACCOUNT_DELETED", "This account has been deleted.");
  if (existing) return existing.user;

  if (profile.email) {
    const byEmail = await prisma.user.findUnique({ where: { email: profile.email.toLowerCase() } });
    // Do NOT link a fresh OAuth identity onto a soft-deleted account — that
    // would silently revive it. The address frees up when the purge job runs.
    if (byEmail?.deletedAt) throw err.unauthorized("ACCOUNT_DELETED", "This account has been deleted.");
    if (byEmail) {
      await prisma.oAuthAccount.create({ data: { provider: p, providerId: profile.providerId, userId: byEmail.id } });
      return byEmail;
    }
  }

  const username = await uniqueUsername(profile.name ?? (profile.email?.split("@")[0] ?? "player"));
  // Same neutralize-not-reject rule for the display name shown to other players:
  // a profane provider-supplied name falls back to the (already-sanitized) username.
  const safeDisplayName =
    profile.name && !containsProfanity(profile.name) ? profile.name : username;
  const user = await prisma.user.create({
    data: {
      email: profile.email?.toLowerCase() ?? null,
      emailVerified: profile.email ? new Date() : null, // OAuth email is provider-verified
      username,
      displayName: safeDisplayName,
      tag: await uniqueTag(),
      avatarUrl: profile.avatar ?? null,
      oauthAccounts: { create: { provider: p, providerId: profile.providerId } },
    },
  });
  // Grant free starter cosmetics (board/skin/avatars/emotes) — email signup does
  // this via register(); OAuth fresh signups must too, or they get nothing.
  await grantDefaults(prisma, user.id);
  return user;
}
