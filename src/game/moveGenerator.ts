import {
  DIAGONALS,
  buildOccupancy,
  farRow,
  forwardDiagonals,
  inBounds,
  sqKey,
  type Occupancy,
} from './board'
import type { GameState, MoveSequence, MoveStep, Piece, Side, Square } from './types'

/**
 * Capture-chain rules implemented here (classic Filipino Dama):
 * - Capturing is mandatory; if any capture exists, quiet moves are illegal.
 * - A chain must continue for as long as another capture is available.
 * - Maximum-capture: only sequences capturing the most pieces are legal;
 *   ties are all legal and the player chooses.
 * - Men capture diagonally forward AND backward, but slide forward only.
 * - Kings fly: slide any distance, capture over one enemy at range and land
 *   on any empty square beyond it.
 * - Jumped pieces stay on the board (blocking) until the turn ends and can
 *   never be jumped twice.
 * - A man promotes only if the turn ENDS on the far row; passing through
 *   mid-chain does not promote and the piece keeps capturing as a man.
 */

function manCaptureChains(
  occ: Occupancy,
  side: Side,
  pos: Square,
  captured: Set<string>,
  path: MoveStep[],
  out: MoveStep[][],
): void {
  let extended = false
  for (const [dr, dc] of DIAGONALS) {
    const overRow = pos.row + dr
    const overCol = pos.col + dc
    const landRow = pos.row + 2 * dr
    const landCol = pos.col + 2 * dc
    if (!inBounds(landRow, landCol)) continue
    const over = occ.get(sqKey(overRow, overCol))
    if (!over || over.side === side || captured.has(over.id)) continue
    if (occ.get(sqKey(landRow, landCol))) continue
    extended = true
    captured.add(over.id)
    path.push({ from: { ...pos }, to: { row: landRow, col: landCol }, capturedId: over.id })
    manCaptureChains(occ, side, { row: landRow, col: landCol }, captured, path, out)
    path.pop()
    captured.delete(over.id)
  }
  if (!extended && path.length > 0) out.push([...path])
}

function kingCaptureChains(
  occ: Occupancy,
  side: Side,
  pos: Square,
  captured: Set<string>,
  path: MoveStep[],
  out: MoveStep[][],
): void {
  let extended = false
  for (const [dr, dc] of DIAGONALS) {
    let r = pos.row + dr
    let c = pos.col + dc
    while (inBounds(r, c) && !occ.get(sqKey(r, c))) {
      r += dr
      c += dc
    }
    if (!inBounds(r, c)) continue
    const target = occ.get(sqKey(r, c))
    if (!target || target.side === side || captured.has(target.id)) continue
    let landRow = r + dr
    let landCol = c + dc
    while (inBounds(landRow, landCol) && !occ.get(sqKey(landRow, landCol))) {
      extended = true
      captured.add(target.id)
      path.push({ from: { ...pos }, to: { row: landRow, col: landCol }, capturedId: target.id })
      kingCaptureChains(occ, side, { row: landRow, col: landCol }, captured, path, out)
      path.pop()
      captured.delete(target.id)
      landRow += dr
      landCol += dc
    }
  }
  if (!extended && path.length > 0) out.push([...path])
}

function toSequence(piece: Piece, steps: MoveStep[]): MoveSequence {
  const last = steps[steps.length - 1]
  const capturedIds = steps.flatMap((s) => (s.capturedId ? [s.capturedId] : []))
  return {
    pieceId: piece.id,
    steps,
    capturedIds,
    promotes: piece.kind === 'man' && last.to.row === farRow(piece.side),
  }
}

function quietMoves(occ: Occupancy, piece: Piece): MoveStep[][] {
  const out: MoveStep[][] = []
  const from = { row: piece.row, col: piece.col }
  if (piece.kind === 'man') {
    for (const [dr, dc] of forwardDiagonals(piece.side)) {
      const r = piece.row + dr
      const c = piece.col + dc
      if (inBounds(r, c) && !occ.get(sqKey(r, c))) {
        out.push([{ from: { ...from }, to: { row: r, col: c } }])
      }
    }
  } else {
    for (const [dr, dc] of DIAGONALS) {
      let r = piece.row + dr
      let c = piece.col + dc
      while (inBounds(r, c) && !occ.get(sqKey(r, c))) {
        out.push([{ from: { ...from }, to: { row: r, col: c } }])
        r += dr
        c += dc
      }
    }
  }
  return out
}

function captureSequencesFor(occ: Occupancy, piece: Piece): MoveSequence[] {
  const key = sqKey(piece.row, piece.col)
  occ.delete(key) // the mover never blocks its own path
  const chains: MoveStep[][] = []
  const dfs = piece.kind === 'man' ? manCaptureChains : kingCaptureChains
  dfs(occ, piece.side, { row: piece.row, col: piece.col }, new Set(), [], chains)
  occ.set(key, piece)
  return chains.map((steps) => toSequence(piece, steps))
}

/**
 * All legal full-turn sequences for `side`, with mandatory capture and the
 * maximum-capture filter already applied.
 */
export function getLegalTurnSequences(state: GameState, side: Side = state.turn): MoveSequence[] {
  if (state.status === 'finished') return []
  const occ = buildOccupancy(state.pieces)
  const mine = state.pieces.filter((p) => p.side === side)

  const captures = mine.flatMap((p) => captureSequencesFor(occ, p))
  if (captures.length > 0) {
    const max = Math.max(...captures.map((s) => s.capturedIds.length))
    return captures.filter((s) => s.capturedIds.length === max)
  }

  return mine.flatMap((p) =>
    quietMoves(occ, p).map((steps) => toSequence(p, steps)),
  )
}

export function getLegalMovesForPiece(state: GameState, pieceId: string): MoveSequence[] {
  return getLegalTurnSequences(state).filter((s) => s.pieceId === pieceId)
}

export function hasAnyCapture(state: GameState, side: Side = state.turn): boolean {
  const occ = buildOccupancy(state.pieces)
  return state.pieces
    .filter((p) => p.side === side)
    .some((p) => captureSequencesFor(occ, p).length > 0)
}
