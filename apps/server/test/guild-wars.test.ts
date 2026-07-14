import { describe, it, expect } from "vitest";
import { rewardForRank, splitReward } from "../src/lib/guild-wars.js";

describe("guild-wars reward math", () => {
  it("rewardForRank: rank 1 gets full pool, lower ranks scale ~60%", () => {
    expect(rewardForRank(1, 5000)).toBe(5000);
    expect(rewardForRank(2, 5000)).toBe(3000); // 60%
    expect(rewardForRank(3, 5000)).toBe(1800); // 36%
    expect(rewardForRank(0, 5000)).toBe(0);
    expect(rewardForRank(-1, 5000)).toBe(0);
  });

  it("splitReward: proportional to contribution, floored, zero-shares dropped", () => {
    const shares = splitReward(1000, [
      { userId: "a", weeklyContribution: 60 }, // 60% -> 600
      { userId: "b", weeklyContribution: 30 }, // 30% -> 300
      { userId: "c", weeklyContribution: 10 }, // 10% -> 100
    ]);
    expect(shares).toEqual([
      { userId: "a", share: 600 },
      { userId: "b", share: 300 },
      { userId: "c", share: 100 },
    ]);
    // Never over-pays the pool (floor keeps sum <= reward).
    expect(shares.reduce((s, x) => s + x.share, 0)).toBeLessThanOrEqual(1000);
  });

  it("splitReward: a member with 0 contribution gets nothing", () => {
    const shares = splitReward(1000, [
      { userId: "a", weeklyContribution: 100 },
      { userId: "b", weeklyContribution: 0 },
    ]);
    expect(shares).toEqual([{ userId: "a", share: 1000 }]);
  });

  it("splitReward: no contributors / zero reward → empty (no negative or NaN)", () => {
    expect(splitReward(1000, [])).toEqual([]);
    expect(splitReward(0, [{ userId: "a", weeklyContribution: 50 }])).toEqual([]);
    expect(splitReward(1000, [{ userId: "a", weeklyContribution: 0 }])).toEqual([]);
  });

  it("splitReward: uneven split floors and never exceeds the pool", () => {
    const shares = splitReward(100, [
      { userId: "a", weeklyContribution: 1 },
      { userId: "b", weeklyContribution: 1 },
      { userId: "c", weeklyContribution: 1 },
    ]);
    // 100/3 = 33.33 -> 33 each = 99 total (1 gold unallocated, never over-paid).
    expect(shares.every((s) => s.share === 33)).toBe(true);
    expect(shares.reduce((s, x) => s + x.share, 0)).toBe(99);
  });
});
