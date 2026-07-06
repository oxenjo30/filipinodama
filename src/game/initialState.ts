import { SIZE, isPlayable } from './board'
import type { GameState, Piece, Side } from './types'

function sideRows(side: Side): number[] {
  return side === 'blue' ? [0, 1, 2] : [SIZE - 3, SIZE - 2, SIZE - 1]
}

function buildSide(side: Side): Piece[] {
  const pieces: Piece[] = []
  let n = 0
  for (const row of sideRows(side)) {
    for (let col = 0; col < SIZE; col++) {
      if (!isPlayable(row, col)) continue
      n++
      pieces.push({ id: `${side}-${n}`, side, kind: 'man', row, col })
    }
  }
  return pieces
}

/** 24 pieces: 12 per side on the first three playable rows. Red moves first. */
export function createInitialGameState(): GameState {
  return {
    pieces: [...buildSide('blue'), ...buildSide('red')],
    turn: 'red',
    status: 'playing',
    moveHistory: [],
  }
}
