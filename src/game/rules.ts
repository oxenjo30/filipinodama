import { opponentOf } from './board'
import { getLegalTurnSequences } from './moveGenerator'
import type { GameState, Piece, ResultReason, Side } from './types'

export function getPieceAt(state: GameState, row: number, col: number): Piece | undefined {
  return state.pieces.find((p) => p.row === row && p.col === col)
}

/**
 * Evaluates the position for a finished game. Returns the winning side, or
 * undefined while the game is still live. A side with no pieces or no legal
 * moves on its turn loses.
 */
export function getWinner(state: GameState): Side | undefined {
  if (state.status === 'finished') return state.winner
  const current = state.turn
  const currentPieces = state.pieces.filter((p) => p.side === current)
  if (currentPieces.length === 0) return opponentOf(current)
  if (getLegalTurnSequences(state, current).length === 0) return opponentOf(current)
  return undefined
}

export function resignGame(state: GameState, resigning: Side): GameState {
  if (state.status === 'finished') return state
  return {
    ...state,
    status: 'finished',
    winner: opponentOf(resigning),
    resultReason: 'surrender',
  }
}

export function endInDraw(state: GameState, reason: ResultReason = 'draw'): GameState {
  if (state.status === 'finished') return state
  return { ...state, status: 'finished', winner: undefined, resultReason: reason }
}
