import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  redis,
  queuePush,
  queuePopPair,
  getQueuedIn,
  setQueuedIn,
  createMatch,
  getMatch,
  saveMatch,
  removeMatch,
  spectatorAdd,
  spectatorRemove,
  spectatorCount,
  withLock,
  type QueueEntry,
  type StoredMatch,
} from "../src/realtime/store.js";
import { scheduleJob, cancelJob, claimDueJobs, type RtJobType } from "../src/realtime/jobs.js";

/**
 * T8 — the payoff test: prove the realtime layer is cluster-safe now that all
 * state lives in Redis (spec 2026-07-15-realtime-redis-scale-design.md §9).
 *
 * "Two instances" is modelled as two concurrent callers of the SAME store /
 * jobs primitives against ONE shared Redis — which is exactly the production
 * shape (every instance shares REDIS_URL; the socket.io redis-adapter fans out
 * events, but the AUTHORITATIVE state and the exactly-once guarantees are all
 * enforced by these Lua-atomic primitives, not by any single process). If two
 * simultaneous callers can't corrupt state here, N instances can't either.
 *
 * Every test is self-contained and cleans its own keys so the suite is
 * order-independent and safe to re-run. Redis-only (no Postgres) — runs locally
 * and in CI's redis service.
 */

// Unique per-run prefix so parallel CI shards never collide on fixed ids.
const uniq = () => `t8-${Math.floor(performance.now() * 1000)}-${Math.random().toString(36).slice(2, 8)}`;

function mkEntry(userId: string): QueueEntry {
  return { userId, joinedAt: 0, colorPref: "either" };
}

function mkMatch(matchId: string, redId: string, blueId: string): Omit<StoredMatch, "version"> {
  return {
    matchId,
    redId,
    blueId,
    mode: "CASUAL",
    // A minimal GameState-shaped object; T8 asserts on lifecycle/version, never the board.
    state: { board: [], turn: "red", moveCount: 0 } as unknown as StoredMatch["state"],
  };
}

describe("T8 cluster concurrency — exactly-once guarantees under two-instance races", () => {
  const spawned: string[] = [];
  function track(...keys: string[]) {
    spawned.push(...keys);
  }

  afterAll(async () => {
    if (spawned.length) await redis.del(...spawned);
  });

  // ── 1. Cross-instance pairing: two pollers pop the SAME 2-person queue; the
  //      pair is handed out exactly once (never the same user paired twice, never
  //      a torn half-pair). This is queuePopPair's Lua LPOP-both atomicity. ──────
  it("pairs each queued player exactly once even when two instances pop concurrently", async () => {
    const mode = `T8Q-${uniq()}`;
    track(`rt:mmq:${mode}`, `rt:mmqMeta:${mode}`);
    // 6 players → exactly 3 pairs, no matter how the two "instances" interleave.
    const users = Array.from({ length: 6 }, (_, i) => `u-${mode}-${i}`);
    for (const u of users) await queuePush(mode, mkEntry(u));

    // Two instances hammer popPair concurrently until the queue drains.
    const drain = async () => {
      const pairs: Array<[string, string]> = [];
      for (;;) {
        const p = await queuePopPair(mode);
        if (!p) break;
        pairs.push([p[0].userId, p[1].userId]);
      }
      return pairs;
    };
    const [pairsA, pairsB] = await Promise.all([drain(), drain()]);

    const allPaired = [...pairsA, ...pairsB].flat();
    // Every user paired EXACTLY once — no duplicate (double-pop) and none lost.
    expect(allPaired.sort()).toEqual([...users].sort());
    expect(new Set(allPaired).size).toBe(users.length);
    // Exactly 3 pairs total across both instances.
    expect(pairsA.length + pairsB.length).toBe(3);
    // Queue fully drained.
    expect(await redis.llen(`rt:mmq:${mode}`)).toBe(0);
    expect(await redis.hlen(`rt:mmqMeta:${mode}`)).toBe(0);
  });

  // ── 2. Settle-exactly-once: two instances both try to "settle" (remove) the
  //      same live match. CAS-versioned saveMatch means only one write wins per
  //      version; the settle primitive (getMatch → guard → removeMatch) fires its
  //      irreversible action once. Mirrors match.ts's DB-gated settle shape. ─────
  it("settles a match exactly once when two instances race the teardown", async () => {
    const matchId = `m-${uniq()}`;
    const redId = `r-${matchId}`;
    const blueId = `b-${matchId}`;
    track(`rt:match:${matchId}`, `rt:userMatch:${redId}`, `rt:userMatch:${blueId}`, `rt:spect:${matchId}`);
    await createMatch(mkMatch(matchId, redId, blueId));

    let settleCount = 0;
    // The real settle gate: read, ensure still present + not already settled,
    // then CAS a "settled" marker; the CAS winner performs the one-time action.
    const settle = async () => {
      const m = await getMatch(matchId);
      if (!m) return; // already gone
      // Attempt to claim settlement by bumping version via saveMatch (CAS).
      const claimed = await saveMatch({ ...m, state: { ...m.state, settled: true } as StoredMatch["state"] });
      if (!claimed) return; // lost the CAS race → someone else settles
      settleCount++;
      await removeMatch(m);
    };
    await Promise.all([settle(), settle(), settle(), settle()]);

    // Exactly one caller performed the irreversible settle.
    expect(settleCount).toBe(1);
    expect(await getMatch(matchId)).toBeNull();
    // userMatch index cleaned for both players.
    expect(await redis.smembers(`rt:userMatch:${redId}`)).toEqual([]);
    expect(await redis.smembers(`rt:userMatch:${blueId}`)).toEqual([]);
  });

  // ── 3. Bot-fill-exactly-once: two pollers claim the SAME due bot-fill job; the
  //      CLAIM_LUA (ZREM-then-return) hands each due member to exactly one poller. ─
  it("fires a due bot-fill job exactly once across two concurrent pollers", async () => {
    const key = `bf-${uniq()}`;
    track("rt:jobs", "rt:jobs:byKey");
    await scheduleJob("bot-fill", key, -1, { userId: key }); // already due (delay -1)

    // Two instances poll the same instant.
    const now = Date.now();
    const [a, b] = await Promise.all([claimDueJobs(now), claimDueJobs(now)]);
    const claimedThisKey = [...a, ...b].filter((j) => j.type === "bot-fill" && j.key === key);

    // Exactly one poller got this job; the other saw it gone.
    expect(claimedThisKey.length).toBe(1);
    // byKey index entry consumed so a later poll can't re-fire it.
    expect(await redis.hget("rt:jobs:byKey", `bot-fill:${key}`)).toBeNull();
    const again = await claimDueJobs(Date.now());
    expect(again.filter((j) => j.key === key).length).toBe(0);
  });

  // ── 4. Job survives "instance death": a job scheduled by instance A is claimed
  //      by instance B after A is gone (there is no in-process timer to die with
  //      it). Modelled: schedule, then a DIFFERENT caller claims it once due. ─────
  it("lets a second instance claim a job the first instance scheduled (survives death)", async () => {
    const key = `death-${uniq()}`;
    track("rt:jobs", "rt:jobs:byKey");
    // Instance A schedules a 40ms abandon-forfeit, then "dies" (we simply don't
    // poll from A).
    await scheduleJob("abandon-forfeit", key, 40, { matchId: key });
    // Not due yet.
    expect((await claimDueJobs(Date.now())).filter((j) => j.key === key).length).toBe(0);
    await new Promise((r) => setTimeout(r, 60));
    // Instance B claims it after A is gone.
    const claimed = (await claimDueJobs(Date.now())).filter((j) => j.type === "abandon-forfeit" && j.key === key);
    expect(claimed.length).toBe(1);
    expect(claimed[0].payload).toEqual({ matchId: key });
  });

  // ── 5. Job cancel/replace is atomic: scheduling the SAME (type,key) twice
  //      leaves ONE entry (SCHEDULE_LUA ZREMs the old member first), so a
  //      rescheduled bot-fill never double-fires. ───────────────────────────────
  it("re-scheduling a job replaces it (no duplicate fire)", async () => {
    const key = `replace-${uniq()}`;
    track("rt:jobs", "rt:jobs:byKey");
    await scheduleJob("bot-fill", key, -5, { v: 1 });
    await scheduleJob("bot-fill", key, -5, { v: 2 }); // replaces v1
    const claimed = (await claimDueJobs(Date.now())).filter((j) => j.key === key);
    expect(claimed.length).toBe(1);
    expect(claimed[0].payload).toEqual({ v: 2 });
  });

  it("cancelling a scheduled job prevents it firing", async () => {
    const key = `cancel-${uniq()}`;
    track("rt:jobs", "rt:jobs:byKey");
    await scheduleJob("bot-fill" as RtJobType, key, -5, {});
    await cancelJob("bot-fill" as RtJobType, key);
    expect((await claimDueJobs(Date.now())).filter((j) => j.key === key).length).toBe(0);
  });

  // ── 6. Spectator count is cluster-wide + SET-based (unique USERS, not sockets):
  //      a viewer joined on one "instance" is counted by another; a user's two
  //      tabs count ONCE; the user drops off only when their LAST socket leaves;
  //      a stale double-remove never underflows the count. ────────────────────────
  it("counts unique spectator users cluster-wide, multi-tab safe, no underflow", async () => {
    const matchId = `spec-${uniq()}`;
    const userA = `A-${matchId}`;
    const userB = `B-${matchId}`;
    track(`rt:spect:${matchId}`, `rt:spectSocks:${matchId}:${userA}`, `rt:spectSocks:${matchId}:${userB}`,
      `rt:spectByUser:${userA}`, `rt:spectByUser:${userB}`);
    // Two instances each add a spectator; the Lua returns the fresh unique-user count.
    expect(await spectatorAdd(matchId, userA, "sockA")).toBe(1);
    expect(await spectatorAdd(matchId, userB, "sockB")).toBe(2);
    // userA opens a SECOND tab from a third instance — still one unique user.
    expect(await spectatorAdd(matchId, userA, "sockA2")).toBe(2);
    expect(await spectatorCount(matchId)).toBe(2);

    // userA's first tab closes — still watching on the second, count unchanged.
    expect(await spectatorRemove(matchId, userA, "sockA")).toBe(2);
    // Idempotent: removing the same (already-gone) socket again is a no-op.
    expect(await spectatorRemove(matchId, userA, "sockA")).toBe(2);
    // userA's last tab closes — now they drop off the count.
    expect(await spectatorRemove(matchId, userA, "sockA2")).toBe(1);
    // A stale remove for a user with no sockets left never underflows below the real total.
    expect(await spectatorRemove(matchId, userA, "sockA2")).toBe(1);
    expect(await spectatorCount(matchId)).toBe(1);
  });

  // ── 7. NEW FIX (b): the queue-membership pointer is namespaced per family, so a
  //      user simultaneously in Classic and Damath has TWO independent pointers;
  //      one family's cancel never clears the other's. ──────────────────────────
  it("keeps Classic and Damath queue pointers independent (no cross-mode collision)", async () => {
    const u = `dual-${uniq()}`;
    track(`rt:queuedIn:${u}`, `rt:queuedIn:damath:${u}`);
    await setQueuedIn(u, "CASUAL"); // classic family (default)
    await setQueuedIn(u, "DAMATH", "damath"); // damath family
    // Each family reads its OWN mode.
    expect(await getQueuedIn(u)).toBe("CASUAL");
    expect(await getQueuedIn(u, "damath")).toBe("DAMATH");
    // The exact classic key is preserved verbatim (no migration for in-flight waiters).
    expect(await redis.get(`rt:queuedIn:${u}`)).toBe("CASUAL");
    expect(await redis.get(`rt:queuedIn:damath:${u}`)).toBe("DAMATH");
    // Damath leaving clears ONLY its own pointer; Classic is untouched.
    await setQueuedIn(u, null, "damath");
    expect(await getQueuedIn(u, "damath")).toBeNull();
    expect(await getQueuedIn(u)).toBe("CASUAL");
  });

  // ── 8. withLock serializes a read-modify-write across two instances: two
  //      concurrent increments of a Redis counter under the same lock never lose
  //      an update (the classic lost-update the lock exists to prevent). ─────────
  it("withLock serializes a cross-instance read-modify-write (no lost update)", async () => {
    const ctr = `rmw-${uniq()}`;
    const lock = `rmwlock-${uniq()}`;
    track(ctr, `rt:lock:${lock}`);
    await redis.set(ctr, "0");
    // Each "instance" does 10 non-atomic get→+1→set cycles under the lock.
    const bump = async () => {
      for (let i = 0; i < 10; i++) {
        const r = await withLock(lock, async () => {
          const cur = parseInt((await redis.get(ctr)) ?? "0", 10);
          // Force a scheduling gap between read and write to expose lost updates.
          await new Promise((res) => setTimeout(res, 2));
          await redis.set(ctr, String(cur + 1));
          return "ok";
        });
        // If the lock was busy after retries, retry this iteration so the test
        // asserts on serialization, not on lock-give-up timing.
        if (r !== "ok") i--;
      }
    };
    await Promise.all([bump(), bump()]);
    // 20 increments, none lost.
    expect(parseInt((await redis.get(ctr)) ?? "0", 10)).toBe(20);
  });
});
