import { describe, it, expect } from "vitest";
import {
  groupStageShape,
  snakeDraftGroups,
  seedPlayoffFromGroups,
  parentSlot,
  type GroupQualifier,
} from "../src/lib/tournament-bracket.js";
import { bracketOfRound, roundLabel, G_ROUND_OFFSET } from "@dama/shared";

/**
 * GROUP_DOUBLE_ELIM pure helpers — shape validation, the group draw, and the
 * cross-group playoff seeding.
 *
 * The seeding tests are the point of this file. The naive reading of "top N to
 * the upper bracket, the rest to the lower" produces a bracket that LOOKS right
 * (every first-round match is cross-group) while quietly putting the same
 * group's top two seeds in the same semifinal, so these assert the round-2
 * separation as well as round 1.
 */

/** Build a full qualifier set: `groupCount` groups each with placements 1..q. */
function qualifiers(groupCount: number, q: number): GroupQualifier[] {
  const out: GroupQualifier[] = [];
  for (let g = 0; g < groupCount; g++) {
    for (let p = 1; p <= q; p++) out.push({ entryId: `G${g}P${p}`, groupIndex: g, groupPlacement: p });
  }
  return out;
}

const groupOf = (entryId: string) => entryId.slice(0, 2);

describe("groupStageShape", () => {
  it("derives the TI shape: 18 players, 2 groups of 9, 8 qualify each", () => {
    const s = groupStageShape(18, 2, 8);
    expect(s).toMatchObject({
      groupSize: 9,
      survivors: 16,
      upperSeats: 8,
      lowerSeats: 8,
      eliminatedInGroups: 2,
      groupMatches: 72,
      playoffMatches: 22,
      totalMatches: 94,
    });
  });

  it("derives the recommended smaller shape: 12 players, 2 groups of 6, 4 qualify each", () => {
    expect(groupStageShape(12, 2, 4)).toMatchObject({
      groupSize: 6,
      survivors: 8,
      upperSeats: 4,
      lowerSeats: 4,
      eliminatedInGroups: 4,
      groupMatches: 30,
      playoffMatches: 10,
      totalMatches: 40,
    });
  });

  it("rejects a survivor count that isn't a power of two", () => {
    // 2 groups x 6 qualifiers = 12 survivors — no bracket of that size exists.
    expect(() => groupStageShape(18, 2, 6)).toThrow(/not a power of two/);
  });

  it("rejects an odd qualifier count (the upper/lower split must be even)", () => {
    expect(() => groupStageShape(18, 2, 5)).toThrow(/even/);
  });

  it("rejects groups that don't divide the field evenly", () => {
    expect(() => groupStageShape(13, 2, 4)).toThrow(/do not divide evenly/);
  });

  it("rejects a group stage that eliminates nobody", () => {
    expect(() => groupStageShape(16, 2, 8)).toThrow(/eliminates nobody/);
  });

  it("rejects a single group — cross-group seeding has nothing to pair against", () => {
    expect(() => groupStageShape(9, 1, 8)).toThrow(/at least 2/);
  });
});

describe("snakeDraftGroups", () => {
  it("snakes rather than deals straight, so the top seeds are split up", () => {
    // Straight dealing would be 0,1,0,1,… putting seeds 1 and 3 together.
    expect(snakeDraftGroups(8, 2)).toEqual([0, 1, 1, 0, 0, 1, 1, 0]);
  });

  it("balances seed strength across groups far better than straight dealing", () => {
    const seedSums = (groups: number[], groupCount: number) => {
      const sum = new Array<number>(groupCount).fill(0);
      groups.forEach((g, i) => {
        sum[g]! += i + 1;
      });
      return sum;
    };
    const spread = (sums: number[]) => Math.max(...sums) - Math.min(...sums);

    // 8 players / 2 groups is 4 full rows, so the snake balances exactly.
    expect(spread(seedSums(snakeDraftGroups(8, 2), 2))).toBe(0);

    // 18 / 2 is NINE rows — an odd row count, so a snake cannot be perfect. Off
    // by one is the floor, not a defect.
    expect(spread(seedSums(snakeDraftGroups(18, 2), 2))).toBe(1);

    // The comparison that matters: straight dealing (seed % groupCount) would
    // put every odd seed in one group and every even seed in the other.
    const straight = Array.from({ length: 18 }, (_, i) => i % 2);
    expect(spread(seedSums(straight, 2))).toBe(9);
  });

  it("assigns every player exactly once, in equal group sizes", () => {
    const groups = snakeDraftGroups(12, 4);
    expect(groups).toHaveLength(12);
    const counts = [0, 0, 0, 0];
    for (const g of groups) counts[g]! += 1;
    expect(counts).toEqual([3, 3, 3, 3]);
  });
});

describe("seedPlayoffFromGroups", () => {
  it("splits each group's qualifiers half to the upper bracket, half to the lower", () => {
    const { upper, lower } = seedPlayoffFromGroups(qualifiers(2, 8), { groupCount: 2, qualifiersPerGroup: 8 });
    // 16 survivors -> 8 upper seats (4 matches) and 8 lower seats (4 matches).
    expect(upper).toHaveLength(4);
    expect(lower).toHaveLength(4);

    const upperIds = upper.flatMap((m) => [m.redEntryId, m.blueEntryId]);
    const lowerIds = lower.flatMap((m) => [m.redEntryId, m.blueEntryId]);
    // Placements 1-4 of each group up top, 5-8 of each group below.
    expect(upperIds.sort()).toEqual(["G0P1", "G0P2", "G0P3", "G0P4", "G1P1", "G1P2", "G1P3", "G1P4"]);
    expect(lowerIds.sort()).toEqual(["G0P5", "G0P6", "G0P7", "G0P8", "G1P5", "G1P6", "G1P7", "G1P8"]);
  });

  it("never pairs two players from the same group in the first playoff round", () => {
    for (const [groupCount, q] of [
      [2, 8],
      [2, 4],
      [4, 4],
      [4, 2],
    ] as const) {
      const { upper, lower } = seedPlayoffFromGroups(qualifiers(groupCount, q), { groupCount, qualifiersPerGroup: q });
      for (const m of [...upper, ...lower]) {
        expect(groupOf(m.redEntryId), `${groupCount} groups x ${q}`).not.toBe(groupOf(m.blueEntryId));
      }
    }
  });

  it("keeps a group's top two seeds in OPPOSITE halves of the upper bracket", () => {
    // The defect this guards: slots 0 and 1 share a parent (parentSlot(2,0) ===
    // parentSlot(2,1)), so laying cross-group pairs into slots in listed order
    // puts A1 and A2 in the same semifinal despite both R1 matches being
    // cross-group. Assert on the PARENT slot, not the first round.
    const { upper } = seedPlayoffFromGroups(qualifiers(2, 8), { groupCount: 2, qualifiersPerGroup: 8 });

    const parentOf = new Map<string, number>();
    for (const m of upper) {
      const parent = parentSlot(2, m.slot).slot;
      parentOf.set(m.redEntryId, parent);
      parentOf.set(m.blueEntryId, parent);
    }

    expect(parentOf.get("G0P1")).not.toBe(parentOf.get("G0P2"));
    expect(parentOf.get("G1P1")).not.toBe(parentOf.get("G1P2"));
    // And the two group winners cannot meet before the upper-bracket final.
    expect(parentOf.get("G0P1")).not.toBe(parentOf.get("G1P1"));
  });

  it("pairs the best qualifier against the worst within each bracket", () => {
    const { upper } = seedPlayoffFromGroups(qualifiers(2, 8), { groupCount: 2, qualifiersPerGroup: 8 });
    const top = upper.find((m) => m.redEntryId === "G0P1" || m.blueEntryId === "G0P1")!;
    const opponent = top.redEntryId === "G0P1" ? top.blueEntryId : top.redEntryId;
    // Global seed 1 (A1) meets global seed 8, which is the other group's 4th.
    expect(opponent).toBe("G1P4");
  });
});

describe("group-stage round band", () => {
  it("classifies group rounds as G, not GF — the band ordering trap", () => {
    // 300+ is numerically above the grand-final band, so bracketOfRound has to
    // test it FIRST. Swapped, every group match silently reads "Grand Final".
    expect(bracketOfRound(G_ROUND_OFFSET + 1)).toBe("G");
    expect(bracketOfRound(309)).toBe("G");
    // The existing bands must be untouched.
    expect(bracketOfRound(1)).toBe("W");
    expect(bracketOfRound(101)).toBe("L");
    expect(bracketOfRound(201)).toBe("GF");
    expect(bracketOfRound(202)).toBe("GF");
  });

  it("labels group rounds by their sequence number", () => {
    const rounds = [301, 302, 303];
    expect(roundLabel(301, rounds, true)).toBe("Group Stage — Round 1");
    expect(roundLabel(303, rounds, true)).toBe("Group Stage — Round 3");
  });

  it("numbers the first playoff winners round as round 1, not round 2", () => {
    // GROUP_DOUBLE_ELIM never materialises winners round 1 — the group stage is
    // that round — so its winners rounds start at 2. Labelling by the raw round
    // number would call the first playoff column "Round 2". Only reachable at
    // S >= 32, where the three named rounds run out.
    const wRounds = [2, 3, 4, 5];
    expect(roundLabel(2, wRounds, true)).toBe("Upper Bracket Round 1");
    expect(roundLabel(3, wRounds, true)).toBe("UB Quarterfinals");
    expect(roundLabel(5, wRounds, true)).toBe("Upper Bracket Final");
  });

  it("still numbers an ordinary bracket by its real round numbers", () => {
    const wRounds = [1, 2, 3, 4, 5];
    expect(roundLabel(1, wRounds, false)).toBe("Round 1");
    expect(roundLabel(2, wRounds, false)).toBe("Round 2");
    expect(roundLabel(5, wRounds, false)).toBe("Final");
  });
});
