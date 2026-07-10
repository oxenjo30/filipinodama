import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { applyLedgerTx } from "../economy/ledger.js";
import { requireAuth } from "../auth/guards.js";
import { getBool } from "../lib/config-service.js";

/**
 * Daily Login Bonus — server-authoritative (a client localStorage streak, as in
 * the prototype, is trivially farmable). Gold grows across a 7-day track, then
 * cycles. Claim once per UTC day; miss a day → streak resets to day 1.
 *
 *   GET  /api/rewards/daily-login  → status (day, claimedToday, track, streak)
 *   POST /api/rewards/daily-login  → claim today's bonus (idempotent per day)
 */

// The 7-day reward curve (gold), ported from the prototype's _loginRewards().
// Gold-only economy, so no diamonds here.
const LOGIN_REWARDS = [100, 150, 200, 300, 400, 500, 1000] as const;
const CYCLE = LOGIN_REWARDS.length; // 7

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
    return ok({
      day, // 1..7 — the day the player is on today
      claimedToday, // already collected today's bonus?
      rewardToday: LOGIN_REWARDS[day - 1], // gold for `day`
      track: [...LOGIN_REWARDS], // the full 7-day curve for the modal
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

    let result: { day: number; gold: number; goldBalance: number };
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

        const gold = LOGIN_REWARDS[day - 1];
        // refId is the UTC day key so the ledger unique-constraint also guards
        // against a second credit for the same calendar day.
        const goldBalance = await applyLedgerTx(tx, {
          userId,
          currency: "GOLD",
          amount: gold,
          reason: "login_bonus",
          refType: "daily_login",
          refId: dayKey(now),
        });
        return { day, gold, goldBalance };
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
      goldBalance: result.goldBalance,
      streak: result.day,
    });
  });
}
