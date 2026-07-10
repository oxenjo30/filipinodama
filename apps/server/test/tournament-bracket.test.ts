import { describe, it, expect } from "vitest";
import { seedPairings, parentSlot, computePlacements } from "../src/lib/tournament-bracket.js";

describe("seedPairings (pure, no DB)", () => {
  it("n=8 → 4 balanced pairings covering the standard seed set: {1,8} {4,5} {3,6} {2,7}, one pairing per slot 0..3", () => {
    const pairs = seedPairings(8, 8);
    expect(pairs.length).toBe(4);
    // Every pairing sums to n+1 (standard bracket property: top seed vs bottom seed).
    for (const p of pairs) expect(p.top + p.bottom).toBe(9);
    // The exact unordered pairing set required by the design doc.
    const asSets = pairs.map((p) => [p.top, p.bottom].sort((a, b) => a - b));
    const expectedSets = [
      [1, 8],
      [4, 5],
      [3, 6],
      [2, 7],
    ];
    for (const expected of expectedSets) {
      expect(asSets).toContainEqual(expected);
    }
    // Slot indices are a contiguous 0..3 range with no duplicates.
    expect(pairs.map((p) => p.slot).sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
    // Top seeds (1 and 2) must be able to meet only in the final: they must not
    // be paired against each other in round 1.
    const seed1Pair = pairs.find((p) => p.top === 1 || p.bottom === 1)!;
    expect(seed1Pair.top === 2 || seed1Pair.bottom === 2).toBe(false);
  });

  it("n=6, B=8 → seeds 7 and 8 (the absent slots) produce byes for seeds 1 and 2", () => {
    const pairs = seedPairings(6, 8);
    expect(pairs.length).toBe(4);
    for (const p of pairs) expect(p.top + p.bottom).toBe(9);
    // seeds 7 and 8 don't exist among the 6 entries → the pairings containing
    // them are byes for whichever real seed (1 or 2) they were matched against.
    const byePairs = pairs.filter((p) => p.top > 6 || p.bottom > 6);
    expect(byePairs.length).toBe(2);
    const byeRealSeeds = byePairs.map((p) => (p.top > 6 ? p.bottom : p.top)).sort((a, b) => a - b);
    expect(byeRealSeeds).toEqual([1, 2]);
  });

  it("n=2 → single final pairing (1v2)", () => {
    const pairs = seedPairings(2, 2);
    expect(pairs).toEqual([{ slot: 0, top: 1, bottom: 2 }]);
  });
});

describe("parentSlot (pure, no DB)", () => {
  it("(1,0) and (1,1) both feed (2,0)", () => {
    expect(parentSlot(1, 0)).toEqual({ round: 2, slot: 0 });
    expect(parentSlot(1, 1)).toEqual({ round: 2, slot: 0 });
  });

  it("(1,2) and (1,3) both feed (2,1)", () => {
    expect(parentSlot(1, 2)).toEqual({ round: 2, slot: 1 });
    expect(parentSlot(1, 3)).toEqual({ round: 2, slot: 1 });
  });
});

describe("computePlacements (pure, no DB)", () => {
  it("assigns champion=1, runner-up=2 — exactly one of each", () => {
    const matches = [
      { round: 1, slot: 0, redEntryId: "A", blueEntryId: "B", winnerEntryId: "A", status: "done" },
      { round: 1, slot: 1, redEntryId: "C", blueEntryId: "D", winnerEntryId: "C", status: "done" },
      { round: 2, slot: 0, redEntryId: "A", blueEntryId: "C", winnerEntryId: "A", status: "done" },
    ];
    const placements = computePlacements(matches);
    const champs = placements.filter((p) => p.placement === 1);
    const runnersUp = placements.filter((p) => p.placement === 2);
    expect(champs.length).toBe(1);
    expect(champs[0]!.entryId).toBe("A");
    expect(runnersUp.length).toBe(1);
    expect(runnersUp[0]!.entryId).toBe("C");
  });

  it("never returns more than one entry at placement 1 and never more than one at placement 2", () => {
    // Larger 8-player bracket
    const matches = [
      { round: 1, slot: 0, redEntryId: "1", blueEntryId: "8", winnerEntryId: "1", status: "done" },
      { round: 1, slot: 1, redEntryId: "4", blueEntryId: "5", winnerEntryId: "4", status: "done" },
      { round: 1, slot: 2, redEntryId: "3", blueEntryId: "6", winnerEntryId: "3", status: "done" },
      { round: 1, slot: 3, redEntryId: "2", blueEntryId: "7", winnerEntryId: "2", status: "done" },
      { round: 2, slot: 0, redEntryId: "1", blueEntryId: "4", winnerEntryId: "1", status: "done" },
      { round: 2, slot: 1, redEntryId: "3", blueEntryId: "2", winnerEntryId: "2", status: "done" },
      { round: 3, slot: 0, redEntryId: "1", blueEntryId: "2", winnerEntryId: "1", status: "done" },
    ];
    const placements = computePlacements(matches);
    expect(placements.filter((p) => p.placement === 1).length).toBe(1);
    expect(placements.filter((p) => p.placement === 2).length).toBe(1);
  });
});
