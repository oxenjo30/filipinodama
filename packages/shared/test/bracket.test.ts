import { describe, it, expect } from "vitest";
import {
  bracketOfRound,
  roundLabel,
  layoutBracket,
  bracketHeight,
  L_ROUND_OFFSET,
  GF_ROUND,
  GF_RESET_ROUND,
} from "../src/bracket.js";

/**
 * Bracket display helpers. These back BOTH clients' bracket views, so a
 * regression here silently mislabels rounds or misaligns connectors on web and
 * Android at once — cheap to pin down, expensive to eyeball.
 */

const METRICS = { cardH: 60, gap: 20 }; // the web view's real numbers
const PITCH = METRICS.cardH + METRICS.gap;

describe("bracketOfRound", () => {
  it("maps the round-offset scheme to sub-brackets", () => {
    expect(bracketOfRound(1)).toBe("W");
    expect(bracketOfRound(4)).toBe("W");
    expect(bracketOfRound(L_ROUND_OFFSET + 1)).toBe("L");
    expect(bracketOfRound(L_ROUND_OFFSET + 4)).toBe("L");
    expect(bracketOfRound(GF_ROUND)).toBe("GF");
    expect(bracketOfRound(GF_RESET_ROUND)).toBe("GF");
  });
});

describe("roundLabel — single elimination", () => {
  it("names rounds by distance from the final, not by index", () => {
    // A 4-player Cup: round 2 IS the final.
    expect(roundLabel(1, [1, 2], false)).toBe("Semifinals");
    expect(roundLabel(2, [1, 2], false)).toBe("Final");

    // A 16-player Cup: round 2 is only the quarterfinals.
    const r = [1, 2, 3, 4];
    expect(roundLabel(1, r, false)).toBe("Round 1");
    expect(roundLabel(2, r, false)).toBe("Quarterfinals");
    expect(roundLabel(3, r, false)).toBe("Semifinals");
    expect(roundLabel(4, r, false)).toBe("Final");
  });

  it("labels a 2-player Cup's single round as the Final", () => {
    expect(roundLabel(1, [1], false)).toBe("Final");
  });
});

describe("roundLabel — double elimination", () => {
  it("uses upper-bracket wording when a losers bracket is on screen", () => {
    const r = [1, 2, 3];
    expect(roundLabel(1, r, true)).toBe("UB Quarterfinals");
    expect(roundLabel(2, r, true)).toBe("Upper Bracket Semifinals");
    expect(roundLabel(3, r, true)).toBe("Upper Bracket Final");
  });

  it("names losers rounds from the end of the losers bracket", () => {
    // B=8 → losersBracketStructure is [2,2,1,1] → stored rounds 101..104.
    const r = [101, 102, 103, 104];
    expect(roundLabel(101, r, true)).toBe("Lower Bracket Round 1");
    expect(roundLabel(102, r, true)).toBe("Lower Bracket Quarterfinal");
    expect(roundLabel(103, r, true)).toBe("Lower Bracket Semifinal");
    expect(roundLabel(104, r, true)).toBe("Lower Bracket Final");
  });

  it("names both grand-final games", () => {
    expect(roundLabel(GF_ROUND, [GF_ROUND], true)).toBe("Grand Final");
    expect(roundLabel(GF_RESET_ROUND, [GF_ROUND, GF_RESET_ROUND], true)).toBe("Grand Final (reset)");
  });
});

describe("layoutBracket — winners bracket (columns halve)", () => {
  it("stacks round 1 and centres every later match on its two feeders", () => {
    const layout = layoutBracket([4, 2, 1], METRICS);

    expect(layout[0]).toEqual([0, PITCH, PITCH * 2, PITCH * 3]); // 0, 80, 160, 240

    // Each round-2 card sits midway between the pair feeding it.
    const centre = (top: number) => top + METRICS.cardH / 2;
    expect(centre(layout[1]![0]!)).toBe((centre(0) + centre(PITCH)) / 2);
    expect(centre(layout[1]![1]!)).toBe((centre(PITCH * 2) + centre(PITCH * 3)) / 2);

    // The final is centred on the two semifinals — i.e. the middle of the whole bracket.
    expect(centre(layout[2]![0]!)).toBe((centre(layout[1]![0]!) + centre(layout[1]![1]!)) / 2);
  });

  it("keeps the section height driven by round 1", () => {
    const layout = layoutBracket([4, 2, 1], METRICS);
    expect(bracketHeight(layout, METRICS)).toBe(PITCH * 3 + METRICS.cardH);
  });
});

describe("layoutBracket — losers bracket (columns do NOT always halve)", () => {
  /**
   * The case plain flex/space-around gets wrong. A losers "drop" round has the
   * SAME match count as the round before it (winners-bracket losers enter it
   * 1:1), so its cards must sit level with their single feeder, not be respread
   * over the column.
   */
  it("aligns a 1:1 drop round with its feeders instead of respreading", () => {
    const layout = layoutBracket([2, 2, 1], METRICS);

    expect(layout[0]).toEqual([0, PITCH]);
    expect(layout[1]).toEqual([0, PITCH]); // level with round 1 — NOT respread

    const centre = (top: number) => top + METRICS.cardH / 2;
    expect(centre(layout[2]![0]!)).toBe((centre(0) + centre(PITCH)) / 2);
  });

  it("handles B=8's real losers shape [2,2,1,1]", () => {
    const layout = layoutBracket([2, 2, 1, 1], METRICS);
    const centre = (top: number) => top + METRICS.cardH / 2;

    expect(layout[1]).toEqual([0, PITCH]); // drop round, 1:1
    expect(centre(layout[2]![0]!)).toBe((centre(0) + centre(PITCH)) / 2); // consolidation, halving
    expect(layout[3]).toEqual(layout[2]); // final drop round, 1:1 with the round before it
  });
});

describe("layoutBracket — edge cases", () => {
  it("returns nothing for an empty bracket", () => {
    expect(layoutBracket([], METRICS)).toEqual([]);
    expect(bracketHeight([], METRICS)).toBe(0);
  });

  it("lays out a single match (a 2-player Cup / a grand final)", () => {
    expect(layoutBracket([1], METRICS)).toEqual([[0]]);
  });

  it("degrades to even spacing rather than throwing on a malformed column ratio", () => {
    // 3 -> 2 is not a shape our brackets produce; it must not crash a page.
    const layout = layoutBracket([3, 2], METRICS);
    expect(layout[1]).toHaveLength(2);
    expect(layout[1]!.every((y) => Number.isFinite(y))).toBe(true);
  });
});
