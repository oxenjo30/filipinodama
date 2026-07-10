import type { DamathPiece, DamathPlayerId, DamathVariant } from "@dama/shared";
import { getPlayableColumns } from "./damathBoard.js";
import { VARIANT_CHIPS } from "./damathVariants.js";

/**
 * Official Whole-variant chip values in placement order (kept for tests that
 * pin the canonical Whole sequence). The full per-variant tables live in
 * damathVariants.ts. (Spec §5.1.)
 */
export const WHOLE_VALUE_SEQUENCE: readonly number[] = [9, 6, 1, 4, 0, 3, 10, 7, 11, 8, 5, 2];

/**
 * Build the starting pieces for a variant.
 *
 * Blue (top) fills rows y=0,1,2 with the variant's chip sequence, each row read
 * left→right over that row's playable columns. Red (bottom) is the
 * point-symmetric reflection through the board centre: Red@(x,y) mirrors
 * Blue@(7−x,7−y) with the same chip, so both players see their own first row
 * on their own back rank. (Spec §5.1, per-design seat convention.)
 *
 * A chip carries its canonical numeric `value` plus, for non-plain-numeric
 * variants, an `expr` for display / coordinate evaluation.
 */
export function createDamathPieces(variant: DamathVariant): DamathPiece[] {
  const seq = VARIANT_CHIPS[variant];
  if (!seq) throw new Error(`Damath variant "${variant}" has no chip table.`);

  const pieces: DamathPiece[] = [];
  let idc = 0;
  const nextId = (player: DamathPlayerId) => `d${player === "blue" ? "B" : "R"}${idc++}`;

  // Blue occupies the top three rows in reading order.
  const blueRows = [0, 1, 2];
  let i = 0;
  for (const y of blueRows) {
    for (const x of getPlayableColumns(y)) {
      const spec = seq[i++];
      const piece: DamathPiece = { id: nextId("blue"), player: "blue", value: spec.value, dama: false, pos: { x, y } };
      if (spec.expr) piece.expr = spec.expr;
      pieces.push(piece);
    }
  }

  // Red is the 180° rotation of Blue: same chip at (7−x, 7−y).
  const blue = pieces.slice();
  for (const b of blue) {
    const piece: DamathPiece = {
      id: nextId("red"),
      player: "red",
      value: b.value,
      dama: false,
      pos: { x: 7 - b.pos.x, y: 7 - b.pos.y },
    };
    if (b.expr) piece.expr = b.expr;
    pieces.push(piece);
  }

  return pieces;
}
