import { describe, it, expect, afterEach, afterAll, beforeEach } from "vitest";
import { prisma } from "../src/db/client.js";
import { seedUser, truncateAll } from "./helpers.js";
import { sweepAbandonedMatches } from "../src/realtime/match.js";
import { redis } from "../src/realtime/store.js";

/**
 * Backstop sweeper for lost abandon-forfeit jobs (final-review finding #3).
 * DB-backed (verifies in CI). We drive sweepAbandonedMatches directly with a
 * minimal `io` stub whose fetchSockets() reports every user OFFLINE, and assert
 * it force-closes a stranded still-open match through the same DB gate — without
 * inventing a winner (draw, no gold, no trophies) — while leaving fresh matches
 * and already-closed matches untouched.
 */

// STRANDED_MS in match.ts is 5 min; anything older than that + offline is swept.
const OLD = () => new Date(Date.now() - 10 * 60_000); // 10 min ago → past the window
const FRESH = () => new Date(Date.now() - 30_000); // 30s ago → inside the window

/** Minimal socket.io stub: every presence room is empty (all users offline). */
function offlineIo() {
  return { in: () => ({ fetchSockets: async () => [] }), to: () => ({ emit: () => {} }) } as never;
}

async function seedMatch(o: Partial<{ redId: string; blueId: string; startedAt: Date; endedAt: Date | null }> = {}) {
  const red = o.redId ?? (await seedUser({ trophies: 1200 })).id;
  const blue = o.blueId ?? (await seedUser({ trophies: 900 })).id;
  return prisma.match.create({
    data: {
      mode: "RANKED",
      redId: red,
      blueId: blue,
      settings: {},
      moves: [],
      startedAt: o.startedAt ?? new Date(),
      endedAt: o.endedAt === undefined ? null : o.endedAt,
    },
  });
}

describe("sweepAbandonedMatches — abandoned-match backstop", () => {
  beforeEach(truncateAll);
  afterEach(async () => {
    // Clear any Redis match remnants a test created.
    const keys = await redis.keys("rt:match:*");
    if (keys.length) await redis.del(...keys);
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("closes a stranded open match (old, offline, no Redis state) as a draw — no winner invented", async () => {
    const m = await seedMatch({ startedAt: OLD() });
    const res = await sweepAbandonedMatches(offlineIo());
    expect(res.closed).toBe(1);
    const after = await prisma.match.findUnique({ where: { id: m.id } });
    expect(after?.endedAt).not.toBeNull();
    // Money-safe: a draw awards no gold and no trophies to anyone.
    expect(after?.winner).toBe("draw");
    expect(after?.reason).toBe("abandon");
    expect(after?.goldReward).toBe(0);
    // No trophy ledger entries were written for this match.
    const trophyEntries = await prisma.ledgerEntry.count({ where: { refType: "match", refId: m.id } });
    expect(trophyEntries).toBe(0);
  });

  it("leaves a FRESH open match alone (still inside the stranded window)", async () => {
    const m = await seedMatch({ startedAt: FRESH() });
    const res = await sweepAbandonedMatches(offlineIo());
    expect(res.closed).toBe(0);
    expect(res.swept).toBe(0);
    const after = await prisma.match.findUnique({ where: { id: m.id } });
    expect(after?.endedAt).toBeNull(); // untouched
  });

  it("never re-closes an already-settled match (idempotent — the DB gate holds)", async () => {
    const m = await seedMatch({ startedAt: OLD(), endedAt: new Date() });
    const res = await sweepAbandonedMatches(offlineIo());
    expect(res.closed).toBe(0);
    // Its endedAt is unchanged (not re-stamped).
    const after = await prisma.match.findUnique({ where: { id: m.id } });
    expect(after?.endedAt?.getTime()).toBe(m.endedAt!.getTime());
  });

  it("re-running the sweep is idempotent (closed once, then nothing left to close)", async () => {
    await seedMatch({ startedAt: OLD() });
    const first = await sweepAbandonedMatches(offlineIo());
    expect(first.closed).toBe(1);
    const second = await sweepAbandonedMatches(offlineIo());
    expect(second.closed).toBe(0);
    expect(second.swept).toBe(0);
  });
});
