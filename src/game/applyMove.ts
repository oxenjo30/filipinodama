import { farRow, opponentOf, squareName } from './board'
import { getLegalTurnSequences } from './moveGenerator'
import type { GameState, MoveRecord, MoveSequence, Piece } from './types'

function sequenceSignature(seq: MoveSequence): string {
  const path = seq.steps.map((s) => `${s.to.row},${s.to.col}`).join('>')
  return `${seq.pieceId}|${path}|${[...seq.capturedIds].sort().join(',')}`
}

function notationOf(seq: MoveSequence, isCapture: boolean): string {
  const joiner = isCapture ? 'x' : '-'
  return [squareName(seq.steps[0].from), ...seq.steps.map((s) => squareName(s.to))].join(joiner)
}

/** Promotes a man standing on its far row; otherwise returns the piece unchanged. */
export function promoteIfNeeded(piece: Piece): Piece {
  if (piece.kind === 'man' && piece.row === farRow(piece.side)) {
    return { ...piece, kind: 'king' }
  }
  return piece
}

/**
 * Applies a full turn sequence and returns the next state. Throws if the
 * sequence is not one of the currently legal sequences — the engine is the
 * last line of defense; the UI should never let an illegal move get here.
 */
export function applyMoveSequence(state: GameState, seq: MoveSequence): GameState {
  const legal = getLegalTurnSequences(state)
  const signature = sequenceSignature(seq)
  const match = legal.find((s) => sequenceSignature(s) === signature)
  if (!match) {
    throw new Error(`Illegal move sequence for ${seq.pieceId}`)
  }

  const isCapture = match.capturedIds.length > 0
  const last = match.steps[match.steps.length - 1]
  const capturedSet = new Set(match.capturedIds)

  const pieces = state.pieces
    .filter((p) => !capturedSet.has(p.id))
    .map((p) =>
      p.id === match.pieceId
        ? promoteIfNeeded({ ...p, row: last.to.row, col: last.to.col })
        : p,
    )

  const mover = state.pieces.find((p) => p.id === match.pieceId)!
  const record: MoveRecord = {
    side: mover.side,
    pieceId: match.pieceId,
    path: [match.steps[0].from, ...match.steps.map((s) => s.to)],
    capturedIds: match.capturedIds,
    promoted: match.promotes,
    notation: notationOf(match, isCapture),
  }

  const next: GameState = {
    pieces,
    turn: opponentOf(state.turn),
    status: 'playing',
    moveHistory: [...state.moveHistory, record],
  }

  const opponent = opponentOf(mover.side)
  const opponentPieces = pieces.filter((p) => p.side === opponent)
  if (opponentPieces.length === 0) {
    return { ...next, status: 'finished', winner: mover.side, resultReason: 'no-pieces' }
  }
  if (getLegalTurnSequences(next, opponent).length === 0) {
    return { ...next, status: 'finished', winner: mover.side, resultReason: 'no-moves' }
  }
  return next
}
