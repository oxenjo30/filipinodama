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
import { type OAuthProvider, isConfigured, makeState, consumeState, authUrl, fetchProfile, findOrCreateOAuthUser } from "./oauth.js";

const verifySchema = z.object({ token: z.string().min(1) });
const forgotSchema = z.object({ email: z.string().email() });
const resetSchema = z.object({ token: z.string().min(1), password: z.string().min(8).max(72) });

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
    return ok({ user: svc.publicUser(user) });
  });

  // Only allow returning to a same-origin relative path (guards against an
  // open redirect via a crafted ?next=). Anything else falls back to home.
  const safeNext = (n: unknown): string =>
    typeof n === "string" && n.startsWith("/") && !n.startsWith("//") ? n : "/";

  // GET /api/auth/oauth/:provider → redirect to the provider's consent screen
  app.get<{ Params: { provider: string }; Querystring: { next?: string } }>("/oauth/:provider", async (req, reply) => {
    const p = req.params.provider as OAuthProvider;
    if (p !== "google" && p !== "facebook") throw new ApiError(404, "UNKNOWN_PROVIDER", "Unknown provider");
    if (!isConfigured(p)) throw new ApiError(503, "NOT_CONFIGURED", `${p} sign-in is not configured yet`);
    const state = makeState(safeNext(req.query.next));
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
      // consumeState returns the stored `next` path (or null if invalid/expired).
      const next = code && state ? consumeState(state) : null;
      if (!code || !state || next === null) return fail("Sign-in expired, please try again");
      try {
        const profile = await fetchProfile(p, code);
        const user = await findOrCreateOAuthUser(p, profile);
        await issueSession(reply, req, user);
        return reply.redirect(`${env.WEB_ORIGIN}${safeNext(next)}`);
      } catch {
        return fail("Sign-in failed, please try again");
      }
    },
  );

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
    });
  });
}
