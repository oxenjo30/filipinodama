import type { FastifyInstance } from "fastify";
import type { AdminRole, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { requireAdmin } from "../auth/guards.js";
import { audit } from "../lib/audit.js";
import { applyLedger } from "../economy/ledger.js";
import { sendEmail, banEmailHtml } from "../lib/email.js";
import { muteUser, banUser } from "../lib/sanctions.js";

/**
 * Admin console API — /api/admin/*. Every route is role-gated by requireAdmin()
 * (server-side, least-privilege) and every MUTATION writes an AuditLog row via
 * audit(). Reuses existing models/modules only (players, ledger, store, seasons,
 * quests, guilds, matches, notifications, audit); no new subsystems here — those
 * are Phase 2 (see ADMIN_DASHBOARD.md). All balance changes go through the ledger.
 *
 * Roles (hierarchy in guards.ts): SUPPORT < MODERATOR < ECONOMY < SUPERADMIN.
 */

// ── shared helpers ───────────────────────────────────────────────────────────

/** Live moderation status derived from timestamp fields (no separate column). */
function statusOf(u: { bannedUntil: Date | null; mutedUntil: Date | null; deletedAt: Date | null }): string {
  const now = new Date();
  if (u.deletedAt) return "deleted";
  if (u.bannedUntil && u.bannedUntil > now) return "banned";
  if (u.mutedUntil && u.mutedUntil > now) return "muted";
  return "active";
}

const reasonSchema = z.object({ reason: z.string().trim().min(1, "reason required").max(500) });
const durationSchema = z.object({
  // hours; 0 / omitted = permanent (a far-future date)
  durationHours: z.number().int().min(0).max(24 * 365).optional(),
  reason: z.string().trim().min(1, "reason required").max(500),
});

export async function adminRoutes(app: FastifyInstance) {
  // ── Overview KPIs — only REAL, computable metrics (no fabricated analytics).
  // DAU/revenue/etc. need an analytics pipeline (Phase 2); we return what the DB
  // can honestly answer now: player counts, live economy faucet/sink, matches/day.
  app.get("/admin/overview", { preHandler: requireAdmin("SUPPORT") }, async () => {
    const now = new Date();
    const dayMs = 86_400_000;
    const since7 = new Date(now.getTime() - 7 * dayMs);
    const since14 = new Date(now.getTime() - 14 * dayMs);

    const [totalPlayers, activePlayers, matchesTotal, matches7d, totalPlayersPrev, activePlayersPrev, matchesPrev7d] = await Promise.all([
      prisma.user.count({ where: { isBot: false, isGuest: false, deletedAt: null } }),
      prisma.user.count({ where: { isBot: false, deletedAt: null, lastSeenAt: { gte: since7 } } }),
      prisma.match.count(),
      prisma.match.findMany({ where: { startedAt: { gte: since7 } }, select: { startedAt: true } }),
      // Prior-window counts (no analytics pipeline needed) — used to derive an
      // honest period-over-period delta for the KPI tiles instead of faking one.
      prisma.user.count({ where: { isBot: false, isGuest: false, deletedAt: null, createdAt: { lt: since7 } } }),
      prisma.user.count({ where: { isBot: false, deletedAt: null, lastSeenAt: { gte: since14, lt: since7 } } }),
      prisma.match.count({ where: { startedAt: { gte: since14, lt: since7 } } }),
    ]);

    // Gold faucet vs sink over the last 7d, straight from the ledger.
    const goldRows = await prisma.ledgerEntry.findMany({
      where: { currency: "GOLD", createdAt: { gte: since7 } },
      select: { amount: true },
    });
    let faucet = 0, sink = 0;
    for (const r of goldRows) { if (r.amount > 0) faucet += r.amount; else sink += -r.amount; }
    const faucetPct = faucet + sink > 0 ? Math.round((faucet / (faucet + sink)) * 100) : 50;

    // Matches per day (last 7 days, oldest→newest) by UTC day.
    const buckets: { day: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * dayMs);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
      const label = d.toLocaleDateString("en-US", { weekday: "short" });
      const count = matches7d.filter((m) => {
        const md = m.startedAt;
        return `${md.getUTCFullYear()}-${md.getUTCMonth()}-${md.getUTCDate()}` === key;
      }).length;
      buckets.push({ day: label, count });
    }

    const matches7dCount = matches7d.length;
    return ok({
      totalPlayers, activePlayers, matchesTotal, faucet, sink, faucetPct, matchesPerDay: buckets,
      // Prior-window counts for period-over-period deltas (real, DB-derived — no pipeline).
      totalPlayersPrev, activePlayersPrev, matches7d: matches7dCount, matchesPrev7d,
    });
  });

  // ── 1.2 Who am I (drives client RBAC) ──────────────────────────────────────
  app.get("/admin/me", { preHandler: requireAdmin("SUPPORT") }, async (req) => {
    const u = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { id: true, username: true, displayName: true, tag: true, adminRole: true, avatarUrl: true },
    });
    if (!u) throw err.notFound("NO_USER", "Admin user not found");
    return ok(u);
  });

  // ── 1.1 Audit log viewer (SUPERADMIN) ──────────────────────────────────────
  app.get("/admin/audit", { preHandler: requireAdmin("SUPERADMIN") }, async (req) => {
    const q = z
      .object({
        cursor: z.string().optional(),
        actor: z.string().optional(),
        action: z.string().optional(),
        targetType: z.string().optional(),
        targetId: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(req.query);
    const where: Prisma.AuditLogWhereInput = {
      ...(q.actor ? { actorId: q.actor } : {}),
      ...(q.action ? { action: { contains: q.action, mode: "insensitive" } } : {}),
      ...(q.targetType ? { targetType: q.targetType } : {}),
      ...(q.targetId ? { targetId: q.targetId } : {}),
    };
    const rows = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > q.limit;
    const items = hasMore ? rows.slice(0, q.limit) : rows;
    // Attach actor display names in one lookup.
    const actorIds = [...new Set(items.map((r) => r.actorId))];
    const actors = await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, username: true, tag: true } });
    const byId = new Map(actors.map((a) => [a.id, a]));
    return ok({
      items: items.map((r) => ({
        id: r.id,
        actor: byId.get(r.actorId) ?? { id: r.actorId, username: "—", tag: "" },
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        before: r.before,
        after: r.after,
        reason: r.reason,
        createdAt: r.createdAt,
      })),
      nextCursor: hasMore ? items[items.length - 1]!.id : null,
    });
  });

  // ── 1.3 Players — search + list (SUPPORT) ──────────────────────────────────
  app.get("/admin/users", { preHandler: requireAdmin("SUPPORT") }, async (req) => {
    const q = z
      .object({
        q: z.string().trim().optional(),
        filter: z.enum(["all", "active", "muted", "banned"]).default("all"),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(25),
      })
      .parse(req.query);
    const now = new Date();
    const search = q.q
      ? {
          OR: [
            { username: { contains: q.q, mode: "insensitive" as const } },
            { displayName: { contains: q.q, mode: "insensitive" as const } },
            { tag: { contains: q.q, mode: "insensitive" as const } },
            { email: { contains: q.q, mode: "insensitive" as const } },
            { id: q.q },
          ],
        }
      : {};
    const filterWhere: Prisma.UserWhereInput =
      q.filter === "banned"
        ? { bannedUntil: { gt: now } }
        : q.filter === "muted"
          ? { mutedUntil: { gt: now }, OR: [{ bannedUntil: null }, { bannedUntil: { lte: now } }] }
          : q.filter === "active"
            ? { AND: [{ OR: [{ bannedUntil: null }, { bannedUntil: { lte: now } }] }, { OR: [{ mutedUntil: null }, { mutedUntil: { lte: now } }] }] }
            : {};
    const where: Prisma.UserWhereInput = { deletedAt: null, isBot: false, ...search, ...filterWhere };
    const [total, rows] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        select: {
          id: true, username: true, displayName: true, tag: true, email: true,
          rankTier: true, trophies: true, gold: true, diamonds: true,
          bannedUntil: true, mutedUntil: true, deletedAt: true, createdAt: true, avatarUrl: true,
        },
      }),
    ]);
    return ok({
      total,
      page: q.page,
      limit: q.limit,
      items: rows.map((u) => ({ ...u, status: statusOf(u) })),
    });
  });

  // ── 1.3 Player detail (SUPPORT) ────────────────────────────────────────────
  app.get<{ Params: { id: string } }>("/admin/users/:id", { preHandler: requireAdmin("SUPPORT") }, async (req) => {
    const u = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, username: true, displayName: true, tag: true, email: true, emailVerified: true,
        bio: true, avatarUrl: true, frameId: true, countryCode: true, isGuest: true, adminRole: true,
        rankTier: true, trophies: true, gold: true, diamonds: true,
        equippedBoard: true, equippedSkin: true,
        wins: true, losses: true, draws: true, streak: true,
        bannedUntil: true, mutedUntil: true, deletedAt: true, createdAt: true, lastSeenAt: true,
        guildMember: { select: { guild: { select: { id: true, name: true, tag: true } }, role: true } },
      },
    });
    if (!u) throw err.notFound("NO_USER", "Player not found");
    // Recent ledger (balances history) — last 20.
    const ledger = await prisma.ledgerEntry.findMany({
      where: { userId: u.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, currency: true, amount: true, reason: true, refType: true, refId: true, createdAt: true },
    });
    const openReportsAgainst = await prisma.report.count({ where: { accusedId: u.id, status: "OPEN" } });
    return ok({ ...u, status: statusOf(u), ledger, openReportsAgainst });
  });

  // ── 1.3 Player recent matches (SUPPORT) ────────────────────────────────────
  app.get<{ Params: { id: string } }>("/admin/users/:id/matches", { preHandler: requireAdmin("SUPPORT") }, async (req) => {
    const limit = z.coerce.number().int().min(1).max(50).default(20).parse((req.query as any)?.limit);
    const rows = await prisma.match.findMany({
      where: { OR: [{ redId: req.params.id }, { blueId: req.params.id }] },
      orderBy: { startedAt: "desc" },
      take: limit,
      select: {
        id: true, mode: true, winner: true, endedAt: true, startedAt: true,
        red: { select: { id: true, username: true, tag: true } },
        blue: { select: { id: true, username: true, tag: true } },
      },
    });
    return ok({ items: rows });
  });

  // ── 1.4 Sanctions: ban / unban / mute / unlock / notify ────────────────────
  app.post<{ Params: { id: string } }>("/admin/users/:id/ban", { preHandler: requireAdmin("MODERATOR") }, async (req) => {
    const { durationHours, reason } = durationSchema.parse(req.body);
    if (req.params.id === req.userId) throw err.badRequest("SELF_BAN", "You can't ban yourself");
    const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { adminRole: true } });
    if (!target) throw err.notFound("NO_USER", "Player not found");
    if (target.adminRole && req.adminRole !== "SUPERADMIN") throw err.forbidden("BAN_ADMIN", "Only a superadmin can ban another admin");
    const { bannedUntil, email } = await prisma.$transaction((tx) =>
      banUser(tx, { targetId: req.params.id, actorId: req.userId!, durationHours, reason }),
    );
    // Notify the suspended player by email (best-effort; never fail the sanction).
    if (email) void sendEmail(email.email, "Your FilipinoDama Royal account has been suspended", banEmailHtml({ username: email.username, reason, until: email.until })).catch(() => {});
    return ok({ bannedUntil });
  });

  app.post<{ Params: { id: string } }>("/admin/users/:id/unban", { preHandler: requireAdmin("MODERATOR") }, async (req) => {
    const { reason } = reasonSchema.parse(req.body);
    const before = await prisma.user.findUnique({ where: { id: req.params.id }, select: { bannedUntil: true } });
    if (!before) throw err.notFound("NO_USER", "Player not found");
    await prisma.user.update({ where: { id: req.params.id }, data: { bannedUntil: null } });
    await audit(prisma, { actorId: req.userId!, action: "user.unban", targetType: "user", targetId: req.params.id, before, after: { bannedUntil: null }, reason });
    return ok({ bannedUntil: null });
  });

  app.post<{ Params: { id: string } }>("/admin/users/:id/mute", { preHandler: requireAdmin("MODERATOR") }, async (req) => {
    const { durationHours, reason } = durationSchema.parse(req.body);
    const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!target) throw err.notFound("NO_USER", "Player not found");
    const { mutedUntil } = await prisma.$transaction((tx) =>
      muteUser(tx, { targetId: req.params.id, actorId: req.userId!, durationHours, reason }),
    );
    return ok({ mutedUntil });
  });

  app.post<{ Params: { id: string } }>("/admin/users/:id/unlock", { preHandler: requireAdmin("SUPPORT") }, async (req) => {
    const { reason } = reasonSchema.parse(req.body);
    const before = await prisma.user.findUnique({ where: { id: req.params.id }, select: { mutedUntil: true } });
    if (!before) throw err.notFound("NO_USER", "Player not found");
    await prisma.user.update({ where: { id: req.params.id }, data: { mutedUntil: null } });
    await audit(prisma, { actorId: req.userId!, action: "user.unmute", targetType: "user", targetId: req.params.id, before, after: { mutedUntil: null }, reason });
    return ok({ mutedUntil: null });
  });

  app.post<{ Params: { id: string } }>("/admin/users/:id/notify", { preHandler: requireAdmin("SUPPORT") }, async (req) => {
    const { title, body } = z.object({ title: z.string().trim().min(1).max(120), body: z.string().trim().min(1).max(1000) }).parse(req.body);
    const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!target) throw err.notFound("NO_USER", "Player not found");
    await prisma.notification.create({ data: { userId: req.params.id, type: "admin", title, body } });
    await audit(prisma, { actorId: req.userId!, action: "user.notify", targetType: "user", targetId: req.params.id, after: { title }, reason: title });
    return ok({ sent: true });
  });

  // ── 1.5 Economy: grant currency (ECONOMY) — always via the ledger ──────────
  app.post<{ Params: { id: string } }>("/admin/users/:id/grant", { preHandler: requireAdmin("ECONOMY") }, async (req) => {
    const { currency, amount, reason } = z
      .object({
        currency: z.enum(["GOLD", "DIAMONDS", "TROPHIES"]),
        amount: z.number().int().refine((n) => n !== 0, "amount must be non-zero"),
        reason: z.string().trim().min(1).max(500),
      })
      .parse(req.body);
    const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!target) throw err.notFound("NO_USER", "Player not found");
    // applyLedger is signed + idempotent-guarded; refId ties this grant to the actor+time.
    const balance = await applyLedger(prisma, {
      userId: req.params.id,
      currency,
      amount,
      reason: "admin_grant",
      refType: "admin",
      refId: `${req.userId}:${Date.now()}`,
    });
    await audit(prisma, { actorId: req.userId!, action: "currency.grant", targetType: "user", targetId: req.params.id, after: { currency, amount, balance }, reason });
    return ok({ currency, amount, balance });
  });

  // ── 1.5 Ledger explorer (ECONOMY) ──────────────────────────────────────────
  app.get("/admin/ledger", { preHandler: requireAdmin("ECONOMY") }, async (req) => {
    const q = z
      .object({
        userId: z.string().optional(),
        currency: z.enum(["GOLD", "DIAMONDS", "TROPHIES"]).optional(),
        reason: z.string().optional(),
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(req.query);
    const where: Prisma.LedgerEntryWhereInput = {
      ...(q.userId ? { userId: q.userId } : {}),
      ...(q.currency ? { currency: q.currency } : {}),
      ...(q.reason ? { reason: { contains: q.reason, mode: "insensitive" } } : {}),
    };
    const rows = await prisma.ledgerEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      select: {
        id: true, userId: true, currency: true, amount: true, reason: true, refType: true, refId: true, createdAt: true,
        user: { select: { username: true, tag: true } },
      },
    });
    const hasMore = rows.length > q.limit;
    const items = hasMore ? rows.slice(0, q.limit) : rows;
    return ok({ items, nextCursor: hasMore ? items[items.length - 1]!.id : null });
  });
}
