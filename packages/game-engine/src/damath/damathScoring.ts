import type { DamathCoord, DamathExpr, DamathOperator, DamathVariant } from "@dama/shared";
import { VARIANT_SCORING } from "./damathVariants.js";

/** The minimal chip shape scoring needs. */
export type DamathScoreOperand = { value: number; dama: boolean };

/** A full operand for variant scoring: carries the symbolic form + board pos. */
export type DamathVariantOperand = {
  value: number;
  dama: boolean;
  pos: DamathCoord;
  expr?: DamathExpr;
};

export type DamathScoreResult = {
  /** exact numeric points credited to the capturing player (float). */
  points: number;
  /** the dama multiplier applied to the base operation. */
  multiplier: number;
  /** the base value before the multiplier (capturing [op] captured). */
  base: number;
  /** human-readable formula, e.g. "7 × 3 = 21" or "10 + 5 = 15 × 2 = 30". */
  formula: string;
  /** set when a scoring edge case fired (e.g. division by zero). */
  note?: string;
};

const NOTE_DIV_BY_ZERO = "division-by-zero-safe-score";

/**
 * Dama multiplier (§5.3): the score doubles whenever a dama is involved on
 * either side (capturer OR captured), and quadruples when both are dama.
 * man×man=1, dama×man=2, man×dama=2, dama×dama=4.
 */
export function damaMultiplier(capturing: DamathScoreOperand, captured: DamathScoreOperand): number {
  if (capturing.dama && captured.dama) return 4;
  if (capturing.dama || captured.dama) return 2;
  return 1;
}

/** Apply one operator to two chip values. Division keeps an exact float and
 *  is div-by-zero-safe (returns 0 with a note). */
function applyOperator(
  op: DamathOperator,
  a: number,
  b: number,
): { base: number; note?: string } {
  if (op === "+") return { base: a + b };
  if (op === "−") return { base: a - b };
  if (op === "×") return { base: a * b };
  // op === "÷"
  return b === 0 ? { base: 0, note: NOTE_DIV_BY_ZERO } : { base: a / b };
}

/**
 * Score a single capture: base = capturingValue [landingOp] capturedValue,
 * then × the dama multiplier. Always driven by the LANDING-square operator.
 * (Spec §5.3.)
 */
export function calculateDamathScore(
  capturing: DamathScoreOperand,
  captured: DamathScoreOperand,
  landingOperator: DamathOperator,
): DamathScoreResult {
  const { base, note } = applyOperator(landingOperator, capturing.value, captured.value);
  const multiplier = damaMultiplier(capturing, captured);
  const points = base * multiplier;

  let formula = `${capturing.value} ${landingOperator} ${captured.value} = ${base}`;
  if (multiplier > 1) formula += ` × ${multiplier} = ${points}`;

  return note !== undefined
    ? { points, multiplier, base, formula, note }
    : { points, multiplier, base, formula };
}

// ──────────────────────────────────────────────────────────────────────────
// Variant-aware scoring. `calculateVariantScore` dispatches to the right family
// by the variant's ScoringKind. Every family produces a numeric `points` (used
// for the running total + end-of-game bonus) and a variant-appropriate formula.
// ──────────────────────────────────────────────────────────────────────────

/** ×2 / ×4 multiplier text appended to a base formula when a dama is involved. */
function withMultiplier(baseFormula: string, base: number, multiplier: number, points: number): string {
  return multiplier > 1 ? `${baseFormula} × ${multiplier} = ${round2(points)}` : baseFormula;
}
const round2 = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? r : Number(r.toFixed(2));
};

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));

/** Reduce a fraction to lowest terms, keeping the sign on the numerator. */
function reduceFraction(n: number, d: number): { num: number; den: number } {
  if (d === 0) return { num: 0, den: 1 };
  if (n === 0) return { num: 0, den: 1 };
  const g = gcd(n, d) || 1;
  let num = n / g;
  let den = d / g;
  if (den < 0) {
    num = -num;
    den = -den;
  }
  return { num, den };
}

const fracStr = (f: { num: number; den: number }) => (f.den === 1 ? `${f.num}` : `${f.num}/${f.den}`);

/** Fraction scorer (fraction / rational). Exact n/d arithmetic; div-by-zero-safe. */
function scoreFraction(
  a: DamathVariantOperand,
  b: DamathVariantOperand,
  op: DamathOperator,
  multiplier: number,
): DamathScoreResult {
  const fa = a.expr?.kind === "fraction" ? { num: a.expr.num, den: a.expr.den } : { num: a.value, den: 1 };
  const fb = b.expr?.kind === "fraction" ? { num: b.expr.num, den: b.expr.den } : { num: b.value, den: 1 };
  let raw: { num: number; den: number };
  let note: string | undefined;
  if (op === "+") raw = { num: fa.num * fb.den + fb.num * fa.den, den: fa.den * fb.den };
  else if (op === "−") raw = { num: fa.num * fb.den - fb.num * fa.den, den: fa.den * fb.den };
  else if (op === "×") raw = { num: fa.num * fb.num, den: fa.den * fb.den };
  else {
    // ÷ : multiply by reciprocal; div-by-zero-safe (captured numerator 0).
    if (fb.num === 0) {
      raw = { num: 0, den: 1 };
      note = NOTE_DIV_BY_ZERO;
    } else {
      raw = { num: fa.num * fb.den, den: fa.den * fb.num };
    }
  }
  const reduced = reduceFraction(raw.num, raw.den);
  const base = reduced.num / reduced.den;
  const points = base * multiplier;
  const baseFormula = `${fracStr(fa)} ${op} ${fracStr(fb)} = ${fracStr(reduced)}`;
  const formula = withMultiplier(baseFormula, base, multiplier, points);
  return note !== undefined ? { points, multiplier, base, formula, note } : { points, multiplier, base, formula };
}

/** Simplify c·√r to lowest surd form (pull out perfect-square factors). */
function simplifyRadical(coeff: number, radicand: number): { coeff: number; radicand: number } {
  if (radicand < 0) return { coeff: 0, radicand: 0 }; // not used (all radicands ≥ 0 here)
  let c = coeff;
  let r = radicand;
  for (let f = 2; f * f <= r; f++) {
    while (r % (f * f) === 0) {
      r /= f * f;
      c *= f;
    }
  }
  return { coeff: c, radicand: r };
}

const radStr = (c: number, r: number) => (r === 1 ? `${c}` : r === 0 || c === 0 ? "0" : `${c}√${r}`);

/**
 * Radical scorer. Add/subtract combine LIKE radicals (same radicand after
 * simplification), e.g. -9√2 + (-√8) = -9√2 - 2√2 = -11√2. Multiply combines
 * radicands (√a·√b = √(ab)); divide is √a/√b = √(a/b) when it stays rational.
 * Results are kept symbolic for display; `points` is the decimal value for the
 * running total. When add/subtract meet UNLIKE radicals, the symbolic form is
 * left as a sum and `points` uses the decimal (rare on the official board).
 */
function scoreRadical(
  a: DamathVariantOperand,
  b: DamathVariantOperand,
  op: DamathOperator,
  multiplier: number,
): DamathScoreResult {
  const ra = a.expr?.kind === "radical" ? { c: a.expr.coeff, r: a.expr.radicand } : { c: a.value, r: 1 };
  const rb = b.expr?.kind === "radical" ? { c: b.expr.coeff, r: b.expr.radicand } : { c: b.value, r: 1 };
  const sa = simplifyRadical(ra.c, ra.r);
  const sb = simplifyRadical(rb.c, rb.r);
  let symbolic: string;
  let base: number;
  let note: string | undefined;

  if (op === "+" || op === "−") {
    const bc = op === "−" ? -sb.coeff : sb.coeff;
    if (sa.radicand === sb.radicand) {
      const c = sa.coeff + bc;
      symbolic = radStr(c, sa.radicand);
      base = c * Math.sqrt(sa.radicand);
    } else {
      // unlike radicals: keep as a two-term sum symbolically.
      symbolic = `${radStr(sa.coeff, sa.radicand)} ${bc < 0 ? "−" : "+"} ${radStr(Math.abs(bc), sb.radicand)}`;
      base = sa.coeff * Math.sqrt(sa.radicand) + bc * Math.sqrt(sb.radicand);
    }
  } else if (op === "×") {
    const s = simplifyRadical(sa.coeff * sb.coeff, sa.radicand * sb.radicand);
    symbolic = radStr(s.coeff, s.radicand);
    base = s.coeff * Math.sqrt(s.radicand);
  } else {
    // ÷ : (ca√ra)/(cb√rb) = (ca/cb)·√(ra/rb) when ra divisible by rb.
    if (sb.coeff === 0 || sb.radicand === 0) {
      symbolic = "0";
      base = 0;
      note = NOTE_DIV_BY_ZERO;
    } else if (sa.radicand % sb.radicand === 0) {
      const s = simplifyRadical(sa.coeff / sb.coeff, sa.radicand / sb.radicand);
      symbolic = radStr(s.coeff, s.radicand);
      base = s.coeff * Math.sqrt(s.radicand);
    } else {
      base = (sa.coeff * Math.sqrt(sa.radicand)) / (sb.coeff * Math.sqrt(sb.radicand));
      symbolic = `${round2(base)}`;
    }
  }

  const points = base * multiplier;
  const baseFormula = `${radStr(ra.c, ra.r)} ${op} ${radStr(rb.c, rb.r)} = ${symbolic}`;
  const formula = withMultiplier(baseFormula, base, multiplier, points);
  return note !== undefined ? { points, multiplier, base, formula, note } : { points, multiplier, base, formula };
}

/** Render a monomial coeff·x^ex·y^ey as text, e.g. -3x²y, 6x, 10y. */
function monoStr(m: { coeff: number; ex: number; ey: number }): string {
  const sup = (n: number) => (n === 1 ? "" : n === 2 ? "²" : n === 3 ? "³" : `^${n}`);
  if (m.ex === 0 && m.ey === 0) return `${m.coeff}`;
  const cx = m.ex ? `x${sup(m.ex)}` : "";
  const cy = m.ey ? `y${sup(m.ey)}` : "";
  const c = m.coeff === 1 ? "" : m.coeff === -1 ? "-" : `${m.coeff}`;
  return `${c}${cx}${cy}`;
}

/** Evaluate a monomial at (x,y) → a number. */
function evalMono(m: { coeff: number; ex: number; ey: number }, x: number, y: number): number {
  return m.coeff * Math.pow(x, m.ex) * Math.pow(y, m.ey);
}

/**
 * Polynomial scorer (§ research): the score is a WHOLE NUMBER. Each monomial is
 * evaluated by substituting the chip's CURRENT board coords for x,y, then the
 * landing operator combines the two numeric results. The capturing chip is
 * evaluated at the LANDING square; the captured chip at its own square.
 * e.g. (-xy²) - (28y) with the capturer landing at (3,4): (-3)(4²) - (28)(4).
 */
function scorePolynomial(
  a: DamathVariantOperand,
  b: DamathVariantOperand,
  op: DamathOperator,
  multiplier: number,
  landing: DamathCoord,
): DamathScoreResult {
  const ma = a.expr?.kind === "polynomial" ? a.expr : { coeff: a.value, ex: 0, ey: 0 };
  const mb = b.expr?.kind === "polynomial" ? b.expr : { coeff: b.value, ex: 0, ey: 0 };
  const va = evalMono(ma, landing.x, landing.y); // capturer evaluated at landing
  const vb = evalMono(mb, b.pos.x, b.pos.y); // captured at its own square
  const { base, note } = applyOperator(op, va, vb);
  const points = base * multiplier;
  const baseFormula = `${monoStr(ma)} ${op} ${monoStr(mb)} = ${base}`;
  const formula = withMultiplier(baseFormula, base, multiplier, points);
  return note !== undefined ? { points, multiplier, base, formula, note } : { points, multiplier, base, formula };
}

/**
 * Variant-aware capture scorer — the single entry point the engine calls.
 * Dispatches by the variant's scoring family. `landing` is where the capturing
 * chip ends this jump (needed by polynomial coordinate substitution).
 */
export function calculateVariantScore(
  variant: DamathVariant,
  capturing: DamathVariantOperand,
  captured: DamathVariantOperand,
  landingOperator: DamathOperator,
  landing: DamathCoord,
): DamathScoreResult {
  const multiplier = damaMultiplier(capturing, captured);
  switch (VARIANT_SCORING[variant]) {
    case "fraction":
      return scoreFraction(capturing, captured, landingOperator, multiplier);
    case "radical":
      return scoreRadical(capturing, captured, landingOperator, multiplier);
    case "polynomial":
      return scorePolynomial(capturing, captured, landingOperator, multiplier, landing);
    case "numeric":
      return calculateDamathScore(
        { value: capturing.value, dama: capturing.dama },
        { value: captured.value, dama: captured.dama },
        landingOperator,
      );
  }
}
