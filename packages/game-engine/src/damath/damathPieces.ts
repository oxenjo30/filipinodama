import type { DamathPiece, DamathPlayerId, DamathVariant } from "@dama/shared";
import { getPlayableColumns } from "./damathBoard.js";

/**
 * Official Whole-variant chip values in placement order: read left→right,
 * top→bottom across a player's three home rows (matches the official piece
 * sheet's 3×4 layout). The multiset is exactly {0..11}. (Spec §5.1.)
 */
export const WHOLE_VALUE_SEQUENCE: readonly number[] = [
  9, 6, 1, 4, // row A (home back rank)
  0, 3, 10, 7, // row B
  11, 8, 5, 2, // row C (home front rank)
];

/** Value sequences per numeric variant. MVP builds `whole`; the rest are
 *  recorded for the registry but not wired into playable modes yet. */
const VALUE_SEQUENCES: Partial<Record<DamathVariant, readonly number[]>> = {
  whole: WHOLE_VALUE_SEQUENCE,
};

/**
 * Build the starting pieces for a variant.
 *
 * Blue (top) fills rows y=0,1,2 with the value sequence, each row read
 * left→right over that row's playable columns. Red (bottom) is the
 * point-symmetric reflection through the board centre: Red@(x,y) mirrors
 * Blue@(7−x,7−y) with the same value, so both players see their own
 * 9,6,1,4 on their own back rank. (Spec §5.1, per-design seat convention.)
 */
export function createDamathPieces(variant: DamathVariant): DamathPiece[] {
  const seq = VALUE_SEQUENCES[variant];
  if (!seq) throw new Error(`Damath variant "${variant}" has no value sequence (locked variant).`);

  const pieces: DamathPiece[] = [];
  let idc = 0;
  const nextId = (player: DamathPlayerId) => `d${player === "blue" ? "B" : "R"}${idc++}`;

  // Blue occupies the top three rows in reading order.
  const blueRows = [0, 1, 2];
  let i = 0;
  for (const y of blueRows) {
    for (const x of getPlayableColumns(y)) {
      const value = seq[i++];
      pieces.push({ id: nextId("blue"), player: "blue", value, dama: false, pos: { x, y } });
    }
  }

  // Red is the 180° rotation of Blue: same value at (7−x, 7−y).
  const blue = pieces.slice();
  for (const b of blue) {
    pieces.push({
      id: nextId("red"),
      player: "red",
      value: b.value,
      dama: false,
      pos: { x: 7 - b.pos.x, y: 7 - b.pos.y },
    });
  }

  return pieces;
}
