import type { DamathOperator } from "@dama/shared";

/**
 * Official Damath operation board. Row-major, board[y][x], y=0 at the top
 * (Blue home rows). `null` = non-playable (grey) square. Operators sit only
 * on playable squares, i.e. where (x+y)%2===0. The layout is a 4-row
 * repeating block (rows 0–3 repeat as rows 4–7).
 * Source: official DepEd Damath operation board (spec §5.1).
 */
export const DAMATH_OPERATOR_BOARD: readonly (readonly (DamathOperator | null)[])[] = [
  ["×", null, "÷", null, "−", null, "+", null], // y=0
  [null, "÷", null, "×", null, "+", null, "−"], // y=1
  ["−", null, "+", null, "×", null, "÷", null], // y=2
  [null, "+", null, "−", null, "÷", null, "×"], // y=3
  ["×", null, "÷", null, "−", null, "+", null], // y=4
  [null, "÷", null, "×", null, "+", null, "−"], // y=5
  ["−", null, "+", null, "×", null, "÷", null], // y=6
  [null, "+", null, "−", null, "÷", null, "×"], // y=7
];

/** A square is playable (dark, operator-bearing) iff (x+y) is even. */
export const isDamathPlayable = (x: number, y: number): boolean =>
  (x + y) % 2 === 0;

/** The operator on (x,y), or null for a non-playable square. */
export const operatorAt = (x: number, y: number): DamathOperator | null =>
  DAMATH_OPERATOR_BOARD[y][x];

/** The four playable column indices of row `y`, ascending. */
export const getPlayableColumns = (y: number): number[] => {
  const cols: number[] = [];
  for (let x = 0; x < 8; x++) if (isDamathPlayable(x, y)) cols.push(x);
  return cols;
};
