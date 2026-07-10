import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { ok } from "../lib/errors.js";
import { requireAdmin } from "../auth/guards.js";
import { RANK_TIERS } from "@dama/shared";

/**
 * Analytics deep-dive — /api/admin/analytics. READ-ONLY: every field here is a
 * real, computed metric over existing models (User, Match, LedgerEntry,
 * StoreItem, InventoryItem, Guild). No writes, no mutations, so no audit()
 * call — audit is for mutations with before/after; there is no state change
 * here. See docs/superpowers/specs/2026-07-10-analytics-design.md.
 */

const WINDOW_DAYS: Record<"7d" | "30d" | "90d", number> = { "7d": 7, "30d": 30, "90d": 90 };
const DAY_MS = 86_400_000;

function utcDayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

/**
 * Build one bucket per day in the window, oldest -> newest, from a list of
 * dates. Anchored on `now` (not `since`): `since = now - days*DAY_MS` is a
 * fixed instant that isn't generally midnight UTC, so walking forward from
 * `since` in day-sized steps can produce bucket keys that never line up with
 * "today"'s actual UTC-day key — a row created seconds ago could then fall
 * outside every generated bucket even though it matches the `gte: since`
 * query. Walking backward from `now` guarantees the newest bucket is always
 * today, matching what the `gte: since` queries actually select.
 */
function bucketByDay(dates: Date[], now: Date, days: number): { day: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const d of dates) {
    const key = utcDayKey(d);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const buckets: { day: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * DAY_MS);
    const key = utcDayKey(d);
    buckets.push({ day: key, count: counts.get(key) ?? 0 });
  }
  return buckets;
}

export async function adminAnalyticsRoutes(app: FastifyInstance) {
  app.get("/admin/analytics", { preHandler: requireAdmin("ECONOMY") }, async (req) => {
    const { window } = z.object({ window: z.enum(["7d", "30d", "90d"]).default("30d") }).parse(req.query);
    const days = WINDOW_DAYS[window];
    const now = new Date();
    const since = new Date(now.getTime() - days * DAY_MS);

    const [
      totalPlayers,
      newPlayers,
      activePlayers,
      matchesInWindow,
      matchesTotal,
      guildsTotal,
      newPlayerRows,
      activeRows,
      goldRows,
      modeGroups,
      matchOutcomeCounts,
      rankGroups,
      inventoryGroups,
    ] = await Promise.all([
      prisma.user.count({ where: { isBot: false, isGuest: false, deletedAt: null } }),
      prisma.user.count({ where: { isBot: false, isGuest: false, deletedAt: null, createdAt: { gte: since } } }),
      prisma.user.count({ where: { isBot: false, deletedAt: null, lastSeenAt: { gte: since } } }),
      prisma.match.count({ where: { startedAt: { gte: since } } }),
      prisma.match.count(),
      prisma.guild.count(),
      prisma.user.findMany({
        where: { isBot: false, isGuest: false, deletedAt: null, createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      prisma.user.findMany({
        where: { isBot: false, deletedAt: null, lastSeenAt: { gte: since } },
        select: { lastSeenAt: true },
      }),
      prisma.ledgerEntry.findMany({
        where: { currency: "GOLD", createdAt: { gte: since } },
        select: { amount: true, reason: true },
      }),
      prisma.match.groupBy({ by: ["mode"], where: { startedAt: { gte: since } }, _count: { _all: true } }),
      Promise.all([
        prisma.match.count({ where: { startedAt: { gte: since } } }),
        prisma.match.count({ where: { startedAt: { gte: since }, winner: "red" } }),
        prisma.match.count({ where: { startedAt: { gte: since }, winner: "blue" } }),
        prisma.match.count({ where: { startedAt: { gte: since }, winner: "draw" } }),
      ]),
      prisma.user.groupBy({
        by: ["rankTier"],
        where: { isBot: false, isGuest: false, deletedAt: null },
        _count: { _all: true },
      }),
      prisma.inventoryItem.groupBy({
        by: ["itemId"],
        _count: { _all: true },
        orderBy: { _count: { itemId: "desc" } },
        take: 10,
      }),
    ]);

    // ── §3 newPlayersPerDay ────────────────────────────────────────────────
    const newPlayersPerDay = bucketByDay(newPlayerRows.map((r) => r.createdAt), now, days);

    // ── §4 activePerDay (last-seen snapshot, not DAU — see spec §4) ────────
    const activePerDay = bucketByDay(activeRows.map((r) => r.lastSeenAt), now, days);

    // ── §5 gold faucet / sink / byReason ────────────────────────────────────
    let faucet = 0;
    let sink = 0;
    const byReasonMap = new Map<string, { faucet: number; sink: number }>();
    for (const r of goldRows) {
      const bucket = byReasonMap.get(r.reason) ?? { faucet: 0, sink: 0 };
      if (r.amount > 0) {
        faucet += r.amount;
        bucket.faucet += r.amount;
      } else {
        sink += -r.amount;
        bucket.sink += -r.amount;
      }
      byReasonMap.set(r.reason, bucket);
    }
    const faucetPct = faucet + sink > 0 ? Math.round((faucet / (faucet + sink)) * 100) : 50;
    const sortedReasons = [...byReasonMap.entries()].sort(
      (a, b) => b[1].faucet + b[1].sink - (a[1].faucet + a[1].sink),
    );
    const topReasons = sortedReasons.slice(0, 8).map(([reason, v]) => ({ reason, ...v }));
    const rest = sortedReasons.slice(8);
    if (rest.length > 0) {
      const other = rest.reduce(
        (acc, [, v]) => ({ faucet: acc.faucet + v.faucet, sink: acc.sink + v.sink }),
        { faucet: 0, sink: 0 },
      );
      topReasons.push({ reason: "other", ...other });
    }

    // ── §6 matchesByMode ─────────────────────────────────────────────────────
    const modeCounts = new Map(modeGroups.map((g) => [g.mode, g._count._all]));
    const ALL_MODES = ["AI", "CASUAL", "RANKED", "PRIVATE", "LOCAL"] as const;
    const matchesByMode = ALL_MODES.map((mode) => {
      const count = modeCounts.get(mode) ?? 0;
      return { mode, count, pct: matchesInWindow > 0 ? count / matchesInWindow : 0 };
    });

    // ── §7 matchOutcomes ─────────────────────────────────────────────────────
    const [total, redWins, blueWins, draws] = matchOutcomeCounts;
    const unfinished = total - redWins - blueWins - draws;
    const matchOutcomes = { redWins, blueWins, draws, unfinished, total };

    // ── §8 rankTiers (all-time, canonical order) ────────────────────────────
    const rankCounts = new Map(rankGroups.map((g) => [g.rankTier, g._count._all]));
    const rankTiers = RANK_TIERS.map((t) => {
      const count = rankCounts.get(t.key) ?? 0;
      return {
        key: t.key,
        label: t.label,
        accent: t.accent,
        count,
        pct: totalPlayers > 0 ? count / totalPlayers : 0,
      };
    });

    // ── §9 topItems (all-time, by ownership) ────────────────────────────────
    const itemIds = inventoryGroups.map((g) => g.itemId);
    const storeItems = itemIds.length
      ? await prisma.storeItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, name: true, type: true } })
      : [];
    const storeById = new Map(storeItems.map((i) => [i.id, i]));
    const topItems = inventoryGroups.map((g) => {
      const item = storeById.get(g.itemId);
      const owners = g._count._all;
      return {
        itemId: g.itemId,
        name: item?.name ?? g.itemId,
        type: item?.type ?? null,
        owners,
        pct: totalPlayers > 0 ? owners / totalPlayers : 0,
      };
    });

    return ok({
      window,
      days,
      kpis: {
        totalPlayers,
        newPlayers,
        activePlayers,
        matchesInWindow,
        matchesTotal,
        goldFaucet: faucet,
        goldSink: sink,
        guildsTotal,
      },
      newPlayersPerDay,
      activePerDay,
      activePerDayNote: "last-seen snapshot, not DAU",
      gold: { faucet, sink, faucetPct, byReason: topReasons },
      matchesByMode,
      matchOutcomes,
      rankTiers,
      topItems,
    });
  });
}
