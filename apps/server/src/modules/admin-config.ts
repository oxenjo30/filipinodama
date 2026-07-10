import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { requireAdmin } from "../auth/guards.js";
import { audit } from "../lib/audit.js";
import { invalidateConfig } from "../lib/config-service.js";
import { env } from "../config/env.js";

/**
 * Settings/config section — /api/admin/config* (SUPERADMIN-gated) plus an
 * UNAUTHENTICATED player-safe subset at /api/config/public.
 *
 * LOCKED_KEYS is a server-side deny-list checked FIRST in the PATCH handler —
 * before any lookup/update — so an admin can't bypass a disabled UI input by
 * PATCHing the key directly. DIAMOND_TOPUP_ENABLED is env-governed (never a
 * writable Config row) per the gold-only-economy decision.
 *
 * PUBLIC_CONFIG_KEYS is a hard-coded per-key ALLOW-LIST, NOT a category
 * filter — a `where: { category: "flag" }` filter would auto-leak every
 * future flag (e.g. DAILY_LOGIN_ENABLED) to anonymous callers.
 */

const LOCKED_KEYS = new Set(["DIAMOND_TOPUP_ENABLED"]);          // env-governed, never a writable row
const PUBLIC_CONFIG_KEYS = ["MAINTENANCE_BANNER", "MAINTENANCE_TEXT"] as const;

function validate(type: string, value: string): boolean {
  if (type === "bool") return value === "true" || value === "false";
  if (type === "int") return /^-?\d+$/.test(value);
  return true; // string
}

export async function adminConfigRoutes(app: FastifyInstance) {
  app.get("/admin/config", { preHandler: requireAdmin("SUPERADMIN") }, async () => {
    const rows = await prisma.config.findMany({ orderBy: [{ category: "asc" }, { key: "asc" }] });
    // surface the locked diamond-topup value from ENV (never a row), for display only
    const locked = { key: "DIAMOND_TOPUP_ENABLED", value: String(env.DIAMOND_TOPUP_ENABLED), type: "bool", category: "flag", label: "Diamond top-up (locked)", locked: true };
    return ok({ items: rows.map((r) => ({ ...r, locked: LOCKED_KEYS.has(r.key) })), locked: [locked] });
  });

  app.patch<{ Params: { key: string } }>("/admin/config/:key", { preHandler: requireAdmin("SUPERADMIN") }, async (req) => {
    if (LOCKED_KEYS.has(req.params.key)) throw err.forbidden("LOCKED_FLAG", "This flag is locked");
    const { value, reason } = z.object({ value: z.string(), reason: z.string().trim().min(1).max(500) }).parse(req.body);
    const row = await prisma.config.findUnique({ where: { key: req.params.key } });
    if (!row) throw err.notFound("NO_CONFIG", "Unknown config key");
    if (!validate(row.type, value)) throw err.badRequest("BAD_VALUE", `Invalid ${row.type} value`);
    await prisma.config.update({ where: { key: req.params.key }, data: { value } });
    invalidateConfig(req.params.key);
    await audit(prisma, { actorId: req.userId!, action: "config.update", targetType: "config", targetId: req.params.key, before: { value: row.value }, after: { value }, reason });
    return ok({ key: req.params.key, value });
  });

  // Player-safe subset — UNAUTHENTICATED, per-key allow-list (NEVER a category filter).
  app.get("/config/public", async () => {
    const rows = await prisma.config.findMany({ where: { key: { in: [...PUBLIC_CONFIG_KEYS] } }, select: { key: true, value: true } });
    const out: Record<string, string> = {};
    for (const r of rows) out[r.key] = r.value;
    return ok(out);
  });
}
