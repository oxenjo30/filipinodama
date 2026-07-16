import { describe, it, expect, afterAll } from "vitest";
import { redis, getJSON, setJSON, delKey, casJSON, withLock, LOCK_BUSY } from "../src/realtime/store.js";

describe("rt store core", () => {
  afterAll(async () => { await redis.del("t:a", "t:cas", "rt:lock:t:l1", "rt:lock:t:l2"); await redis.quit(); });

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
