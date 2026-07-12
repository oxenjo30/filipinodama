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
 * future flag to anonymous callers. DAILY_LOGIN_ENABLED is allow-listed so
 * the web client can proactively hide the daily-login UI when it's off,
 * instead of only finding out via a failed POST /api/rewards/daily-login
 * (which stays the authoritative server-side gate either way).
 *
 * DIAMOND_TOPUP_ENABLED is added to the /config/public response OUTSIDE the
 * Config-row query (it's env-governed, never a row — see LOCKED_KEYS) so it
 * can't be listed in PUBLIC_CONFIG_KEYS. The authoritative server-side gate
 * for the whole payments feature is `features.payments` in config/env.ts
 * (checked in modules/payments.ts on every checkout/packs call); this is a
 * read-only mirror for any unauthenticated caller that wants the flag without
 * hitting the authenticated GET /api/auth/providers `diamondTopUp` field.
 */

const LOCKED_KEYS = new Set(["DIAMOND_TOPUP_ENABLED"]);          // env-governed, never a writable row
const PUBLIC_CONFIG_KEYS = ["MAINTENANCE_BANNER", "MAINTENANCE_TEXT", "DAILY_LOGIN_ENABLED"] as const;

function validate(type: string, value: string): boolean {
  if (type === "bool") return value === "true" || value === "false";
  if (type === "int") return /^-?\d+$/.test(value);
  return true; // string
}

export async function adminConfigRoutes(app: FastifyInstance) {
  app.get("/admin/config", { preHandler: requireAdmin("SUPERADMIN") }, async () => {
    // type:"json" rows (DAILY_REWARDS_LADDER, PAYMENT_GATEWAYS, …) have their own
    // dedicated editors with real validation. Excluding them here keeps the generic
    // Config panel from rendering a raw JSON blob in a tiny text input — a stray
    // save there would corrupt the JSON and silently revert the feature to its
    // defaults on next read (the readers fall back on parse failure).
    const rows = await prisma.config.findMany({ where: { type: { not: "json" } }, orderBy: [{ category: "asc" }, { key: "asc" }] });
    // surface the locked diamond-topup value from ENV (never a row), for display only
    const locked = { key: "DIAMOND_TOPUP_ENABLED", value: String(env.DIAMOND_TOPUP_ENABLED), type: "bool", category: "flag", label: "Diamond top-up (locked)", locked: true };
    return ok({ items: rows.map((r) => ({ ...r, locked: LOCKED_KEYS.has(r.key) })), locked: [locked] });
  });

  app.patch<{ Params: { key: string } }>("/admin/config/:key", { preHandler: requireAdmin("SUPERADMIN") }, async (req) => {
    if (LOCKED_KEYS.has(req.params.key)) throw err.forbidden("LOCKED_FLAG", "This flag is locked");
    const { value, reason } = z.object({ value: z.string(), reason: z.string().trim().min(1).max(500) }).parse(req.body);
    const row = await prisma.config.findUnique({ where: { key: req.params.key } });
    if (!row) throw err.notFound("NO_CONFIG", "Unknown config key");
    // json rows are managed exclusively by their dedicated, schema-validated
    // editors (daily-rewards ladder, payment gateways) — never the generic form.
    if (row.type === "json") throw err.forbidden("DEDICATED_EDITOR", "This value is managed by its dedicated editor");
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
    // DIAMOND_TOPUP_ENABLED is env-governed (never a Config row — see LOCKED_KEYS
    // above), so it can't come from the rows query; surface it here the same way
    // GET /admin/config surfaces it to admins. The web client already reads the
    // equivalent gate from GET /api/auth/providers (`diamondTopUp`); this key is
    // additive so any other unauthenticated surface can read the master switch too.
    out.DIAMOND_TOPUP_ENABLED = String(env.DIAMOND_TOPUP_ENABLED);
    return ok(out);
  });
}
