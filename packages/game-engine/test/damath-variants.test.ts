import { describe, it, expect } from "vitest";
import type { DamathPiece, DamathVariant } from "@dama/shared";
import { createDamathPieces } from "../src/damath/damathPieces.js";
import { calculateVariantScore } from "../src/damath/damathScoring.js";
import { finalizeScores, DAMATH_RULE_OPTIONS } from "../src/damath/damathRules.js";

const valuesFor = (pieces: DamathPiece[], player: "red" | "blue") =>
  pieces
    .filter((p) => p.player === player)
    .map((p) => p.value)
    .sort((a, b) => a - b);

const pieceAt = (pieces: DamathPiece[], x: number, y: number) =>
  pieces.find((p) => p.pos.x === x && p.pos.y === y);

// Every playable variant must build 24 pieces, 12 per side, point-symmetric.
const ALL: DamathVariant[] = [
  "counting", "whole", "fraction", "integer", "rational", "radical", "polynomial", "binary",
];

describe("Damath variants — setup", () => {
  for (const variant of ALL) {
    it(`${variant} creates 24 pieces, 12 per side, point-symmetric`, () => {
      const pieces = createDamathPieces(variant);
      expect(pieces).toHaveLength(24);
      expect(pieces.filter((p) => p.player === "blue")).toHaveLength(12);
      expect(pieces.filter((p) => p.player === "red")).toHaveLength(12);
      // point symmetry: Red@(x,y) mirrors Blue@(7-x,7-y) with same value
      for (const b of pieces.filter((p) => p.player === "blue")) {
        const r = pieceAt(pieces, 7 - b.pos.x, 7 - b.pos.y);
        expect(r?.player).toBe("red");
        expect(r?.value).toBe(b.value);
      }
    });
  }
});

describe("Counting variant", () => {
  it("holds {1..12} once per side", () => {
    const p = createDamathPieces("counting");
    const oneToTwelve = Array.from({ length: 12 }, (_, i) => i + 1);
    expect(valuesFor(p, "blue")).toEqual(oneToTwelve);
    expect(valuesFor(p, "red")).toEqual(oneToTwelve);
  });
});

describe("Integer variant", () => {
  it("holds the signed integer set once per side", () => {
    const p = createDamathPieces("integer");
    const expected = [-11, -9, -7, -5, -3, -1, 0, 2, 4, 6, 8, 10].sort((a, b) => a - b);
    expect(valuesFor(p, "blue")).toEqual(expected);
    expect(valuesFor(p, "red")).toEqual(expected);
  });

  it("scores signed integers with the numeric scorer", () => {
    // -3 × 4 landing on "×" → -12; a dama on either side doubles.
    const r = calculateVariantScore(
      "integer",
      { value: -3, dama: false, pos: { x: 0, y: 0 } },
      { value: 4, dama: false, pos: { x: 1, y: 1 } },
      "×",
      { x: 2, y: 2 },
    );
    expect(r.points).toBe(-12);
  });
});

const frac = (n: number, d: number, dama = false) => ({
  value: n / d,
  dama,
  pos: { x: 0, y: 0 },
  expr: { kind: "fraction" as const, num: n, den: d },
});

describe("Fraction / Rational scorer", () => {
  it("adds fractions exactly and reduces: 7/10 + 3/10 = 1", () => {
    const r = calculateVariantScore("fraction", frac(7, 10), frac(3, 10), "+", { x: 2, y: 2 });
    expect(r.points).toBeCloseTo(1, 10);
    expect(r.formula).toContain("7/10 + 3/10 = 1");
  });

  it("multiplies and reduces: 2/10 × 5/10 = 1/10", () => {
    const r = calculateVariantScore("fraction", frac(2, 10), frac(5, 10), "×", { x: 2, y: 2 });
    expect(r.points).toBeCloseTo(0.1, 10);
    expect(r.formula).toContain("= 1/10");
  });

  it("handles signed rationals: -9/10 − 1/10 = -1", () => {
    const r = calculateVariantScore("rational", frac(-9, 10), frac(1, 10), "−", { x: 2, y: 2 });
    expect(r.points).toBeCloseTo(-1, 10);
  });

  it("divide-by-zero-fraction is safe (scores 0 with a note)", () => {
    const r = calculateVariantScore("fraction", frac(5, 10), frac(0, 10), "÷", { x: 2, y: 2 });
    expect(r.points).toBe(0);
    expect(r.note).toBeDefined();
  });

  it("divides fractions: (6/10) ÷ (3/10) = 2", () => {
    const r = calculateVariantScore("fraction", frac(6, 10), frac(3, 10), "÷", { x: 2, y: 2 });
    expect(r.points).toBeCloseTo(2, 10);
  });

  it("divides by a negative fraction and keeps the sign on the numerator", () => {
    // (5/10) ÷ (-1/10) = -5 ; the raw denominator goes negative → normalized
    const r = calculateVariantScore("rational", frac(5, 10), frac(-1, 10), "÷", { x: 2, y: 2 });
    expect(r.points).toBeCloseTo(-5, 10);
    expect(r.formula).toContain("-5");
  });

  it("fraction score with a dama shows the ×2 multiplier", () => {
    const r = calculateVariantScore("fraction", frac(7, 10, true), frac(3, 10), "+", { x: 2, y: 2 });
    expect(r.formula).toContain("× 2");
    expect(r.points).toBeCloseTo(2, 10);
  });
});

describe("Polynomial end-of-game bonus (evaluate remaining chips at final coords)", () => {
  it("adds a remaining polynomial chip's value evaluated at its board coords", () => {
    // One Red poly chip 6x sitting at (4,0) → value 24; Blue none.
    const state = {
      id: "t",
      variant: "polynomial" as const,
      pieces: [
        { id: "r1", player: "red" as const, value: 0, dama: false, pos: { x: 4, y: 0 }, expr: { kind: "polynomial" as const, coeff: 6, ex: 1, ey: 0 } },
      ],
      turn: "red" as const,
      moveNumber: 1,
      redScore: 0,
      blueScore: 0,
      history: [],
      options: DAMATH_RULE_OPTIONS,
    };
    const finalized = finalizeScores(state);
    expect(finalized.redScore).toBe(24); // 6·4 = 24
    expect(finalized.blueScore).toBe(0);
  });
});

const rad = (coeff: number, radicand: number, dama = false) => ({
  value: coeff * Math.sqrt(radicand),
  dama,
  pos: { x: 0, y: 0 },
  expr: { kind: "radical" as const, coeff, radicand },
});

describe("Radical scorer", () => {
  it("combines like radicals after simplifying: -9√2 + (-√8) = -11√2", () => {
    const r = calculateVariantScore("radical", rad(-9, 2), rad(-1, 8), "+", { x: 2, y: 2 });
    // -√8 = -2√2, so -9√2 - 2√2 = -11√2
    expect(r.formula).toContain("-11√2");
    expect(r.points).toBeCloseTo(-11 * Math.sqrt(2), 8);
  });

  it("multiplies radicands: 4√18 × ... combines under one root", () => {
    const r = calculateVariantScore("radical", rad(2, 2), rad(3, 2), "×", { x: 2, y: 2 });
    // 2√2 × 3√2 = 6·2 = 12
    expect(r.points).toBeCloseTo(12, 8);
  });
});

const poly = (coeff: number, ex: number, ey: number, pos = { x: 0, y: 0 }, dama = false) => ({
  value: 0,
  dama,
  pos,
  expr: { kind: "polynomial" as const, coeff, ex, ey },
});

describe("Polynomial scorer (evaluate at board coords → whole number)", () => {
  it("(-xy²) − (28y): capturer lands at (3,4) → -160", () => {
    // capturing -1·x·y² at landing (3,4): (-3)(16) = -48
    // captured 28·y at its own square (col unused, y from pos) — put victim at y=4
    const r = calculateVariantScore(
      "polynomial",
      poly(-1, 1, 2),
      poly(28, 0, 1, { x: 5, y: 4 }),
      "−",
      { x: 3, y: 4 },
    );
    // (-3)(4²) − (28)(4) = -48 − 112 = -160
    expect(r.points).toBe(-160);
  });

  it("evaluates a constant-free monomial to a number", () => {
    const r = calculateVariantScore(
      "polynomial",
      poly(6, 1, 0),
      poly(10, 0, 1, { x: 2, y: 3 }),
      "+",
      { x: 2, y: 3 },
    );
    // 6·x at (2,3) = 12 ; 10·y at (2,3) = 30 ; 12 + 30 = 42
    expect(r.points).toBe(42);
  });

  it("polynomial divide + divide-by-zero-safe", () => {
    // 6x at (4,0)=24 ÷ 10y at (2,3)=30 → 0.8
    const r = calculateVariantScore("polynomial", poly(6, 1, 0), poly(10, 0, 1, { x: 2, y: 3 }), "÷", { x: 4, y: 0 });
    expect(r.points).toBeCloseTo(24 / 30, 8);
    // divide by a monomial that evaluates to 0 → safe 0 + note
    const z = calculateVariantScore("polynomial", poly(6, 1, 0), poly(5, 1, 0, { x: 0, y: 0 }), "÷", { x: 4, y: 0 });
    expect(z.points).toBe(0);
    expect(z.note).toBeDefined();
  });

  it("polynomial with a dama doubles the evaluated score", () => {
    const r = calculateVariantScore("polynomial", poly(6, 1, 0, { x: 0, y: 0 }, true), poly(10, 0, 1, { x: 2, y: 3 }), "+", { x: 2, y: 3 });
    expect(r.points).toBe(42 * 2);
    expect(r.formula).toContain("× 2");
  });
});

describe("Radical scorer — edge branches", () => {
  it("subtracts like radicals", () => {
    const r = calculateVariantScore("radical", rad(5, 2), rad(2, 2), "−", { x: 2, y: 2 });
    expect(r.formula).toContain("3√2");
    expect(r.points).toBeCloseTo(3 * Math.sqrt(2), 8);
  });

  it("adds UNLIKE radicals as a two-term sum", () => {
    const r = calculateVariantScore("radical", rad(2, 2), rad(3, 3), "+", { x: 2, y: 2 });
    expect(r.points).toBeCloseTo(2 * Math.sqrt(2) + 3 * Math.sqrt(3), 8);
    expect(r.formula).toContain("+");
  });

  it("divides to a clean radical when radicands divide", () => {
    // 6√8 ÷ 2√2 = 3√4 = 6
    const r = calculateVariantScore("radical", rad(6, 8), rad(2, 2), "÷", { x: 2, y: 2 });
    expect(r.points).toBeCloseTo(6, 8);
  });

  it("divides to a decimal when radicands don't divide", () => {
    const r = calculateVariantScore("radical", rad(3, 3), rad(1, 2), "÷", { x: 2, y: 2 });
    expect(r.points).toBeCloseTo((3 * Math.sqrt(3)) / Math.sqrt(2), 8);
  });

  it("radical divide-by-zero is safe", () => {
    const r = calculateVariantScore("radical", rad(3, 2), rad(0, 2), "÷", { x: 2, y: 2 });
    expect(r.points).toBe(0);
    expect(r.note).toBeDefined();
  });
});

describe("Binary variant", () => {
  it("builds 24 chips flagged binary and scores numerically", () => {
    const p = createDamathPieces("binary");
    expect(p.every((c) => c.expr?.kind === "binary")).toBe(true);
    // scoring uses the numeric path: 6 + 3 = 9
    const r = calculateVariantScore(
      "binary",
      { value: 6, dama: false, pos: { x: 0, y: 0 }, expr: { kind: "binary" } },
      { value: 3, dama: false, pos: { x: 1, y: 1 }, expr: { kind: "binary" } },
      "+",
      { x: 2, y: 2 },
    );
    expect(r.points).toBe(9);
  });
});
