import { describe, it, expect } from "vitest";
import { createInitialState, legalMoves, applyMove, analysisBestMove } from "@dama/game-engine";
import type { Move } from "@dama/shared";
import { analyseMatch, shouldFlag, MIN_DECISIONS, FLAG_RATE, type SideAnalysis } from "../src/lib/anticheat.js";

/**
 * Unit tests for the anti-cheat analyser. Pure: no database, no Redis, no
 * server — which is exactly why `analyseMatch` was written side-effect free.
 */

const SETTINGS = { forcedMaxCapture: true, drawMoveLimit: 40 };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Build a game where red either mirrors the engine on every free choice or
 * deliberately avoids it. Blue always takes the first legal move so the two
 * runs share a shape and only red's behaviour differs.
 */
function synth(redMirrorsEngine: boolean, plies: number): Move[] {
  let s = createInitialState(SETTINGS);
  const moves: Move[] = [];
  for (let i = 0; i < plies; i += 1) {
    const opts = legalMoves(s);
    if (opts.length === 0) break;
    let pick: Move;
    if (s.turn === "red" && opts.length > 1) {
      const best = analysisBestMove(s, 4);
      pick = redMirrorsEngine ? best : (opts.find((m) => !same(m, best)) ?? best);
    } else {
      pick = opts[0]!;
    }
    moves.push(pick);
    s = applyMove(s, pick);
  }
  return moves;
}

function sideStub(over: Partial<SideAnalysis> = {}): SideAnalysis {
  return {
    side: "red",
    moveCount: 40,
    decisionCount: 20,
    engineMatchCount: 19,
    engineMatchRate: 0.95,
    suspicion: 90,
    reasons: [],
    ...over,
  };
}

describe("analyseMatch", () => {
  it("separates a player mirroring the engine from one avoiding it", () => {
    const mirrored = analyseMatch(synth(true, 18), SETTINGS, 300).red!;
    const avoided = analyseMatch(synth(false, 18), SETTINGS, 300).red!;

    expect(mirrored.engineMatchRate).toBe(1);
    expect(avoided.engineMatchRate).toBe(0);
    // The whole metric is worthless if these are not far apart.
    expect(mirrored.engineMatchRate! - avoided.engineMatchRate!).toBeGreaterThan(0.5);
  }, 60_000);

  it("excludes forced plies from the sample", () => {
    const r = analyseMatch(synth(true, 18), SETTINGS, 300).red!;
    // Dama forces captures, so some plies have exactly one legal move. Those
    // carry no information and must not inflate the denominator.
    expect(r.decisionCount).toBeLessThanOrEqual(r.moveCount);
    expect(r.engineMatchCount).toBeLessThanOrEqual(r.decisionCount);
    expect(r.reasons.some((x) => x.includes("forced"))).toBe(true);
  }, 60_000);

  it("reports an error instead of throwing on an empty move list", () => {
    const r = analyseMatch([], SETTINGS, 100);
    expect(r.error).toBeTruthy();
    expect(r.red).toBeNull();
  });

  it("reports an error instead of throwing on an illegal move", () => {
    const bogus = [{ from: { r: 0, c: 0 }, path: [{ r: 7, c: 7 }], captures: [], promotion: false }];
    const r = analyseMatch(bogus, SETTINGS, 100);
    // One corrupt row must never break a moderator's queue.
    expect(r.error).toBeTruthy();
    expect(r.red).toBeNull();
  });

  it("falls back to defaults when settings JSON is malformed", () => {
    const r = analyseMatch(synth(true, 6), { nonsense: true }, 60);
    expect(r.error).toBeUndefined();
    expect(r.moveCount).toBeGreaterThan(0);
  }, 30_000);

  it("refuses to score a sample below the significance floor", () => {
    const r = analyseMatch(synth(true, 8), SETTINGS, 100).red!;
    expect(r.decisionCount).toBeLessThan(MIN_DECISIONS);
    expect(r.suspicion).toBeNull();
    expect(r.reasons.some((x) => x.includes("too small"))).toBe(true);
  }, 30_000);

  it("computes avgSecPerMove as a whole-match average", () => {
    const moves = synth(true, 6);
    const r = analyseMatch(moves, SETTINGS, 120);
    expect(r.avgSecPerMove).toBeCloseTo(120 / moves.length, 5);
  }, 30_000);
});

describe("shouldFlag", () => {
  it("flags only above the rate threshold AND above the sample floor", () => {
    expect(shouldFlag(sideStub({ engineMatchRate: FLAG_RATE, decisionCount: MIN_DECISIONS }))).toBe(true);
    // just under the rate
    expect(shouldFlag(sideStub({ engineMatchRate: FLAG_RATE - 0.01 }))).toBe(false);
    // high rate but too little evidence — the expensive false-accusation case
    expect(shouldFlag(sideStub({ engineMatchRate: 1, decisionCount: MIN_DECISIONS - 1 }))).toBe(false);
  });

  it("never flags when there were no free choices", () => {
    expect(shouldFlag(sideStub({ engineMatchRate: null, decisionCount: 0 }))).toBe(false);
    expect(shouldFlag(null)).toBe(false);
  });
});
