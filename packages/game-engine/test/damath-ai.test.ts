import { describe, it, expect } from "vitest";
import type { DamathGameState, DamathPiece, DamathPlayerId, DamathRuleOptions } from "@dama/shared";
import { DAMATH_RULE_OPTIONS } from "../src/damath/damathRules.js";
import { getAllLegalDamathMoves } from "../src/damath/damathMoveGeneration.js";
import { applyDamathMove } from "../src/damath/damathRules.js";
import {
  bestDamathMove,
  scoreDamathMove,
  DAMATH_BLUNDER,
} from "../src/damath/damathAi.js";

let tid = 0;
const chip = (
  player: DamathPlayerId,
  x: number,
  y: number,
  value = 1,
  dama = false,
): DamathPiece => ({ id: `a${tid++}`, player, value, dama, pos: { x, y } });

const gameState = (
  pieces: DamathPiece[],
  turn: DamathPlayerId = "red",
  opts: Partial<DamathRuleOptions> = {},
): DamathGameState => ({
  id: "t",
  variant: "whole",
  pieces,
  turn,
  moveNumber: 1,
  redScore: 0,
  blueScore: 0,
  history: [],
  options: { ...DAMATH_RULE_OPTIONS, ...opts },
});

describe("Damath AI (§5.5)", () => {
  it("scoreDamathMove credits the capturing player's immediate gain", () => {
    // Red(7) captures Blue(3) landing (1,3)="+" → +10 for red.
    const s = gameState([chip("red", 3, 5, 7), chip("blue", 2, 4, 3)], "red");
    const move = getAllLegalDamathMoves(s)[0];
    const { myGain } = scoreDamathMove(s, move);
    expect(myGain).toBe(10);
  });

  it("prefers the higher-scoring of two otherwise-equal captures", () => {
    // Two independent Red men, each with a single forced capture, but different
    // landing operators → different scores. The AI must pick the bigger one.
    // Red A(7 @ 3,5) → capture Blue(3 @ 2,4) land (1,3)="+" → 7+3 = 10.
    // Red B(7 @ 5,5) → capture Blue(3 @ 6,4) land (7,3)="×" → 7×3 = 21.
    const s = gameState(
      [
        chip("red", 3, 5, 7),
        chip("blue", 2, 4, 3),
        chip("red", 5, 5, 7),
        chip("blue", 6, 4, 3),
      ],
      "red",
    );
    const chosen = bestDamathMove(s, "hard");
    const { myGain } = scoreDamathMove(s, chosen);
    expect(myGain).toBe(21); // the × capture, not the + one
  });

  it("avoids a capture that hands the opponent a bigger reply (1-ply)", () => {
    // Constructed so move X scores a little now but lets Blue score a lot next;
    // move Y scores the same now with no big reply. The net (mine − oppBest)
    // must prefer Y. We assert the chosen move's NET is the maximum available.
    const s = gameState(
      [
        chip("red", 3, 5, 5),
        chip("blue", 2, 4, 2),
        chip("red", 5, 5, 5),
        chip("blue", 6, 4, 2),
      ],
      "red",
    );
    const chosen = bestDamathMove(s, "hard");
    // recompute nets for all legal moves; chosen must be a maximiser.
    const netOf = (m: (typeof chosen)) => {
      const { myGain } = scoreDamathMove(s, m);
      const next = applyDamathMove(s, m);
      const oppBest = Math.max(
        0,
        ...getAllLegalDamathMoves(next).map((r) => scoreDamathMove(next, r).myGain),
      );
      return myGain - oppBest;
    };
    const maxNet = Math.max(...getAllLegalDamathMoves(s).map(netOf));
    expect(netOf(chosen)).toBe(maxNet);
  });

  it("is deterministic when the blunder RNG never fires (rng=()=>1)", () => {
    const s = gameState([chip("red", 3, 5, 7), chip("blue", 2, 4, 3)], "red");
    const a = bestDamathMove(s, "normal", () => 1);
    const b = bestDamathMove(s, "normal", () => 1);
    expect(a).toEqual(b);
  });

  it("blunders to a random legal move when the RNG rolls below the blunder rate", () => {
    // rng=()=>0 always rolls below any positive blunder rate → random branch.
    // With a seeded pick-index rng we still get A legal move (not a throw).
    const s = gameState([chip("red", 3, 5, 7)], "red"); // quiet moves only
    const move = bestDamathMove(s, "easy", () => 0);
    expect(getAllLegalDamathMoves(s)).toContainEqual(move);
  });

  it("hard never blunders (blunder rate 0)", () => {
    expect(DAMATH_BLUNDER.hard).toBe(0);
    // even rng=()=>0 (always-blunder roll) can't trigger it at rate 0
    const s = gameState([chip("red", 3, 5, 7), chip("blue", 2, 4, 3)], "red");
    const chosen = bestDamathMove(s, "hard", () => 0);
    // still the optimal capture, not a random pick
    expect(scoreDamathMove(s, chosen).myGain).toBe(10);
  });

  it("throws when there are no legal moves", () => {
    const s = gameState([chip("red", 3, 5, 7), chip("blue", 2, 4, 3)], "blue"); // blue has none reachable? ensure empty
    // give blue no pieces at all
    const empty = gameState([chip("red", 3, 5, 7)], "blue");
    expect(() => bestDamathMove(empty, "normal")).toThrow(/no legal/i);
    void s;
  });
});
