import type { FastifyReply, FastifyRequest } from "fastify";
import type { AdminRole } from "@prisma/client";
import { prisma } from "../db/client.js";
import { verifyAccess, COOKIE } from "./tokens.js";
import { err } from "../lib/errors.js";

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
    isGuest?: boolean;
    adminRole?: AdminRole | null;
  }
}

/**
 * Populate req.userId from the access cookie (or Bearer). Does NOT reject —
 * anonymous callers pass through with req.userId undefined.
 *
 * Signature note: this is used both as a Fastify `preHandler` (arity-2 async so
 * Fastify awaits it and does not wait for a `done` callback) and called directly
 * from requireAuth/requireAdmin. The body is synchronous; `async` only shapes the
 * return type for Fastify's hook runner.
 */
export async function attachUser(req: FastifyRequest, _reply?: FastifyReply) {
  const cookie = (req.cookies as Record<string, string | undefined>)?.[COOKIE.access];
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : undefined;
  const token = cookie ?? bearer;
  if (!token) return;
  try {
    const claims = verifyAccess(token);
    req.userId = claims.sub;
    req.isGuest = claims.isGuest;
    req.adminRole = (claims.adminRole as AdminRole | undefined) ?? null;
  } catch {
    /* invalid/expired ⇒ treated as anonymous */
  }
}

/**
 * Route preHandler: require an authenticated, non-banned, non-deleted user.
 * The JWT alone isn't enough — a ban/delete after login must take effect on the
 * next request, so we load the user's live status and reject it here.
 */
export async function requireAuth(req: FastifyRequest, _reply: FastifyReply) {
  await attachUser(req);
  if (!req.userId) throw err.unauthorized();
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, deletedAt: true, bannedUntil: true, adminRole: true },
  });
  if (!user || user.deletedAt) throw err.unauthorized("ACCOUNT_GONE", "This account no longer exists");
  if (user.bannedUntil && user.bannedUntil > new Date())
    throw err.forbidden("BANNED", "This account is suspended");
  // keep the request's admin role fresh from the DB (not the possibly-stale JWT)
  req.adminRole = user.adminRole;
}

/** AdminRole hierarchy: higher tiers satisfy lower requirements. */
const RANK: Record<AdminRole, number> = {
  SUPPORT: 1,
  MODERATOR: 2,
  ECONOMY: 3,
  SUPERADMIN: 4,
};

/**
 * Route preHandler factory: require at least `min` admin role.
 * Enforced server-side — a SUPPORT token cannot reach an ECONOMY route.
 * (ADMIN_DASHBOARD.md §1 role matrix.)
 */
export function requireAdmin(min: AdminRole) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    await attachUser(req);
    if (!req.userId) throw err.unauthorized();
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { deletedAt: true, bannedUntil: true, adminRole: true },
    });
    if (!user || user.deletedAt) throw err.unauthorized("ACCOUNT_GONE", "This account no longer exists");
    // DB role is authoritative — ignore the token's adminRole.
    req.adminRole = user.adminRole;
    if (!user.adminRole || RANK[user.adminRole] < RANK[min]) throw err.forbidden("ADMIN_FORBIDDEN", `requires ${min} admin role`);
    // Active ban locks out everyone EXCEPT a superadmin (so the top account can't self-brick).
    const banned = user.bannedUntil && user.bannedUntil > new Date();
    if (banned && user.adminRole !== "SUPERADMIN") throw err.forbidden("ADMIN_BANNED", "This admin account is suspended");
  };
}
