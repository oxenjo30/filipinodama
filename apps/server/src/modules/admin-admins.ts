import type { FastifyInstance } from "fastify";
import type { AdminRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { requireAdmin } from "../auth/guards.js";
import { audit } from "../lib/audit.js";

const ROLES = ["SUPPORT", "MODERATOR", "ECONOMY", "SUPERADMIN"] as const;

// Arbitrary fixed key for pg_advisory_xact_lock — any 64-bit int works, it just
// needs to be the same constant every call so all setRoleGuarded() invocations
// serialize against each other process-wide.
const SUPERADMIN_LOCK_KEY = 918_273_645n;

/**
 * Atomic set-or-reject that never leaves zero superadmins. Returns rows affected.
 *
 * A single-statement `UPDATE ... WHERE id = target AND (SELECT count(*) ...) > 1`
 * is NOT sufficient on its own: it only guards concurrent writers that target the
 * SAME row (row-level locking serializes those). Two concurrent calls demoting
 * TWO DIFFERENT superadmin rows don't lock each other out — each statement's
 * correlated COUNT subquery takes its own snapshot under READ COMMITTED, both can
 * see the pre-demotion count of 2, both evaluate their WHERE to true, and both
 * commit, leaving zero superadmins. (Verified: this raced consistently in testing
 * before the lock was added.)
 *
 * The fix: take a transaction-scoped Postgres advisory lock BEFORE the
 * count-check-and-update, inside an explicit transaction. `pg_advisory_xact_lock`
 * blocks the second concurrent caller until the first caller's transaction
 * commits (and releases the lock), so the second caller's COUNT is guaranteed to
 * observe the first caller's already-committed write. This serializes every
 * demote/grant against every other one, which is intentionally conservative
 * (a global lock, not per-row) — role changes are rare admin actions, so the
 * throughput cost is irrelevant next to correctness.
 */
export async function setRoleGuarded(targetId: string, newRole: AdminRole | null): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SUPERADMIN_LOCK_KEY})`;
    // IS DISTINCT FROM (not <>) — a target with adminRole = NULL (a fresh grant
    // to a non-admin) must always be allowed through; plain `<>` yields
    // NULL/unknown against a NULL column under three-valued SQL logic, which
    // would wrongly fall through to the count-guard and reject ordinary grants
    // when only 1 superadmin exists.
    return tx.$executeRaw`
      UPDATE "User" SET "adminRole" = ${newRole}::"AdminRole"
      WHERE id = ${targetId}
        AND ("adminRole" IS DISTINCT FROM 'SUPERADMIN'
             OR (SELECT count(*) FROM "User" WHERE "adminRole" = 'SUPERADMIN' AND "deletedAt" IS NULL) > 1)`;
  });
}

export async function adminAdminsRoutes(app: FastifyInstance) {
  app.get("/admin/admins", { preHandler: requireAdmin("SUPERADMIN") }, async () => {
    const rows = await prisma.user.findMany({
      where: { adminRole: { not: null } },
      select: {
        id: true,
        username: true,
        tag: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        adminRole: true,
        lastSeenAt: true,
      },
      orderBy: { adminRole: "asc" },
    });
    const byRole: Record<string, number> = { SUPPORT: 0, MODERATOR: 0, ECONOMY: 0, SUPERADMIN: 0 };
    for (const r of rows) if (r.adminRole) byRole[r.adminRole] += 1;
    return ok({ items: rows, stats: { byRole, total: rows.length } });
  });

  app.post("/admin/admins/grant", { preHandler: requireAdmin("SUPERADMIN") }, async (req) => {
    const { query, role } = z.object({ query: z.string().trim().min(1), role: z.enum(ROLES) }).parse(req.body);
    const matches = await prisma.user.findMany({
      where: {
        deletedAt: null,
        OR: [
          { email: { equals: query, mode: "insensitive" } },
          { id: query },
          ...(query.includes("#")
            ? [
                {
                  AND: [
                    { username: { equals: query.split("#")[0], mode: "insensitive" as const } },
                    { tag: `#${query.split("#")[1]}` },
                  ],
                },
              ]
            : [{ username: { equals: query, mode: "insensitive" as const } }]),
        ],
      },
      select: { id: true, adminRole: true },
      take: 2,
    });
    if (matches.length === 0) throw err.notFound("NO_USER", "No matching user");
    if (matches.length > 1) throw err.badRequest("AMBIGUOUS", "Multiple users match — use an email or id");
    const target = matches[0]!;
    if (target.id === req.userId) throw err.badRequest("SELF_ADMIN_CHANGE", "You can't change your own admin role");
    const before = target.adminRole;
    const n = await setRoleGuarded(target.id, role);
    if (n === 0) throw err.badRequest("LAST_SUPERADMIN", "Cannot remove the last superadmin");
    await audit(prisma, {
      actorId: req.userId!,
      action: "admin.grant",
      targetType: "user",
      targetId: target.id,
      before: { adminRole: before },
      after: { adminRole: role },
    });
    return ok({ id: target.id, role });
  });

  app.post<{ Params: { id: string } }>(
    "/admin/admins/:id/revoke",
    { preHandler: requireAdmin("SUPERADMIN") },
    async (req) => {
      const { reason } = z.object({ reason: z.string().trim().min(1).max(500) }).parse(req.body);
      if (req.params.id === req.userId) throw err.badRequest("SELF_ADMIN_CHANGE", "You can't change your own admin role");
      const before = await prisma.user.findUnique({ where: { id: req.params.id }, select: { adminRole: true } });
      if (!before) throw err.notFound("NO_USER", "Admin not found");
      const n = await setRoleGuarded(req.params.id, null);
      if (n === 0) throw err.badRequest("LAST_SUPERADMIN", "Cannot remove the last superadmin");
      await audit(prisma, {
        actorId: req.userId!,
        action: "admin.revoke",
        targetType: "user",
        targetId: req.params.id,
        before,
        after: { adminRole: null },
        reason,
      });
      return ok({ id: req.params.id, role: null });
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/admin/admins/:id/role",
    { preHandler: requireAdmin("SUPERADMIN") },
    async (req) => {
      const { role } = z.object({ role: z.enum(ROLES) }).parse(req.body);
      if (req.params.id === req.userId) throw err.badRequest("SELF_ADMIN_CHANGE", "You can't change your own admin role");
      const before = await prisma.user.findUnique({ where: { id: req.params.id }, select: { adminRole: true } });
      if (!before) throw err.notFound("NO_USER", "Admin not found");
      const n = await setRoleGuarded(req.params.id, role);
      if (n === 0) throw err.badRequest("LAST_SUPERADMIN", "Cannot remove the last superadmin");
      await audit(prisma, {
        actorId: req.userId!,
        action: "admin.role",
        targetType: "user",
        targetId: req.params.id,
        before,
        after: { adminRole: role },
      });
      return ok({ id: req.params.id, role });
    },
  );
}
