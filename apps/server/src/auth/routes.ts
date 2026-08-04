import type { FastifyInstance } from "fastify";
import { registerSchema, loginSchema } from "@dama/shared";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { ok, ApiError, fail } from "../lib/errors.js";
import { features } from "../config/env.js";
import { attachUser, requireAuth } from "./guards.js";
import { audit } from "../lib/audit.js";
import { signAccess, COOKIE, cookieOpts, clearCookieOpts, ttlToMs } from "./tokens.js";
import { env } from "../config/env.js";
import * as svc from "./service.js";
import {
  type OAuthProvider,
  isConfigured,
  makeState,
  consumeState,
  authUrl,
  fetchProfile,
  findOrCreateOAuthUser,
  verifyGoogleIdToken,
} from "./oauth.js";

const verifySchema = z.object({ token: z.string().min(1) });
const forgotSchema = z.object({ email: z.string().email() });
const resetSchema = z.object({ token: z.string().min(1), password: z.string().min(8).max(72) });
const googleTokenSchema = z.object({ idToken: z.string().min(1) });

// currentPassword is OPTIONAL at the schema level because OAuth-only accounts
// have no password to supply; requestEmailChange decides whether one is
// required, based on whether the account actually has a passwordHash.
const emailChangeSchema = z.object({
  newEmail: z.string().email().max(200),
  currentPassword: z.string().min(1).max(200).optional(),
});
const emailConfirmSchema = z.object({ token: z.string().min(1).max(200) });
const linkSchema = z.object({ idToken: z.string().min(1), currentPassword: z.string().min(1).max(200).optional() });
const unlinkSchema = z.object({ currentPassword: z.string().min(1).max(200).optional() }).optional();
const reauthSchema = z.object({ currentPassword: z.string().min(1).max(200).optional() });

const accessMs = ttlToMs(env.JWT_ACCESS_TTL);
const refreshMs = ttlToMs(env.JWT_REFRESH_TTL);

/** Set both auth cookies for a freshly authenticated user. */
async function issueSession(reply: any, req: any, user: any) {
  const refresh = await svc.startSession(prisma, user.id, req.headers["user-agent"]);
  const access = signAccess({ sub: user.id, isGuest: user.isGuest, adminRole: user.adminRole });
  reply
    .setCookie(COOKIE.access, access, cookieOpts(accessMs))
    .setCookie(COOKIE.refresh, refresh, cookieOpts(refreshMs));
}

/**
 * Strict per-route throttle for credential/abuse-prone endpoints, keyed by IP.
 * Layered ON TOP of the global 300/min limit registered in index.ts. Brute-force
 * on login, account/guest creation spam, and reset-email flooding are the risks.
 */
const strictLimit = (max: number, timeWindow: string) => ({
  config: { rateLimit: { max, timeWindow } },
});

export async function authRoutes(app: FastifyInstance) {
  // POST /api/auth/register
  app.post("/register", strictLimit(10, "10 minutes"), async (req, reply) => {
    const input = registerSchema.parse(req.body);
    const user = await svc.register(prisma, input);
    await issueSession(reply, req, user);
    return ok({ user: svc.publicUser(user), needsVerification: true, emailConfigured: features.email });
  });

  // POST /api/auth/verify
  app.post("/verify", async (req) => {
    const { token } = verifySchema.parse(req.body);
    const user = await svc.verifyEmail(prisma, token);
    return ok({ user: svc.publicUser(user) });
  });

  // POST /api/auth/login — tight limit: online password guessing defense.
  app.post("/login", strictLimit(10, "5 minutes"), async (req, reply) => {
    const input = loginSchema.parse(req.body);
    const user = await svc.login(prisma, input);
    await issueSession(reply, req, user);
    return ok({ user: svc.publicUser(user) });
  });

  // POST /api/auth/guest — cap mass guest-account creation from one IP.
  app.post("/guest", strictLimit(20, "10 minutes"), async (req, reply) => {
    const user = await svc.createGuest(prisma);
    await issueSession(reply, req, user);
    return ok({ user: svc.publicUser(user) });
  });

  // POST /api/auth/refresh  (rotate)
  app.post("/refresh", async (req, reply) => {
    const old = (req.cookies as any)?.[COOKIE.refresh];
    const { user, refreshToken } = await svc.rotateSession(prisma, old, req.headers["user-agent"]);
    const access = signAccess({ sub: user.id, isGuest: user.isGuest, adminRole: user.adminRole });
    reply
      .setCookie(COOKIE.access, access, cookieOpts(accessMs))
      .setCookie(COOKIE.refresh, refreshToken, cookieOpts(refreshMs));
    return ok({ user: svc.publicUser(user) });
  });

  // POST /api/auth/logout
  //
  // Shared by every session (player + admin) — this IS the "Sign out" the admin
  // v3 header account menu calls (⎋ Sign out → real session end, per the
  // handoff's acctSignOut()). If the signed-out account is an admin, write the
  // session.signout audit row here (not client-side — the client can't be
  // trusted to self-report). attachUser is safe on an anonymous caller too (it
  // does not reject), so this never blocks a normal player logout.
  app.post("/logout", { preHandler: attachUser }, async (req, reply) => {
    if (req.userId && req.adminRole) {
      // Best-effort: an audit-insert failure must NEVER block the sign-out —
      // otherwise the route 500s before endSession/clearCookie and the "signed
      // out" admin still holds valid server-side cookies.
      try {
        await audit(prisma, { actorId: req.userId, action: "session.signout", targetType: "user", targetId: req.userId });
      } catch {
        req.log?.warn?.("session.signout audit write failed (logout proceeds)");
      }
    }
    await svc.endSession(prisma, (req.cookies as any)?.[COOKIE.refresh]);
    reply.clearCookie(COOKIE.access, clearCookieOpts()).clearCookie(COOKIE.refresh, clearCookieOpts());
    return ok({ loggedOut: true });
  });

  // POST /api/auth/password/forgot — cap reset-email flooding (Resend cost + inbox abuse).
  app.post("/password/forgot", strictLimit(5, "15 minutes"), async (req) => {
    const { email } = forgotSchema.parse(req.body);
    await svc.requestPasswordReset(prisma, email);
    return ok({ sent: true }); // always ok (no email enumeration)
  });

  // POST /api/auth/password/reset — cap token-guessing.
  app.post("/password/reset", strictLimit(10, "15 minutes"), async (req) => {
    const { token, password } = resetSchema.parse(req.body);
    await svc.resetPassword(prisma, token, password);
    return ok({ reset: true });
  });

  // GET /api/auth/me — the app's boot "who am I" probe.
  //
  // Optional auth: a signed-in caller gets their user; an anonymous caller gets
  // { user: null } with 200 (NOT a 401). This is deliberate — the client calls
  // this on every load to hydrate the session, and a logged-out visit is a normal
  // state, not an error. Returning 401 here made the browser log a console error
  // (and triggered a needless refresh attempt) on every logged-out page load,
  // violating the "no console errors" bar.
  app.get("/me", { preHandler: attachUser }, async (req) => {
    if (!req.userId) return ok({ user: null });
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user || user.deletedAt) return ok({ user: null });
    // `account` rides along on the call BOTH clients already make at start-up
    // and after every auth action, so the Account screen shows identical state
    // on web and Android without either client deriving it locally.
    return ok({ user: svc.publicUser(user), account: await svc.accountState(prisma, user.id) });
  });

  // ── Account: change email (STAGED) ──────────────────────────────────────────
  // Two steps on purpose. The new address is parked on the user until its owner
  // clicks the emailed link; only then does it replace `email`. Applying it
  // immediately would let a hijacked session move the account to an address the
  // real owner does not control — and would silently rewire Google sign-in,
  // which links an OAuth identity BY EMAIL.
  app.post("/email/change", { preHandler: requireAuth, ...strictLimit(5, "15 minutes") }, async (req) => {
    const { newEmail, currentPassword } = emailChangeSchema.parse(req.body);
    const res = await svc.requestEmailChange(prisma, req.userId!, newEmail, currentPassword);
    await audit(prisma, { actorId: req.userId!, action: "auth.email.change_requested", targetType: "user", targetId: req.userId! });
    return ok(res);
  });

  // Unauthenticated ON PURPOSE: the confirmation is usually opened in whichever
  // browser holds the NEW mailbox, where there is no session. The single-use,
  // one-hour token is the credential.
  app.post("/email/confirm", strictLimit(10, "15 minutes"), async (req) => {
    const { token } = emailConfirmSchema.parse(req.body);
    const res = await svc.confirmEmailChange(prisma, token);
    return ok(res);
  });

  // Proves the browser still holds the password, for the ~5 minutes it takes to
  // bounce through Google's consent screen. The redirect flow cannot carry a
  // password, so this is how it gets the same gate the native route applies
  // inline. See svc.markReauthenticated / consumeReauth.
  app.post("/reauth", { preHandler: requireAuth, ...strictLimit(10, "15 minutes") }, async (req) => {
    const { currentPassword } = reauthSchema.parse(req.body ?? {});
    return ok(await svc.markReauthenticated(prisma, req.userId!, currentPassword));
  });

  // ── Account: connect / disconnect Google ────────────────────────────────────
  // Same ID-token verification as native sign-in, but bound to the CURRENT
  // session instead of find-or-create. Without it, a player whose Google address
  // differs from their account email silently ends up with a SECOND account.
  app.post("/link/google", { preHandler: requireAuth, ...strictLimit(10, "15 minutes") }, async (req) => {
    if (!isConfigured("google")) throw new ApiError(503, "NOT_CONFIGURED", "Google sign-in is not configured yet");
    const { idToken, currentPassword } = linkSchema.parse(req.body);
    const profile = await verifyGoogleIdToken(idToken);
    const res = await svc.linkOAuthAccount(prisma, req.userId!, "google", profile.providerId, currentPassword);
    await audit(prisma, { actorId: req.userId!, action: "auth.oauth.linked", targetType: "user", targetId: req.userId!, after: { provider: "google" } });
    return ok({ ...res, account: await svc.accountState(prisma, req.userId!) });
  });

  app.delete("/link/google", { preHandler: requireAuth, ...strictLimit(10, "15 minutes") }, async (req) => {
    const body = unlinkSchema.parse(req.body);
    const res = await svc.unlinkOAuthAccount(prisma, req.userId!, "google", body?.currentPassword);
    await audit(prisma, { actorId: req.userId!, action: "auth.oauth.unlinked", targetType: "user", targetId: req.userId!, before: { provider: "google" } });
    return ok({ ...res, account: await svc.accountState(prisma, req.userId!) });
  });

  // Only allow returning to a same-origin relative path (guards against an
  // open redirect via a crafted ?next=). Anything else falls back to home.
  const safeNext = (n: unknown): string =>
    typeof n === "string" && n.startsWith("/") && !n.startsWith("//") ? n : "/";

  // GET /api/auth/oauth/:provider → redirect to the provider's consent screen
  app.get<{ Params: { provider: string }; Querystring: { next?: string; link?: string } }>("/oauth/:provider", async (req, reply) => {
    const p = req.params.provider as OAuthProvider;
    if (p !== "google" && p !== "facebook") throw new ApiError(404, "UNKNOWN_PROVIDER", "Unknown provider");
    if (!isConfigured(p)) throw new ApiError(503, "NOT_CONFIGURED", `${p} sign-in is not configured yet`);
    // ?link=1 from a SIGNED-IN player means "attach this provider to my
    // account", not "sign me in". The intent is stored server-side in the state
    // entry, never in a query param, so the browser cannot pick whose account
    // gets linked.
    await attachUser(req);
    let linkUserId: string | undefined;
    if (req.query.link === "1") {
      // FAIL CLOSED. Previously a link request with an expired 15-minute access
      // cookie silently became a normal SIGN-IN: the player pressed "Connect" and
      // was instead logged in as whichever Google account they picked — on a
      // shared device, somebody else's. Refuse instead of guessing.
      if (!req.userId)
        return reply.redirect(
          `${env.WEB_ORIGIN}/settings?linkError=${encodeURIComponent("Your session expired. Sign in again, then reconnect Google.")}`,
        );
      // Linking is only wired for Google (only Google can be unlinked, and only
      // Google is rendered). A facebook link would be invisible and permanent.
      if (p !== "google")
        return reply.redirect(
          `${env.WEB_ORIGIN}/settings?linkError=${encodeURIComponent("Only Google can be connected right now.")}`,
        );
      // Re-authentication marker, set by POST /api/auth/reauth in the last 5
      // minutes. A password cannot ride through an OAuth redirect, so this is
      // how the redirect path gets the same re-auth the native route enforces
      // directly — without it, a stolen session alone could mint a permanent
      // new sign-in credential.
      if (!(await svc.consumeReauth(req.userId)))
        return reply.redirect(
          `${env.WEB_ORIGIN}/settings?linkError=${encodeURIComponent("Confirm your password before connecting Google.")}`,
        );
      linkUserId = req.userId;
    }
    const state = await makeState(safeNext(req.query.next), linkUserId);
    reply.redirect(authUrl(p, state));
  });

  // GET /api/auth/oauth/:provider/callback → exchange code, sign in, redirect to app
  app.get<{ Params: { provider: string }; Querystring: { code?: string; state?: string; error?: string } }>(
    "/oauth/:provider/callback",
    async (req, reply) => {
      const p = req.params.provider as OAuthProvider;
      const { code, state, error } = req.query;
      const fail = (msg: string) => reply.redirect(`${env.WEB_ORIGIN}/login?error=${encodeURIComponent(msg)}`);
      if (p !== "google" && p !== "facebook") return fail("Unknown provider");
      if (!isConfigured(p)) return fail(`${p} sign-in is not configured`);
      if (error) return fail("Sign-in was cancelled");
      // consumeState returns the stored entry (or null if invalid/expired).
      const entry = code && state ? await consumeState(state) : null;
      if (!code || !state || entry === null) return fail("Sign-in expired, please try again");
      const next = entry.next;
      try {
        const profile = await fetchProfile(p, code);

        // LINK path: attach this identity to the account that started the flow,
        // instead of find-or-create. Deliberately does NOT issue a new session —
        // the player is already signed in, and re-issuing would let a stale tab
        // silently swap identities.
        if (entry.linkUserId) {
          // The state entry says WHO started the link, but the person coming
          // back from Google must be that same signed-in user. Without this
          // check an attacker who obtained a state value (or replayed a link
          // they started) could attach an identity to a session that is not
          // theirs — the state alone was being treated as authorisation.
          await attachUser(req);
          if (req.userId !== entry.linkUserId)
            return reply.redirect(
              `${env.WEB_ORIGIN}/settings?linkError=${encodeURIComponent("Sign in again, then reconnect Google.")}`,
            );
          try {
            await svc.linkOAuthAccount(prisma, entry.linkUserId, p, profile.providerId);
            await audit(prisma, {
              actorId: entry.linkUserId,
              action: "auth.oauth.linked",
              targetType: "user",
              targetId: entry.linkUserId,
              after: { provider: p, via: "redirect" },
            });
          } catch (e) {
            const msg = e instanceof ApiError ? e.message : "Could not connect that account";
            return reply.redirect(`${env.WEB_ORIGIN}/settings?linkError=${encodeURIComponent(msg)}`);
          }
          return reply.redirect(`${env.WEB_ORIGIN}/settings?linked=${p}`);
        }

        const user = await findOrCreateOAuthUser(p, profile);
        await issueSession(reply, req, user);
        return reply.redirect(`${env.WEB_ORIGIN}${safeNext(next)}`);
      } catch {
        return fail("Sign-in failed, please try again");
      }
    },
  );

  // POST /api/auth/oauth/google/token — native (Android Credential Manager) Google
  // sign-in. The client already holds a Google-issued ID token (no redirect/code
  // exchange needed); we verify it server-side, then run the SAME
  // find-or-create-user logic as the web redirect callback and issue the SAME
  // session cookies. Rate-limited like the other credential-adjacent auth routes.
  app.post("/oauth/google/token", strictLimit(10, "5 minutes"), async (req, reply) => {
    if (!isConfigured("google")) throw new ApiError(503, "NOT_CONFIGURED", "Google sign-in is not configured yet");
    const { idToken } = googleTokenSchema.parse(req.body);
    const profile = await verifyGoogleIdToken(idToken);
    const user = await findOrCreateOAuthUser("google", profile);
    await issueSession(reply, req, user);
    return ok({ user: svc.publicUser(user) });
  });

  // expose which login methods are live so the client can enable/disable buttons
  app.get("/providers", async (req) => {
    await attachUser(req);
    return ok({
      email: true,
      guest: true,
      google: features.googleOAuth,
      facebook: features.facebookOAuth,
      emailDelivery: features.email,
      // Real-money diamond top-up availability (default OFF → gold-only store).
      // Drives whether the client shows the buy-diamonds UI / nav diamond pill.
      diamondTopUp: features.payments,
      // Public OAuth client ID, shared verbatim with every client (web + Android)
      // per the owner's shared-credentials directive — no mobile-specific keys.
      // Client IDs are public identifiers (not secrets; this is the same value
      // Google's ID token `aud` claim already contains), so exposing it here is
      // safe. null when the feature is off, so callers don't have to also check
      // `google` before trusting this value.
      googleClientId: features.googleOAuth ? env.GOOGLE_CLIENT_ID : null,
    });
  });
}
