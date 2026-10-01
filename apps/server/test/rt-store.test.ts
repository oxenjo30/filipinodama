import { describe, it, expect, afterAll } from "vitest";
import { redis, getJSON, setJSON, delKey, casJSON, withLock, LOCK_BUSY } from "../src/realtime/store.js";

describe("rt store core", () => {
  afterAll(async () => { await redis.del("t:a", "t:cas", "rt:lock:t:l1", "rt:lock:t:l2"); });

  it("round-trips JSON with TTL", async () => {
    await setJSON("t:a", { x: 1 }, 60);
    expect(await getJSON<{ x: number }>("t:a")).toEqual({ x: 1 });
    expect(await redis.ttl("t:a")).toBeGreaterThan(0);
    await delKey("t:a");
    expect(await getJSON("t:a")).toBeNull();
  });

  it("casJSON: version-guarded write; stale writer loses", async () => {
    expect(await casJSON("t:cas", { version: 0, v: "first" } as any, 60)).toBe(true);   // create
    const cur = await getJSON<any>("t:cas");
    expect(cur.version).toBe(1);
    expect(await casJSON("t:cas", { ...cur, v: "second" }, 60)).toBe(true);             // version 1 -> 2
    expect(await casJSON("t:cas", { ...cur, v: "stale" }, 60)).toBe(false);             // stale version 1 rejected
    expect((await getJSON<any>("t:cas")).v).toBe("second");
  });

  it("withLock: serializes two racers; loser gets LOCK_BUSY or waits", async () => {
    const order: string[] = [];
    const a = withLock("t:l1", async () => { order.push("a-in"); await new Promise(r => setTimeout(r, 300)); order.push("a-out"); return "a"; });
    await new Promise(r => setTimeout(r, 30));
    const b = withLock("t:l1", async () => { order.push("b-in"); return "b"; });
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toBe("a");
    // b either acquired AFTER a released (ordering intact) or reported busy after retries
    if (rb === LOCK_BUSY) expect(order).toEqual(["a-in", "a-out"]);
    else expect(order).toEqual(["a-in", "a-out", "b-in"]);
  });

  it("withLock: releases only its own token (expiry-safe)", async () => {
    const r = await withLock("t:l2", async () => 42);
    expect(r).toBe(42);
    expect(await redis.get("rt:lock:t:l2")).toBeNull();
  });
});

describe("rt domain wrappers", () => {
  afterAll(async () => {
    await redis.del(
      "rt:match:tm1",
      "rt:userMatch:u1",
      "rt:userMatch:u2",
      "rt:mmq:CASUAL",
      "rt:mmqMeta:CASUAL",
      "rt:queuedIn:u1",
      "rt:queuedIn:u2",
      "rt:queuedIn:u3",
      "rt:spect:tm1",
      "rt:spectSocks:tm1:u1",
      "rt:spectSocks:tm1:u2",
      "rt:spectByUser:u1",
      "rt:spectByUser:u2",
      "rt:online",
      "rt:onlineSocks:u1",
      "rt:onlineSocks:u2",
      "rt:onlineSocks:pr",
      "rt:spect:m",
      "rt:spectSocks:m:su",
      "rt:spectByUser:su"
    );
  });

  it("match: create, get, save (CAS), remove + matchIdsForUser", async () => {
    const { createMatch, getMatch, saveMatch, removeMatch, matchIdsForUser } = await import("../src/realtime/store.js");

    // Create with a valid GameState
    const mockState = {
      id: "game-1",
      pieces: [],
      turn: "red" as const,
      moveNumber: 0,
      history: [],
      settings: { forcedMaxCapture: true, drawMoveLimit: 40 }
    };
    await createMatch({
      matchId: "tm1",
      redId: "u1",
      blueId: "u2",
      mode: "CASUAL",
      state: mockState
    });

    // Get
    let stored = await getMatch("tm1");
    expect(stored).not.toBeNull();
    expect(stored!.matchId).toBe("tm1");
    expect(stored!.redId).toBe("u1");
    expect(stored!.blueId).toBe("u2");
    expect(stored!.version).toBe(1); // incremented from 0

    // matchIdsForUser reflects the create
    expect(await matchIdsForUser("u1")).toContain("tm1");
    expect(await matchIdsForUser("u2")).toContain("tm1");

    // Save (CAS with correct version)
    stored!.state = { ...mockState, moveNumber: 1 };
    const saveOk = await saveMatch(stored!);
    expect(saveOk).toBe(true);
    const after = await getMatch("tm1");
    expect(after!.version).toBe(2);
    expect(after!.state.moveNumber).toBe(1);

    // CAS conflict: stale version rejected
    const staleOk = await saveMatch({ ...stored!, version: 1 });
    expect(staleOk).toBe(false);

    // Remove
    await removeMatch(after!);
    expect(await getMatch("tm1")).toBeNull();
    expect(await matchIdsForUser("u1")).not.toContain("tm1");
    expect(await matchIdsForUser("u2")).not.toContain("tm1");
  });

  it("queue: queuePopPair null with 1 entry, FIFO pair with 2+", async () => {
    const { queuePush, queuePopPair, getQueuedIn } = await import("../src/realtime/store.js");

    // Pop from empty → null
    let pair = await queuePopPair("CASUAL");
    expect(pair).toBeNull();

    // Push 1 entry
    await queuePush("CASUAL", { userId: "u1", joinedAt: 100, colorPref: "red" });
    // Pop with 1 entry → null
    pair = await queuePopPair("CASUAL");
    expect(pair).toBeNull();

    // Push 2 more (now 2 total: u1 and u2, u3)
    await queuePush("CASUAL", { userId: "u2", joinedAt: 200, colorPref: "blue" });
    // Pop with 2 entries → FIFO pair
    pair = await queuePopPair("CASUAL");
    expect(pair).not.toBeNull();
    expect(pair![0].userId).toBe("u1");
    expect(pair![1].userId).toBe("u2");
  });

  it("queue: concurrent-style duplicate enqueue keeps one seat per user", async () => {
    const { queuePush, queuePopPair, redis: redisExport } = await import("../src/realtime/store.js");
    const mode = "RANKED";

    await Promise.all([
      queuePush(mode, { userId: "same-user", joinedAt: 100, colorPref: "red" }),
      queuePush(mode, { userId: "same-user", joinedAt: 101, colorPref: "blue" }),
    ]);
    expect(await redisExport.lrange(`rt:mmq:${mode}`, 0, -1)).toEqual(["same-user"]);

    await queuePush(mode, { userId: "opponent", joinedAt: 200, colorPref: "either" });
    const pair = await queuePopPair(mode);
    expect(pair?.map((entry) => entry.userId)).toEqual(["same-user", "opponent"]);
    expect(pair?.[0].userId).not.toBe(pair?.[1].userId);
  });

  it("queue: concurrent cross-mode joins leave one Classic seat with matching metadata and pointer", async () => {
    const { queueJoinClassic, redis: redisExport } = await import("../src/realtime/store.js");
    const userId = "cross-mode-user";
    await Promise.all([
      queueJoinClassic("CASUAL", { userId, joinedAt: 100, colorPref: "red" }),
      queueJoinClassic("RANKED", { userId, joinedAt: 101, colorPref: "blue" }),
    ]);

    const pointer = await redisExport.get(`rt:queuedIn:${userId}`);
    expect(["CASUAL", "RANKED"]).toContain(pointer);
    const casual = await redisExport.lrange("rt:mmq:CASUAL", 0, -1);
    const ranked = await redisExport.lrange("rt:mmq:RANKED", 0, -1);
    expect([...casual, ...ranked]).toEqual([userId]);
    expect(pointer === "CASUAL" ? casual : ranked).toEqual([userId]);
    const selectedMeta = await redisExport.hget(`rt:mmqMeta:${pointer}`, userId);
    const otherMeta = await redisExport.hget(`rt:mmqMeta:${pointer === "CASUAL" ? "RANKED" : "CASUAL"}`, userId);
    expect(JSON.parse(selectedMeta ?? "null")?.userId).toBe(userId);
    expect(otherMeta).toBeNull();
  });

  it("queue: pairing clears matched pointers but preserves a newer different-mode pointer", async () => {
    const { queueJoinClassic, queuePush, queuePopPair, setQueuedIn, getQueuedIn } = await import("../src/realtime/store.js");
    await queueJoinClassic("CASUAL", { userId: "paired-a", joinedAt: 100, colorPref: "either" });
    await queueJoinClassic("CASUAL", { userId: "paired-b", joinedAt: 101, colorPref: "either" });
    expect(await queuePopPair("CASUAL")).not.toBeNull();
    expect(await getQueuedIn("paired-a")).toBeNull();
    expect(await getQueuedIn("paired-b")).toBeNull();

    await queuePush("CASUAL", { userId: "stale-a", joinedAt: 200, colorPref: "either" });
    await queuePush("CASUAL", { userId: "stale-b", joinedAt: 201, colorPref: "either" });
    await setQueuedIn("stale-a", "RANKED");
    await setQueuedIn("stale-b", "RANKED");
    expect(await queuePopPair("CASUAL")).not.toBeNull();
    expect(await getQueuedIn("stale-a")).toBe("RANKED");
    expect(await getQueuedIn("stale-b")).toBe("RANKED");
  });

  it("queue: concurrent Classic join and leave finish in a coherent state", async () => {
    const { queueJoinClassic, queueLeaveClassic, getQueuedIn, redis: redisExport } = await import("../src/realtime/store.js");
    const userId = "join-leave-user";
    await Promise.all([
      queueJoinClassic("RANKED", { userId, joinedAt: 300, colorPref: "either" }),
      queueLeaveClassic(userId),
    ]);
    const pointer = await getQueuedIn(userId);
    const seats = [
      ...(await redisExport.lrange("rt:mmq:CASUAL", 0, -1)),
      ...(await redisExport.lrange("rt:mmq:RANKED", 0, -1)),
    ].filter((id) => id === userId);
    expect(pointer === null ? seats : [pointer, ...seats]).toEqual(pointer === null ? [] : ["RANKED", userId]);
  });

  it("queue: legacy duplicate list entries are scrubbed before returning a pair", async () => {
    const { queuePopPair, redis: redisExport } = await import("../src/realtime/store.js");
    const mode = "CASUAL";
    const duplicate = { userId: "same-user", joinedAt: 100, colorPref: "either" };
    const opponent = { userId: "opponent", joinedAt: 200, colorPref: "either" };
    await redisExport.rpush(`rt:mmq:${mode}`, duplicate.userId, duplicate.userId, opponent.userId, duplicate.userId);
    await redisExport.hset(`rt:mmqMeta:${mode}`, duplicate.userId, JSON.stringify(duplicate));
    await redisExport.hset(`rt:mmqMeta:${mode}`, opponent.userId, JSON.stringify(opponent));

    const pair = await queuePopPair(mode);
    expect(pair?.map((entry) => entry.userId)).toEqual([duplicate.userId, opponent.userId]);
    expect(pair?.[0].userId).not.toBe(pair?.[1].userId);
    expect(await redisExport.lrange(`rt:mmq:${mode}`, 0, -1)).toEqual([]);
  });

  it("queue: queueRemove removes mid-list entry", async () => {
    const { queuePush, queueRemove, redis: redisExport } = await import("../src/realtime/store.js");

    const mode = "CASUAL-remove-test";
    await queuePush(mode, { userId: "u1", joinedAt: 100, colorPref: "red" });
    await queuePush(mode, { userId: "u2", joinedAt: 200, colorPref: "blue" });
    await queuePush(mode, { userId: "u3", joinedAt: 300, colorPref: "either" });

    // Remove middle entry u2
    await queueRemove(mode, "u2");

    // Verify u2 is gone from list and meta
    const list = await redis.lrange(`rt:mmq:${mode}`, 0, -1);
    expect(list).toEqual(["u1", "u3"]);
    const meta = await redis.hget(`rt:mmqMeta:${mode}`, "u2");
    expect(meta).toBeNull();

    // Clean up
    await redis.del(`rt:mmq:${mode}`, `rt:mmqMeta:${mode}`);
  });

  it("spectators: count unique users, not sockets", async () => {
    const { spectatorAdd, spectatorRemove, spectatorCount, spectatorClear } = await import("../src/realtime/store.js");

    // Add u1 with 2 sockets
    let count = await spectatorAdd("tm1", "u1", "sock1");
    expect(count).toBe(1); // 1 unique user
    count = await spectatorAdd("tm1", "u1", "sock2");
    expect(count).toBe(1); // still 1 unique user, sock2 added to u1's list

    // Add u2 with 1 socket
    count = await spectatorAdd("tm1", "u2", "sock3");
    expect(count).toBe(2); // now 2 unique users

    // Remove u1's first socket
    count = await spectatorRemove("tm1", "u1", "sock1");
    expect(count).toBe(2); // u1 still has sock2, u2 still there

    // Remove u1's last socket
    count = await spectatorRemove("tm1", "u1", "sock2");
    expect(count).toBe(1); // u1 gone, u2 remains

    // Clear all
    await spectatorClear("tm1");
    count = await spectatorCount("tm1");
    expect(count).toBe(0);
  });

  it("presence: presenceAdd first socket returns true, second false", async () => {
    const { presenceAdd, presenceRemove, presenceIsOnline } = await import("../src/realtime/store.js");

    // First socket → offline to online (true)
    let wasOffline = await presenceAdd("u1", "sock1");
    expect(wasOffline).toBe(true);
    expect(await presenceIsOnline("u1")).toBe(true);

    // Second socket → already online (false)
    wasOffline = await presenceAdd("u1", "sock2");
    expect(wasOffline).toBe(false);
    expect(await presenceIsOnline("u1")).toBe(true);
  });

  it("presence: presenceRemove last socket returns true", async () => {
    const { presenceAdd, presenceRemove, presenceIsOnline } = await import("../src/realtime/store.js");

    // Add two sockets
    await presenceAdd("u2", "sock1");
    await presenceAdd("u2", "sock2");
    expect(await presenceIsOnline("u2")).toBe(true);

    // Remove first socket → still online (false)
    let wentOffline = await presenceRemove("u2", "sock1");
    expect(wentOffline).toBe(false);
    expect(await presenceIsOnline("u2")).toBe(true);

    // Remove last socket → now offline (true)
    wentOffline = await presenceRemove("u2", "sock2");
    expect(wentOffline).toBe(true);
    expect(await presenceIsOnline("u2")).toBe(false);
  });

  it("presence: concurrent presenceAdd for the same user never loses the rt:online entry (TOCTOU race)", async () => {
    const { presenceAdd, presenceIsOnline, presenceOnlineIds } = await import("../src/realtime/store.js");

    await Promise.all([presenceAdd("pr", "s1"), presenceAdd("pr", "s2")]);

    expect(await presenceIsOnline("pr")).toBe(true);
    expect(await presenceOnlineIds()).toContain("pr");

    await redis.del("rt:onlineSocks:pr");
    await redis.srem("rt:online", "pr");
  });

  it("spectators: concurrent spectatorAdd for the same user never loses a socketId (read-modify-write race)", async () => {
    const { spectatorAdd, spectatorRemove } = await import("../src/realtime/store.js");

    await Promise.all([spectatorAdd("m", "su", "sa"), spectatorAdd("m", "su", "sb")]);

    // Both sockets must have survived. Removing EITHER ONE ALONE must not drop the
    // user out (the other socket keeps them counted); the user only disappears once
    // BOTH are removed. A lost-write race collapses to a single surviving socket, so
    // whichever one was actually stored gets removed by the *other* remove call and
    // the count would drop to 0 one step early. Check both orders defensively.
    let count = await spectatorRemove("m", "su", "sa");
    expect(count).toBe(1); // "sb" must still be present, user still counted
    count = await spectatorRemove("m", "su", "sb");
    expect(count).toBe(0); // last socket removed, user gone

    // Re-run with the opposite removal order to catch a race that always keeps
    // whichever socketId happens to win the read-modify-write (order-dependent bug).
    await Promise.all([spectatorAdd("m", "su", "sc"), spectatorAdd("m", "su", "sd")]);
    count = await spectatorRemove("m", "su", "sd");
    expect(count).toBe(1); // "sc" must still be present, user still counted
    count = await spectatorRemove("m", "su", "sc");
    expect(count).toBe(0);

    await redis.del("rt:spectSocks:m:su", "rt:spect:m", "rt:spectByUser:su");
  });
});
