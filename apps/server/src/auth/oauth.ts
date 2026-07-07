import { randomBytes } from "node:crypto";
import type { User } from "@prisma/client";
import { prisma } from "../db/client.js";
import { env, features } from "../config/env.js";
import { randomTag } from "./tokens.js";
import { err } from "../lib/errors.js";

/**
 * OAuth 2.0 (Google / Facebook) — authorization-code flow.
 *
 * 1. /api/auth/oauth/:provider          → redirect to the provider's consent screen
 * 2. /api/auth/oauth/:provider/callback → exchange code → profile → find/link/create
 *    user → issue our own session (same cookies as email login).
 *
 * A short-lived signed `state` guards against CSRF. Providers with no configured
 * credentials return a "not configured" error (the button is disabled anyway).
 */

export type OAuthProvider = "google" | "facebook";

type Profile = { providerId: string; email: string | null; name: string | null; avatar: string | null };

const CALLBACK = (p: OAuthProvider) => `${env.OAUTH_CALLBACK_BASE}/api/auth/oauth/${p}/callback`;

// Ephemeral CSRF state store (in-memory; fine for single instance). Each state
// carries its expiry and the post-login `next` path the user was headed to, so
// the callback can return them there instead of always landing on home.
type StateEntry = { exp: number; next: string };
const stateStore = new Map<string, StateEntry>();
export function makeState(next = "/"): string {
  const s = randomBytes(16).toString("hex");
  stateStore.set(s, { exp: Date.now() + 10 * 60 * 1000, next });
  return s;
}
/** Validate + consume a state; returns the stored `next` path, or null if invalid. */
export function consumeState(s: string): string | null {
  const entry = stateStore.get(s);
  stateStore.delete(s);
  return entry && entry.exp > Date.now() ? entry.next : null;
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
    const info = (await infoRes.json()) as { sub: string; email?: string; name?: string; picture?: string };
    return { providerId: info.sub, email: info.email ?? null, name: info.name ?? null, avatar: info.picture ?? null };
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

async function uniqueUsername(base: string): Promise<string> {
  const clean = base.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 14) || "player";
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? clean : `${clean}${Math.floor(Math.random() * 9999)}`;
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
  if (existing) return existing.user;

  if (profile.email) {
    const byEmail = await prisma.user.findUnique({ where: { email: profile.email.toLowerCase() } });
    if (byEmail) {
      await prisma.oAuthAccount.create({ data: { provider: p, providerId: profile.providerId, userId: byEmail.id } });
      return byEmail;
    }
  }

  const username = await uniqueUsername(profile.name ?? (profile.email?.split("@")[0] ?? "player"));
  const user = await prisma.user.create({
    data: {
      email: profile.email?.toLowerCase() ?? null,
      emailVerified: profile.email ? new Date() : null, // OAuth email is provider-verified
      username,
      displayName: profile.name ?? username,
      tag: await uniqueTag(),
      avatarUrl: profile.avatar ?? null,
      oauthAccounts: { create: { provider: p, providerId: profile.providerId } },
    },
  });
  return user;
}
