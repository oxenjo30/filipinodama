import type { FastifyInstance } from "fastify";
import { registerSchema, loginSchema } from "@dama/shared";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { ok, ApiError, fail } from "../lib/errors.js";
import { features } from "../config/env.js";
import { attachUser, requireAuth } from "./guards.js";
import { signAccess, COOKIE, cookieOpts, ttlToMs } from "./tokens.js";
import { env } from "../config/env.js";
import * as svc from "./service.js";

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

export async function authRoutes(app: FastifyInstance) {
  // POST /api/auth/register
  app.post("/register", async (req, reply) => {
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

  // POST /api/auth/login
  app.post("/login", async (req, reply) => {
    const input = loginSchema.parse(req.body);
    const user = await svc.login(prisma, input);
    await issueSession(reply, req, user);
    return ok({ user: svc.publicUser(user) });
  });

  // POST /api/auth/guest
  app.post("/guest", async (req, reply) => {
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
  app.post("/logout", async (req, reply) => {
    await svc.endSession(prisma, (req.cookies as any)?.[COOKIE.refresh]);
    reply.clearCookie(COOKIE.access, { path: "/" }).clearCookie(COOKIE.refresh, { path: "/" });
    return ok({ loggedOut: true });
  });

  // POST /api/auth/password/forgot
  app.post("/password/forgot", async (req) => {
    const { email } = forgotSchema.parse(req.body);
    await svc.requestPasswordReset(prisma, email);
    return ok({ sent: true }); // always ok (no email enumeration)
  });

  // POST /api/auth/password/reset
  app.post("/password/reset", async (req) => {
    const { token, password } = resetSchema.parse(req.body);
    await svc.resetPassword(prisma, token, password);
    return ok({ reset: true });
  });

  // GET /api/auth/me
  app.get("/me", { preHandler: requireAuth }, async (req) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) return fail("NOT_FOUND", "User not found");
    return ok({ user: svc.publicUser(user) });
  });

  // GET /api/auth/oauth/:provider  — real flow needs creds; honest 503 otherwise
  app.get<{ Params: { provider: string } }>("/oauth/:provider", async (req) => {
    const p = req.params.provider;
    const configured = p === "google" ? features.googleOAuth : p === "facebook" ? features.facebookOAuth : false;
    if (!configured) throw new ApiError(503, "NOT_CONFIGURED", `${p} sign-in is not configured yet`);
    // OAuth redirect implemented once creds are provided (M2 follow-up).
    throw new ApiError(501, "NOT_IMPLEMENTED", `${p} OAuth redirect pending credential setup`);
  });

  // expose which login methods are live so the client can enable/disable buttons
  app.get("/providers", async (req) => {
    attachUser(req);
    return ok({
      email: true,
      guest: true,
      google: features.googleOAuth,
      facebook: features.facebookOAuth,
      emailDelivery: features.email,
    });
  });
}
