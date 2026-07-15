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
 * Build one bucket per UTC day spanning [since's UTC day, now's UTC day],
 * from a list of dates.
 *
 * The feeder queries use `where: { gte: since }` where `since = now -
 * days*DAY_MS` — a fixed instant that is generally NOT UTC midnight, so it
 * sits partway through its own UTC day. That means the query's matched range
 * covers `days + 1` distinct UTC days (a partial day at `since`, `days - 1`
 * full days, and a partial day at `now`), not `days` days.
 *
 * We anchor the earliest bucket on `since`'s UTC day (not `now`) and walk
 * FORWARD to `now`'s UTC day, so every row matched by `gte: since` falls
 * into exactly one bucket — including rows in the oldest partial day right
 * after `since`, which a `now`-anchored walk-back of `days` buckets would
 * miss entirely (its earliest bucket lands one day later than `since`'s
 * day). The returned array length is therefore the number of distinct UTC
 * days actually spanned (days or days + 1), not a hardcoded `days`.
 */
function bucketByDay(dates: Date[], now: Date, since: Date): { day: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const d of dates) {
    const key = utcDayKey(d);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const start = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate()));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const buckets: { day: string; count: number }[] = [];
  for (let d = start; d.getTime() <= end.getTime(); d = new Date(d.getTime() + DAY_MS)) {
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
      regionGroups,
      cohortSignups,
      cohortActivity,
      funnelCohortCount,
      funnelMatchPlayers,
      funnelPurchasers,
      funnelRetained,
      purchaseRows,
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
      // Top regions: real players grouped by self-reported countryCode.
      prisma.user.groupBy({
        by: ["countryCode"],
        where: { isBot: false, isGuest: false, deletedAt: null },
        _count: { _all: true },
      }),
      // Retention cohorts: real signups in the window (id + createdAt) …
      prisma.user.findMany({
        where: { isBot: false, isGuest: false, deletedAt: null, createdAt: { gte: since } },
        select: { id: true, createdAt: true },
      }),
      // … and each cohort user's recorded active days (from DailyActivity).
      prisma.dailyActivity.findMany({
        where: { user: { isBot: false, isGuest: false, deletedAt: null, createdAt: { gte: since } } },
        select: { userId: true, day: true },
      }),
      // Acquisition funnel over the window's signup cohort.
      prisma.user.count({ where: { isBot: false, isGuest: false, deletedAt: null, createdAt: { gte: since } } }),
      // …distinct cohort users who played ≥1 match (as red or blue).
      prisma.user.count({
        where: {
          isBot: false, isGuest: false, deletedAt: null, createdAt: { gte: since },
          OR: [{ matchesRed: { some: {} } }, { matchesBlue: { some: {} } }],
        },
      }),
      // …distinct cohort users who made ≥1 in-game (gold) purchase.
      prisma.user.count({
        where: {
          isBot: false, isGuest: false, deletedAt: null, createdAt: { gte: since },
          orders: { some: {} },
        },
      }),
      // …cohort users still active (seen in the last 7 days).
      prisma.user.count({
        where: {
          isBot: false, isGuest: false, deletedAt: null, createdAt: { gte: since },
          lastSeenAt: { gte: new Date(now.getTime() - 7 * DAY_MS) },
        },
      }),
      // Gold spent on item purchases in the window, for spend-by-category.
      // Use the ledger's purchase sinks (reason "purchase", refType "item"):
      // each carries the item id (refId) and the gold amount (negative), which
      // we join to StoreItem.type below. More reliable than parsing Order.items.
      prisma.ledgerEntry.findMany({
        where: { currency: "GOLD", reason: "purchase", refType: "item", createdAt: { gte: since } },
        select: { amount: true, refId: true },
      }),
    ]);

    // ── §3 newPlayersPerDay ────────────────────────────────────────────────
    const newPlayersPerDay = bucketByDay(newPlayerRows.map((r) => r.createdAt), now, since);

    // ── §4 activePerDay (last-seen snapshot, not DAU — see spec §4) ────────
    const activePerDay = bucketByDay(activeRows.map((r) => r.lastSeenAt), now, since);

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

    // ── §10 topRegions (all-time, by self-reported countryCode) ─────────────
    // Countries only (no finer region field). Null countryCode → "Unknown".
    const regionSorted = regionGroups
      .map((g) => ({ code: g.countryCode ?? "Unknown", count: g._count._all }))
      .sort((a, b) => b.count - a.count);
    const topRegions = regionSorted.slice(0, 10).map((r) => ({
      code: r.code,
      count: r.count,
      pct: totalPlayers > 0 ? r.count / totalPlayers : 0,
    }));

    // ── §11 acquisition funnel (this window's signup cohort) ────────────────
    // Signed up → played a match → made a gold purchase → still active (7d).
    // Each stage is a real subset count; note "purchase" is in-game gold spend
    // (real money is disabled), and "active" is a lastSeenAt proxy.
    const funnel = [
      { stage: "Signed up", count: funnelCohortCount },
      { stage: "Played a match", count: funnelMatchPlayers },
      { stage: "Made a purchase", count: funnelPurchasers },
      { stage: "Still active (7d)", count: funnelRetained },
    ].map((s) => ({ ...s, pct: funnelCohortCount > 0 ? s.count / funnelCohortCount : 0 }));

    // ── §12 gold spend by item category (window) ────────────────────────────
    // Join each purchase sink's refId → StoreItem.type, sum the gold spent.
    const purchaseItemIds = [...new Set(purchaseRows.map((r) => r.refId).filter((id): id is string => !!id))];
    const purchasedItems = purchaseItemIds.length
      ? await prisma.storeItem.findMany({ where: { id: { in: purchaseItemIds } }, select: { id: true, type: true } })
      : [];
    const typeById = new Map(purchasedItems.map((i) => [i.id, i.type]));
    const spendByCat = new Map<string, number>();
    let totalGoldSpend = 0;
    for (const r of purchaseRows) {
      const spent = r.amount < 0 ? -r.amount : 0;
      if (spent === 0) continue;
      const cat = (r.refId && typeById.get(r.refId)) || "OTHER";
      spendByCat.set(cat, (spendByCat.get(cat) ?? 0) + spent);
      totalGoldSpend += spent;
    }
    const goldByCategory = [...spendByCat.entries()]
      .map(([category, gold]) => ({ category, gold, pct: totalGoldSpend > 0 ? gold / totalGoldSpend : 0 }))
      .sort((a, b) => b.gold - a.gold);

    // ── §13 retention (D1/D7/D30) from the DailyActivity log ─────────────────
    // For the window's signup cohort, a user is "retained at day N" if they have
    // a recorded active day on or after their signup-day + N. Only accrues from
    // when DailyActivity started logging, so it's sparse until data builds up.
    const activeDaysByUser = new Map<string, Set<number>>();
    for (const a of cohortActivity) {
      const set = activeDaysByUser.get(a.userId) ?? new Set<number>();
      set.add(Math.floor(a.day.getTime() / DAY_MS));
      activeDaysByUser.set(a.userId, set);
    }
    const retentionHorizons = [1, 7, 30];
    const retention = retentionHorizons.map((n) => {
      // Cohort eligible for horizon N = users who signed up at least N days ago
      // (otherwise day N hasn't happened yet, so they can't count either way).
      const cutoff = now.getTime() - n * DAY_MS;
      const eligible = cohortSignups.filter((u) => u.createdAt.getTime() <= cutoff);
      let retained = 0;
      for (const u of eligible) {
        const signupDayIdx = Math.floor(u.createdAt.getTime() / DAY_MS);
        const days = activeDaysByUser.get(u.id);
        if (days && [...days].some((d) => d >= signupDayIdx + n)) retained += 1;
      }
      return { day: n, eligible: eligible.length, retained, pct: eligible.length > 0 ? retained / eligible.length : 0 };
    });
    const retentionTracked = cohortActivity.length > 0;

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
      topRegions,
      funnel,
      goldByCategory,
      retention,
      retentionTracked,
    });
  });
}
