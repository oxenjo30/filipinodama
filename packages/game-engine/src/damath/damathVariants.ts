import type { DamathExpr, DamathVariant } from "@dama/shared";

/**
 * Per-variant chip data, in the official placement order (read left→right,
 * top→bottom across a player's three home rows — the 3×4 piece sheet).
 *
 * Every chip has a canonical numeric `value` (used for scoring + the end-of-game
 * total) and, for non-plain-numeric variants, an `expr` describing its symbolic
 * form for display and (polynomial) coordinate evaluation.
 *
 * Sources: official DepEd Damath piece sheets (elementary Counting/Whole/
 * Fraction; secondary Integer/Rational/Radical/Polynomial; Binary). See
 * docs/superpowers/specs/2026-07-10-math-dama-damath-mode-design.md §5.1.
 */

export type ChipSpec = { value: number; expr?: DamathExpr };

const num = (n: number): ChipSpec => ({ value: n });

/** whole {0..11} and counting {1..12} — plain integers. */
const WHOLE = [9, 6, 1, 4, 0, 3, 10, 7, 11, 8, 5, 2].map(num);
const COUNTING = [10, 7, 2, 5, 1, 4, 11, 8, 12, 9, 6, 3].map(num);

/** integer — signed whole numbers. */
const INTEGER = [-9, 6, -1, 4, 0, -3, 10, -7, -11, 8, -5, 2].map(num);

/** binary — same integers as whole, displayed in base-2. */
const BINARY = [9, 6, 1, 4, 0, 3, 10, 7, 11, 8, 5, 2].map(
  (n): ChipSpec => ({ value: n, expr: { kind: "binary" } }),
);

/** fraction n/10 (positive) and rational n/10 (signed). value = n/10. */
const fraction = (n: number): ChipSpec => ({
  value: n / 10,
  expr: { kind: "fraction", num: n, den: 10 },
});
const FRACTION = [10, 7, 2, 5, 1, 4, 11, 8, 12, 9, 6, 3].map(fraction);
const RATIONAL = [-9, 6, -1, 4, 0, -3, 10, -7, -11, 8, -5, 2].map(fraction);

/** radical coeff·√radicand. value = coeff·√radicand (decimal). */
const radical = (coeff: number, radicand: number): ChipSpec => ({
  value: coeff * Math.sqrt(radicand),
  expr: { kind: "radical", coeff, radicand },
});
// Official Radical Damath sheet (Grade 9), placement order.
const RADICAL: ChipSpec[] = [
  radical(-9, 2), radical(-1, 8), radical(4, 18), radical(16, 32),
  radical(-49, 8), radical(-25, 18), radical(36, 32), radical(64, 2),
  radical(-121, 18), radical(-81, 32), radical(100, 2), radical(144, 8),
];

/** polynomial monomial coeff·x^ex·y^ey. The stored numeric `value` is a
 *  placeholder (0) — the authoritative value is computed by substituting the
 *  chip's CURRENT board coords for x,y at scoring/total time (see scorer). */
const mono = (coeff: number, ex: number, ey: number): ChipSpec => ({
  value: 0,
  expr: { kind: "polynomial", coeff, ex, ey },
});
// Official Polynomial Damath sheet (Fourth Year), placement order.
// -3x²y, -xy², 6x, 10y / -21xy², -15x, 28y, 36x²y / -55x, -45y, 66x²y, 78xy²
const POLYNOMIAL: ChipSpec[] = [
  mono(-3, 2, 1), mono(-1, 1, 2), mono(6, 1, 0), mono(10, 0, 1),
  mono(-21, 1, 2), mono(-15, 1, 0), mono(28, 0, 1), mono(36, 2, 1),
  mono(-55, 1, 0), mono(-45, 0, 1), mono(66, 2, 1), mono(78, 1, 2),
];

export const VARIANT_CHIPS: Record<DamathVariant, readonly ChipSpec[]> = {
  counting: COUNTING,
  whole: WHOLE,
  fraction: FRACTION,
  integer: INTEGER,
  rational: RATIONAL,
  radical: RADICAL,
  polynomial: POLYNOMIAL,
  binary: BINARY,
};

/** The scoring family a variant uses. */
export type ScoringKind = "numeric" | "fraction" | "radical" | "polynomial";

export const VARIANT_SCORING: Record<DamathVariant, ScoringKind> = {
  counting: "numeric",
  whole: "numeric",
  integer: "numeric",
  binary: "numeric",
  fraction: "fraction",
  rational: "fraction",
  radical: "radical",
  polynomial: "polynomial",
};
