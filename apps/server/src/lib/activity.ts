import { prisma } from "../db/client.js";

/**
 * Records that [userId] was active today (UTC), exactly once per user per day.
 *
 * This is the write side of the DailyActivity per-day activity log that real
 * retention (D1/D7/D30, cohorts in admin analytics) needs — User.lastSeenAt is
 * a single mutable timestamp and can't tell you WHICH days a user was active.
 *
 * Called from the presence hook (when a user comes online) alongside the
 * lastSeenAt stamp. Idempotent via the (userId, day) unique constraint: the
 * upsert no-ops if the row already exists, so calling it many times a day costs
 * at most one INSERT and otherwise a cheap conflict. Best-effort — a failure
 * here must never break the request/socket flow, so callers should catch/ignore.
 */
export async function recordDailyActivity(userId: string): Promise<void> {
  const day = utcMidnight(new Date());
  await prisma.dailyActivity.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day },
    update: {}, // already recorded for today — no-op
  });
}

/** Midnight (00:00:00.000) UTC of the given instant's date. */
export function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
