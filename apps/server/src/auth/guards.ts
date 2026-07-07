import type { FastifyReply, FastifyRequest } from "fastify";
import type { AdminRole } from "@prisma/client";
import { verifyAccess, COOKIE } from "./tokens.js";
import { err } from "../lib/errors.js";

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
    isGuest?: boolean;
    adminRole?: AdminRole | null;
  }
}

/** Populate req.userId from the access cookie (or Bearer). Does NOT reject. */
export function attachUser(req: FastifyRequest) {
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

/** Route preHandler: require an authenticated user. */
export async function requireAuth(req: FastifyRequest, _reply: FastifyReply) {
  attachUser(req);
  if (!req.userId) throw err.unauthorized();
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
    attachUser(req);
    if (!req.userId) throw err.unauthorized();
    if (!req.adminRole || RANK[req.adminRole] < RANK[min]) {
      throw err.forbidden("ADMIN_FORBIDDEN", `requires ${min} admin role`);
    }
  };
}
