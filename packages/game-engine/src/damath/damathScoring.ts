import type { DamathOperator } from "@dama/shared";

/** The minimal chip shape scoring needs. */
export type DamathScoreOperand = { value: number; dama: boolean };

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
