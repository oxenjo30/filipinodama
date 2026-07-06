import { describe, expect, it } from 'vitest'
import { applyMoveSequence } from './applyMove'
import { isPlayable } from './board'
import { createBotMove } from './bot'
import { createMatchState, matchReducer } from './gameReducer'
import { createInitialGameState } from './initialState'
import { getLegalMovesForPiece, getLegalTurnSequences, hasAnyCapture } from './moveGenerator'
import { getPieceAt, getWinner, resignGame } from './rules'
import type { GameState, MoveSequence, Piece, PieceKind, Side } from './types'

let n = 0
const piece = (side: Side, kind: PieceKind, row: number, col: number): Piece => {
  if (!isPlayable(row, col)) throw new Error(`test setup: (${row},${col}) is not playable`)
  return { id: `${side}-t${++n}`, side, kind, row, col }
}

const state = (pieces: Piece[], turn: Side = 'red'): GameState => ({
  pieces,
  turn,
  status: 'playing',
  moveHistory: [],
})

const destinations = (seqs: MoveSequence[]) =>
  seqs.map((s) => s.steps[s.steps.length - 1].to).map(({ row, col }) => `${row},${col}`)

describe('initial state', () => {
  it('has 24 pieces on playable squares', () => {
    const s = createInitialGameState()
    expect(s.pieces).toHaveLength(24)
    expect(s.pieces.every((p) => isPlayable(p.row, p.col))).toBe(true)
    expect(s.pieces.every((p) => p.kind === 'man')).toBe(true)
  })

  it('has 12 pieces per side on their first three rows', () => {
    const s = createInitialGameState()
    const red = s.pieces.filter((p) => p.side === 'red')
    const blue = s.pieces.filter((p) => p.side === 'blue')
    expect(red).toHaveLength(12)
    expect(blue).toHaveLength(12)
    expect(red.every((p) => p.row >= 5 && p.row <= 7)).toBe(true)
    expect(blue.every((p) => p.row >= 0 && p.row <= 2)).toBe(true)
    expect(s.turn).toBe('red')
  })
})

describe('man movement', () => {
  it('moves one square diagonally forward when not capturing', () => {
    const red = piece('red', 'man', 5, 2)
    const s = state([red, piece('blue', 'man', 0, 7)])
    const moves = getLegalMovesForPiece(s, red.id)
    expect(destinations(moves).sort()).toEqual(['4,1', '4,3'])
    expect(moves.every((m) => m.capturedIds.length === 0)).toBe(true)
  })

  it('rejects backward non-capture moves', () => {
    const red = piece('red', 'man', 5, 2)
    const s = state([red, piece('blue', 'man', 0, 7)])
    const moves = getLegalMovesForPiece(s, red.id)
    expect(moves.every((m) => m.steps[0].to.row < 5)).toBe(true)
  })

  it('may capture backward even though it cannot slide backward', () => {
    const red = piece('red', 'man', 3, 2)
    const blueBehind = piece('blue', 'man', 4, 1) // behind red, capture toward row 5
    const s = state([red, blueBehind, piece('blue', 'man', 0, 7)])
    const moves = getLegalMovesForPiece(s, red.id)
    expect(moves).toHaveLength(1)
    expect(moves[0].capturedIds).toEqual([blueBehind.id])
    expect(moves[0].steps[0].to).toEqual({ row: 5, col: 0 })
  })
})

describe('mandatory capture', () => {
  it('returns only capture sequences when a capture is available', () => {
    const red = piece('red', 'man', 5, 2)
    const target = piece('blue', 'man', 4, 3)
    const s = state([red, target, piece('blue', 'man', 0, 7)])
    expect(hasAnyCapture(s, 'red')).toBe(true)
    const legal = getLegalTurnSequences(s)
    expect(legal.length).toBeGreaterThan(0)
    expect(legal.every((m) => m.capturedIds.length > 0)).toBe(true)
  })

  it('excludes quiet moves of every piece while any capture exists', () => {
    const red = piece('red', 'man', 5, 2)
    const idle = piece('red', 'man', 7, 0) // has quiet moves but no capture
    const target = piece('blue', 'man', 4, 3)
    const s = state([red, idle, target, piece('blue', 'man', 0, 7)])
    const legal = getLegalTurnSequences(s)
    expect(legal.every((m) => m.capturedIds.length > 0)).toBe(true)
    expect(legal.every((m) => m.pieceId === red.id)).toBe(true)
    expect(getLegalMovesForPiece(s, idle.id)).toHaveLength(0)
  })
})

describe('multi-capture and maximum capture', () => {
  it('generates full multi-jump sequences', () => {
    const red = piece('red', 'man', 5, 2)
    const b1 = piece('blue', 'man', 4, 3)
    const b2 = piece('blue', 'man', 2, 3)
    const s = state([red, b1, b2])
    const legal = getLegalTurnSequences(s)
    expect(legal).toHaveLength(1)
    expect(legal[0].steps).toHaveLength(2)
    expect(legal[0].capturedIds).toEqual([b1.id, b2.id])
    expect(destinations(legal)).toEqual(['1,2'])
  })

  it('filters out shorter capture routes (maximum-capture rule)', () => {
    const a = piece('red', 'man', 5, 2) // can chain two captures
    const b = piece('red', 'man', 4, 7) // can capture only one
    const s = state([
      a,
      b,
      piece('blue', 'man', 4, 3),
      piece('blue', 'man', 2, 3),
      piece('blue', 'man', 3, 6),
    ])
    const legal = getLegalTurnSequences(s)
    expect(legal.every((m) => m.capturedIds.length === 2)).toBe(true)
    expect(legal.every((m) => m.pieceId === a.id)).toBe(true)
    expect(getLegalMovesForPiece(s, b.id)).toHaveLength(0)
  })

  it('keeps all tied maximum routes legal', () => {
    const red = piece('red', 'man', 5, 2)
    const left = piece('blue', 'man', 4, 1)
    const right = piece('blue', 'man', 4, 3)
    const s = state([red, left, right, piece('blue', 'man', 0, 7)])
    const legal = getLegalTurnSequences(s)
    expect(legal).toHaveLength(2)
    expect(new Set(destinations(legal))).toEqual(new Set(['3,0', '3,4']))
  })
})

describe('promotion', () => {
  it('promotes a man that ends its turn on the far row', () => {
    const red = piece('red', 'man', 1, 2)
    const s = state([red, piece('blue', 'man', 7, 6)])
    const move = getLegalMovesForPiece(s, red.id).find((m) => m.steps[0].to.col === 1)!
    expect(move.promotes).toBe(true)
    const next = applyMoveSequence(s, move)
    expect(next.pieces.find((p) => p.id === red.id)!.kind).toBe('king')
    expect(next.moveHistory[0].promoted).toBe(true)
  })

  it('does NOT promote when only passing through the far row mid-capture', () => {
    const red = piece('red', 'man', 2, 1)
    const b1 = piece('blue', 'man', 1, 2)
    const b2 = piece('blue', 'man', 1, 4)
    const s = state([red, b1, b2])
    const legal = getLegalTurnSequences(s)
    expect(legal).toHaveLength(1)
    expect(legal[0].capturedIds).toHaveLength(2)
    expect(legal[0].promotes).toBe(false)
    const next = applyMoveSequence(s, legal[0])
    const mover = next.pieces.find((p) => p.id === red.id)!
    expect(mover.kind).toBe('man')
    expect(mover.row).toBe(2)
    expect(mover.col).toBe(5)
  })
})

describe('kings', () => {
  it('slides any distance forward or backward', () => {
    const king = piece('red', 'king', 4, 3)
    const s = state([king, piece('blue', 'man', 0, 7)])
    const dests = destinations(getLegalMovesForPiece(s, king.id))
    expect(dests).toContain('5,4') // backward for red
    expect(dests).toContain('7,6') // far backward
    expect(dests).toContain('1,0') // long forward slide
    expect(dests).not.toContain('0,7') // blocked by the blue piece itself
  })

  it('captures at range and must take the max-capture continuation', () => {
    const king = piece('red', 'king', 7, 0)
    const b1 = piece('blue', 'man', 4, 3)
    const b2 = piece('blue', 'man', 2, 5)
    const s = state([king, b1, b2])
    const legal = getLegalTurnSequences(s)
    expect(legal.length).toBeGreaterThan(0)
    // every legal route takes both pieces: landing choices that abandon the
    // second capture are filtered by the maximum-capture rule
    expect(legal.every((m) => m.capturedIds.length === 2)).toBe(true)
    const next = applyMoveSequence(s, legal[0])
    expect(next.pieces.filter((p) => p.side === 'blue')).toHaveLength(0)
  })
})

describe('game end', () => {
  it('ends when the opponent has no pieces left', () => {
    const red = piece('red', 'man', 2, 1)
    const lastBlue = piece('blue', 'man', 1, 2)
    const s = state([red, lastBlue])
    const next = applyMoveSequence(s, getLegalTurnSequences(s)[0])
    expect(next.status).toBe('finished')
    expect(next.winner).toBe('red')
    expect(next.resultReason).toBe('no-pieces')
  })

  it('ends when the player to move has no legal moves', () => {
    const trapped = piece('blue', 'man', 0, 1)
    const s = state([
      trapped,
      piece('red', 'man', 1, 0),
      piece('red', 'man', 1, 2),
      piece('red', 'man', 2, 3),
      piece('red', 'man', 5, 0),
    ])
    // move the far-away piece so the blockade around blue stays intact
    const move = getLegalTurnSequences(s).find(
      (m) => m.steps[0].from.row === 5 && m.steps[0].from.col === 0,
    )!
    const next = applyMoveSequence(s, move)
    expect(next.status).toBe('finished')
    expect(next.winner).toBe('red')
    expect(next.resultReason).toBe('no-moves')
  })

  it('getWinner sees a live game as undecided', () => {
    expect(getWinner(createInitialGameState())).toBeUndefined()
  })

  it('handles surrender', () => {
    const next = resignGame(createInitialGameState(), 'red')
    expect(next.status).toBe('finished')
    expect(next.winner).toBe('blue')
    expect(next.resultReason).toBe('surrender')
  })
})

describe('engine safety', () => {
  it('rejects sequences that are not currently legal', () => {
    const s = createInitialGameState()
    const forged: MoveSequence = {
      pieceId: s.pieces.find((p) => p.side === 'red')!.id,
      steps: [{ from: { row: 5, col: 0 }, to: { row: 3, col: 0 } }],
      capturedIds: [],
      promotes: false,
    }
    expect(() => applyMoveSequence(s, forged)).toThrow(/Illegal/)
  })

  it('getPieceAt finds pieces by coordinates', () => {
    const s = createInitialGameState()
    expect(getPieceAt(s, 0, 1)?.side).toBe('blue')
    expect(getPieceAt(s, 4, 1)).toBeUndefined()
  })
})

describe('bot', () => {
  it('only returns legal moves from any position', () => {
    const s = createInitialGameState()
    const legalSigs = new Set(
      getLegalTurnSequences(s).map((m) => JSON.stringify([m.pieceId, m.steps])),
    )
    for (let i = 0; i < 20; i++) {
      const move = createBotMove(s, 'easy')
      expect(move).not.toBeNull()
      expect(legalSigs.has(JSON.stringify([move!.pieceId, move!.steps]))).toBe(true)
    }
  })

  it('is forced onto max-capture routes by the generator', () => {
    const a = piece('red', 'man', 5, 2)
    const s = state([
      a,
      piece('red', 'man', 4, 7),
      piece('blue', 'man', 4, 3),
      piece('blue', 'man', 2, 3),
      piece('blue', 'man', 3, 6),
    ])
    const move = createBotMove(s, 'normal')!
    expect(move.capturedIds).toHaveLength(2)
  })

  it('prefers a winning move', () => {
    const red = piece('red', 'man', 2, 1)
    const lastBlue = piece('blue', 'man', 1, 2)
    const s = state([red, lastBlue])
    const move = createBotMove(s, 'normal')!
    const next = applyMoveSequence(s, move)
    expect(next.winner).toBe('red')
  })

  it('prefers promotion among quiet moves', () => {
    const promoter = piece('red', 'man', 1, 2)
    const walker = piece('red', 'man', 5, 2)
    const s = state([promoter, walker, piece('blue', 'man', 0, 7)])
    const move = createBotMove(s, 'normal')!
    expect(move.promotes).toBe(true)
    expect(move.pieceId).toBe(promoter.id)
  })

  it('returns null when there is nothing to play', () => {
    const finished = resignGame(createInitialGameState(), 'red')
    expect(createBotMove(finished)).toBeNull()
  })

  it('hard bot only returns legal moves', () => {
    const s = createInitialGameState()
    const legalSigs = new Set(
      getLegalTurnSequences(s).map((m) => JSON.stringify([m.pieceId, m.steps])),
    )
    for (let i = 0; i < 10; i++) {
      const move = createBotMove(s, 'hard')
      expect(move).not.toBeNull()
      expect(legalSigs.has(JSON.stringify([move!.pieceId, move!.steps]))).toBe(true)
    }
  })

  it('hard bot refuses to hang a piece when a safe move exists', () => {
    // red man at (4,3): stepping to (3,2) lets blue at (2,1) jump it into the
    // vacated square; stepping to (3,4) is safe. Hard must pick the safe step.
    const red = piece('red', 'man', 4, 3)
    const s = state([red, piece('blue', 'man', 2, 1)])
    for (let i = 0; i < 10; i++) {
      const move = createBotMove(s, 'hard')!
      expect(move.steps[0].to).toEqual({ row: 3, col: 4 })
    }
  })
})

describe('match reducer', () => {
  it('applies, undoes, restarts, and surrenders', () => {
    let m = createMatchState()
    const move = getLegalTurnSequences(m.current)[0]
    m = matchReducer(m, { type: 'apply', sequence: move })
    expect(m.current.moveHistory).toHaveLength(1)
    expect(m.past).toHaveLength(1)

    m = matchReducer(m, { type: 'undo' })
    expect(m.current.moveHistory).toHaveLength(0)
    expect(m.past).toHaveLength(0)

    m = matchReducer(m, { type: 'surrender', side: 'blue' })
    expect(m.current.winner).toBe('red')

    m = matchReducer(m, { type: 'restart' })
    expect(m.current.status).toBe('playing')
    expect(m.current.pieces).toHaveLength(24)
  })
})
