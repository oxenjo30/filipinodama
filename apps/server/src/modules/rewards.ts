import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { applyLedgerTx } from "../economy/ledger.js";
import { requireAuth } from "../auth/guards.js";
import { getBool } from "../lib/config-service.js";
import { getDailyRewardsLadder, rowGold, rowGems, DEFAULT_LADDER } from "../lib/daily-rewards.js";

/**
 * Daily Login Bonus — server-authoritative (a client localStorage streak, as in
 * the prototype, is trivially farmable). Reward VALUES come from the
 * admin-configurable ladder (apps/server/src/lib/daily-rewards.ts) — falls back
 * to DEFAULT_LADDER (this file's original hardcoded gold track) when no admin
 * config has been saved, so behavior is unchanged until an admin edits it in
 * Live Ops → Daily login rewards. Claim once per UTC day; miss a day → streak
 * resets to day 1. The claim-day/streak LOGIC below is untouched — only the
 * reward amounts are now sourced from config.
 *
 *   GET  /api/rewards/daily-login  → status (day, claimedToday, track, streak)
 *   POST /api/rewards/daily-login  → claim today's bonus (idempotent per day)
 */

const CYCLE = DEFAULT_LADDER.length; // 7

/** UTC day key "YYYY-MM-DD" for a date (bonuses roll over at 00:00 UTC, matching quests). */
function dayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Whole days between two UTC day-keys (a - b), via UTC midnight timestamps. */
function daysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const ub = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((ua - ub) / 86_400_000);
}

/**
 * Given the last-claimed date + prior streak, compute the day the player is on
 * NOW (the day they'd claim today) and whether today is already claimed.
 *   - never claimed              → day 1, not claimed
 *   - last claim was today       → current streak, already claimed
 *   - last claim was yesterday   → advance (cycle 7→1), not claimed
 *   - last claim >1 day ago      → reset to day 1, not claimed
 */
function computeLogin(lastAt: Date | null, streak: number, now: Date): { day: number; claimedToday: boolean } {
  if (!lastAt) return { day: 1, claimedToday: false };
  const gap = daysBetween(now, lastAt);
  if (gap <= 0) {
    // Same UTC day (or clock skew) → already claimed; the day is the current streak.
    const cur = streak >= 1 && streak <= CYCLE ? streak : 1;
    return { day: cur, claimedToday: true };
  }
  if (gap === 1) {
    // Consecutive day → advance, cycling back to 1 after day 7.
    const next = streak >= CYCLE ? 1 : streak + 1;
    return { day: next < 1 ? 1 : next, claimedToday: false };
  }
  // Missed one or more days → streak broken, start over.
  return { day: 1, claimedToday: false };
}

export async function rewardRoutes(app: FastifyInstance) {
  // GET /api/rewards/daily-login — the player's current bonus status.
  app.get("/rewards/daily-login", { preHandler: requireAuth }, async (req) => {
    const userId = req.userId!;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { loginStreak: true, lastLoginBonusAt: true },
    });
    if (!user) throw err.notFound("NO_USER", "User not found");

    const now = new Date();
    const { day, claimedToday } = computeLogin(user.lastLoginBonusAt, user.loginStreak, now);
    const ladder = await getDailyRewardsLadder();
    const rewardRow = ladder[day - 1];
    return ok({
      day, // 1..7 — the day the player is on today
      claimedToday, // already collected today's bonus?
      rewardToday: rowGold(rewardRow), // gold for `day` (back-compat field name)
      rewardGemsToday: rowGems(rewardRow), // diamonds for `day` (0 on gold-only days)
      track: ladder.map((r) => rowGold(r)), // gold curve, back-compat shape for the modal
      trackFull: ladder, // full row objects (type/amt or chest gold+gem) for richer UI
      streak: user.loginStreak, // last recorded streak (0 if never)
    });
  });

  // POST /api/rewards/daily-login — claim today's bonus. Idempotent per UTC day:
  // a conditional update (only when lastLoginBonusAt is null or on an earlier
  // day) wins exactly once, so two concurrent clicks can't double-credit.
  app.post("/rewards/daily-login", { preHandler: requireAuth }, async (req) => {
    if (!(await getBool("DAILY_LOGIN_ENABLED", true))) throw err.forbidden("DAILY_LOGIN_OFF", "Daily login bonus is disabled");
    const userId = req.userId!;
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const ladder = await getDailyRewardsLadder();

    let result: { day: number; gold: number; gems: number; goldBalance: number; gemsBalance: number };
    try {
      result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { loginStreak: true, lastLoginBonusAt: true },
        });
        if (!user) throw new Error("NO_USER");

        const { day, claimedToday } = computeLogin(user.lastLoginBonusAt, user.loginStreak, now);
        if (claimedToday) throw new Error("ALREADY_CLAIMED");

        // Conditional flip: only claim if no bonus has been taken since today's UTC
        // midnight. count===0 means another request already claimed → treat as dup.
        const flip = await tx.user.updateMany({
          where: {
            id: userId,
            OR: [{ lastLoginBonusAt: null }, { lastLoginBonusAt: { lt: todayStart } }],
          },
          data: { loginStreak: day, lastLoginBonusAt: now },
        });
        if (flip.count === 0) throw new Error("ALREADY_CLAIMED");

        const row = ladder[day - 1];
        const gold = rowGold(row);
        const gems = rowGems(row);
        // refId is the UTC day key so the ledger unique-constraint also guards
        // against a second credit for the same calendar day.
        let goldBalance = await applyLedgerTx(tx, {
          userId,
          currency: "GOLD",
          amount: gold,
          reason: "login_bonus",
          refType: "daily_login",
          refId: dayKey(now),
        });
        let gemsBalance = -1;
        if (gems > 0) {
          // Earned diamonds — allowed under the gold-only economy (earn-only,
          // not purchasable). Separate ledger row so gold/diamonds each keep
          // their own idempotency ref under the same currency+refType+refId key.
          gemsBalance = await applyLedgerTx(tx, {
            userId,
            currency: "DIAMONDS",
            amount: gems,
            reason: "login_bonus",
            refType: "daily_login",
            refId: dayKey(now),
          });
        }
        if (gold === 0 && gems === 0) {
          // Both zero (an admin saved a 0/0 row) — nothing to credit, but the
          // claim itself (streak flip) already happened above; read balance.
          const u = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { gold: true } });
          goldBalance = u.gold;
        }
        return { day, gold, gems, goldBalance, gemsBalance };
      });
    } catch (e) {
      if (e instanceof Error && e.message === "ALREADY_CLAIMED") {
        throw err.conflict("ALREADY_CLAIMED", "You've already claimed today's login bonus.");
      }
      if (e instanceof Error && e.message === "NO_USER") {
        throw err.notFound("NO_USER", "User not found");
      }
      throw e;
    }

    return ok({
      claimed: true,
      day: result.day,
      rewardGold: result.gold,
      rewardGems: result.gems,
      goldBalance: result.goldBalance,
      gemsBalance: result.gemsBalance >= 0 ? result.gemsBalance : undefined,
      streak: result.day,
    });
  });
}
