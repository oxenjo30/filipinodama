import type { PrismaClient, Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import { applyLedgerTx } from "../economy/ledger.js";
import { getInt } from "./config-service.js";

/**
 * Guild Wars — a weekly contribution ladder. Every RANKED win by a guild member
 * adds war points to their guild (Guild.weeklyPoints) and to the member
 * (GuildMember.weeklyContribution). Guilds are ranked weekly; at reset the top-N
 * earn a gold pot split among that guild's contributors (bigger contribution →
 * bigger share), then points reset and a new week opens.
 *
 * Admin-tunable via the Config table (config-service):
 *   WAR_POINTS_PER_WIN   points a ranked win adds to the guild (default 10)
 *   WAR_REWARD_TOP_N     how many top guilds are paid at reset (default 3)
 *   WAR_REWARD_POOL_GOLD gold pot for RANK 1 (lower ranks scale down)  (default 5000)
 *   WAR_WEEK_DAYS        length of a war week in days (default 7)
 *
 * All crediting is server-authoritative through applyLedger — never by writing
 * balances directly.
 */

/** Ensure there's an active war season; create week 1 if none, roll if expired
 *  is handled by the reset job — this only guarantees a row exists to read. */
export async function getOrCreateActiveSeason(now: Date): Promise<{
  id: string;
  weekIndex: number;
  startsAt: Date;
  endsAt: Date;
  status: string;
}> {
  const active = await prisma.guildWarSeason.findFirst({
    where: { status: "active" },
    orderBy: { weekIndex: "desc" },
  });
  if (active) return active;

  // No active season — open week 1 (or the next index after any settled ones).
  const last = await prisma.guildWarSeason.findFirst({ orderBy: { weekIndex: "desc" } });
  const weekIndex = (last?.weekIndex ?? 0) + 1;
  const days = await getInt("WAR_WEEK_DAYS", 7);
  const endsAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return prisma.guildWarSeason.create({
    data: { weekIndex, startsAt: now, endsAt, status: "active" },
  });
}

/**
 * Award war points for a RANKED win, inside the caller's settlement transaction
 * so it commits atomically with the match settle. Safe to call for any winner;
 * it no-ops if the winner isn't in a guild. Never throws in a way that should
 * abort settlement — the caller wraps it in try/catch, but we also keep the
 * work minimal and guarded.
 */
export async function awardWarPointsTx(
  tx: Prisma.TransactionClient,
  winnerUserId: string,
  now: Date,
): Promise<void> {
  const membership = await tx.guildMember.findUnique({
    where: { userId: winnerUserId },
    select: { guildId: true },
  });
  if (!membership) return; // not in a guild → no war points

  const perWin = await getInt("WAR_POINTS_PER_WIN", 10);
  if (perWin <= 0) return;

  await tx.guild.update({
    where: { id: membership.guildId },
    data: { weeklyPoints: { increment: perWin } },
  });
  await tx.guildMember.update({
    where: { userId: winnerUserId },
    data: { weeklyContribution: { increment: perWin } },
  });
}

/** Reward for a given rank: rank 1 gets the full pool, each lower rank ~60% of
 *  the one above, floored at 0. Keeps top-heavy but non-trivial for 2nd/3rd.
 *  Exported for unit testing the money math. */
export function rewardForRank(rank: number, poolGold: number): number {
  if (rank < 1) return 0;
  return Math.round(poolGold * Math.pow(0.6, rank - 1));
}

/** Compute each contributor's share of a guild's reward, proportional to their
 *  contribution (floor'd). Exported + pure for unit testing the split math. */
export function splitReward(
  rewardGold: number,
  contributors: { userId: string; weeklyContribution: number }[],
): { userId: string; share: number }[] {
  const total = contributors.reduce((s, c) => s + c.weeklyContribution, 0);
  if (total <= 0 || rewardGold <= 0) return [];
  return contributors
    .map((c) => ({ userId: c.userId, share: Math.floor((rewardGold * c.weeklyContribution) / total) }))
    .filter((s) => s.share > 0);
}

/**
 * Settle the given season: rank guilds by weeklyPoints, freeze a GuildWarResult
 * row per guild, pay the top-N gold pot split among each winning guild's
 * contributors (proportional to weeklyContribution), then reset all points and
 * open the next week. Idempotent: a season already "settled" is skipped.
 * Returns a short summary for logging/admin.
 */
export async function settleWarSeason(
  seasonId: string,
  now: Date,
): Promise<{ settled: boolean; paidGuilds: number; totalGold: number }> {
  const topN = await getInt("WAR_REWARD_TOP_N", 3);
  const poolGold = await getInt("WAR_REWARD_POOL_GOLD", 5000);
  const days = await getInt("WAR_WEEK_DAYS", 7);

  return prisma.$transaction(async (tx) => {
    const season = await tx.guildWarSeason.findUnique({ where: { id: seasonId } });
    if (!season || season.status !== "active") return { settled: false, paidGuilds: 0, totalGold: 0 };

    // Rank all guilds with any points this week (ties broken by earliest-created).
    const ranked = await tx.guild.findMany({
      where: { weeklyPoints: { gt: 0 } },
      orderBy: [{ weeklyPoints: "desc" }, { createdAt: "asc" }],
      select: { id: true, name: true, tag: true, crestKey: true, weeklyPoints: true },
    });

    let paidGuilds = 0;
    let totalGold = 0;

    for (let i = 0; i < ranked.length; i++) {
      const g = ranked[i];
      const rank = i + 1;
      const rewardGold = rank <= topN ? rewardForRank(rank, poolGold) : 0;

      await tx.guildWarResult.create({
        data: {
          seasonId,
          guildId: g.id,
          guildName: g.name,
          guildTag: g.tag,
          crestKey: g.crestKey,
          rank,
          points: g.weeklyPoints,
          rewardGold,
        },
      });

      if (rewardGold > 0) {
        // Split the guild's reward among its contributors, proportional to
        // weeklyContribution. Anyone who contributed 0 gets nothing.
        const contributors = await tx.guildMember.findMany({
          where: { guildId: g.id, weeklyContribution: { gt: 0 } },
          select: { userId: true, weeklyContribution: true },
        });
        const shares = splitReward(rewardGold, contributors);
        if (shares.length > 0) {
          paidGuilds++;
          for (const s of shares) {
            await applyLedgerTx(tx, {
              userId: s.userId,
              currency: "GOLD",
              amount: s.share,
              reason: "guildwar.reward",
              refType: "guild_war_season",
              refId: `${seasonId}:${s.userId}`,
            });
            totalGold += s.share;
          }
        }
      }
    }

    // Freeze the season and reset everyone's war points for the new week.
    await tx.guildWarSeason.update({
      where: { id: seasonId },
      data: { status: "settled", settledAt: now },
    });
    await tx.guild.updateMany({ where: { weeklyPoints: { gt: 0 } }, data: { weeklyPoints: 0 } });
    await tx.guildMember.updateMany({ where: { weeklyContribution: { gt: 0 } }, data: { weeklyContribution: 0 } });

    // Open the next week.
    const endsAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    await tx.guildWarSeason.create({
      data: { weekIndex: season.weekIndex + 1, startsAt: now, endsAt, status: "active" },
    });

    return { settled: true, paidGuilds, totalGold };
  });
}

/**
 * The reset poller (mirrors campaign-scheduler): if the active season's window
 * has closed, settle it. Run on an interval from index.ts. Safe to call
 * frequently — it only acts when a season is genuinely expired.
 */
export async function runWarResetTick(now: Date = new Date()): Promise<void> {
  const active = await prisma.guildWarSeason.findFirst({
    where: { status: "active" },
    orderBy: { weekIndex: "desc" },
  });
  if (!active) {
    // No season yet — open the first one so the ladder is live.
    await getOrCreateActiveSeason(now);
    return;
  }
  if (now >= active.endsAt) {
    await settleWarSeason(active.id, now);
  }
}

/**
 * War status for a viewer: current week window, top standings, and (if the
 * viewer is in a guild) that guild's rank + points + the viewer's own
 * contribution. Read-only; used by GET /api/guilds/war.
 */
export async function getWarStatus(
  db: PrismaClient,
  viewerUserId: string | null,
  now: Date,
): Promise<{
  week: number;
  startsAt: string;
  endsAt: string;
  topN: number;
  poolGold: number;
  standings: { guildId: string; name: string; tag: string; crestKey: string | null; points: number; rank: number; rewardGold: number }[];
  myGuild: { guildId: string; name: string; tag: string; points: number; rank: number; myContribution: number } | null;
  lastWeek: { guildName: string; guildTag: string; crestKey: string | null; rank: number; points: number; rewardGold: number }[];
}> {
  const season = await getOrCreateActiveSeason(now);
  const topN = await getInt("WAR_REWARD_TOP_N", 3);
  const poolGold = await getInt("WAR_REWARD_POOL_GOLD", 5000);

  // Top 20 standings for display.
  const top = await db.guild.findMany({
    where: { weeklyPoints: { gt: 0 } },
    orderBy: [{ weeklyPoints: "desc" }, { createdAt: "asc" }],
    take: 20,
    select: { id: true, name: true, tag: true, crestKey: true, weeklyPoints: true },
  });
  const standings = top.map((g, i) => ({
    guildId: g.id,
    name: g.name,
    tag: g.tag,
    crestKey: g.crestKey,
    points: g.weeklyPoints,
    rank: i + 1,
    rewardGold: i < topN ? rewardForRank(i + 1, poolGold) : 0,
  }));

  let myGuild = null as null | { guildId: string; name: string; tag: string; points: number; rank: number; myContribution: number };
  if (viewerUserId) {
    const membership = await db.guildMember.findUnique({
      where: { userId: viewerUserId },
      select: { guildId: true, weeklyContribution: true, guild: { select: { name: true, tag: true, weeklyPoints: true } } },
    });
    if (membership) {
      // Rank = 1 + number of guilds strictly ahead on points.
      const ahead = await db.guild.count({ where: { weeklyPoints: { gt: membership.guild.weeklyPoints } } });
      myGuild = {
        guildId: membership.guildId,
        name: membership.guild.name,
        tag: membership.guild.tag,
        points: membership.guild.weeklyPoints,
        rank: ahead + 1,
        myContribution: membership.weeklyContribution,
      };
    }
  }

  // Last settled week's top results (the "War Log" history).
  const lastSettled = await db.guildWarSeason.findFirst({
    where: { status: "settled" },
    orderBy: { weekIndex: "desc" },
    select: {
      results: { orderBy: { rank: "asc" }, take: 10 },
    },
  });
  const lastWeek = (lastSettled?.results ?? []).map((r) => ({
    guildName: r.guildName,
    guildTag: r.guildTag,
    crestKey: r.crestKey,
    rank: r.rank,
    points: r.points,
    rewardGold: r.rewardGold,
  }));

  return {
    week: season.weekIndex,
    startsAt: season.startsAt.toISOString(),
    endsAt: season.endsAt.toISOString(),
    topN,
    poolGold,
    standings,
    myGuild,
    lastWeek,
  };
}
