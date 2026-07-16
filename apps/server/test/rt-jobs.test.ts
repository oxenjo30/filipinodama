import { describe, it, expect, afterAll } from "vitest";
import { redis } from "../src/realtime/store.js";
import { scheduleJob, cancelJob, claimDueJobs, startJobPoller } from "../src/realtime/jobs.js";

describe("rt delayed jobs", () => {
  afterAll(async () => { await redis.del("rt:jobs", "rt:jobs:byKey"); });

  it("a due job is claimed by exactly ONE of N concurrent claimers", async () => {
    await scheduleJob("bot-fill", "u1", 0, { userId: "u1", mode: "CASUAL" });
    await new Promise((r) => setTimeout(r, 10));
    const now = Date.now();
    const results = await Promise.all([claimDueJobs(now), claimDueJobs(now), claimDueJobs(now), claimDueJobs(now)]);
    const total = results.reduce((n, r) => n + r.length, 0);
    expect(total).toBe(1);
    expect(results.flat()[0]).toMatchObject({ type: "bot-fill", key: "u1", payload: { userId: "u1", mode: "CASUAL" } });
  });

  it("cancelJob removes a scheduled job before it fires", async () => {
    await scheduleJob("abandon-forfeit", "m1:u1", 0, { matchId: "m1", userId: "u1" });
    await cancelJob("abandon-forfeit", "m1:u1");
    expect(await claimDueJobs(Date.now() + 1000)).toEqual([]);
  });

  it("re-scheduling the same (type,key) replaces the old fire time", async () => {
    await scheduleJob("bot-fill", "u2", 60_000, { userId: "u2" });
    await scheduleJob("bot-fill", "u2", 0, { userId: "u2" });
    const due = await claimDueJobs(Date.now() + 10);
    expect(due).toHaveLength(1);
    expect(await claimDueJobs(Date.now() + 120_000)).toEqual([]); // no duplicate left behind
  });

  it("poller dispatches to the registered handler exactly once across two pollers", async () => {
    let fires = 0;
    const stop1 = startJobPoller({ "bot-fill": async () => { fires++; } }, 50);
    const stop2 = startJobPoller({ "bot-fill": async () => { fires++; } }, 50);
    await scheduleJob("bot-fill", "u3", 60, { userId: "u3" });
    await new Promise((r) => setTimeout(r, 500));
    stop1(); stop2();
    expect(fires).toBe(1);
  });
});
