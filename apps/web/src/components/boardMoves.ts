import { legalMoves } from "@dama/game-engine";
import { sameSquare, type GameState, type Square } from "@dama/shared";

/** The board must advertise exactly the moves accepted by both game stores. */
export function boardMoves(state: GameState, selected?: Square | null) {
  const moves = state.result ? [] : legalMoves(state);
  return {
    captureSources: moves.filter((move) => move.captures.length > 0).map((move) => move.from),
    selectedMoves: selected ? moves.filter((move) => sameSquare(move.from, selected)) : [],
  };
}

export const squareLabel = (square: Square) => `${"abcdefgh"[square.c]}${8 - square.r}`;
