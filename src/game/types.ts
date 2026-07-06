// Pure domain types for the Filipino Dama rules engine.
// This module (and everything under src/game) must stay free of React/DOM imports.

export type Side = 'red' | 'blue'
export type PieceKind = 'man' | 'king'

export interface Square {
  row: number
  col: number
}

export interface Piece {
  id: string
  side: Side
  kind: PieceKind
  row: number
  col: number
}

/** One landing step within a turn (a slide, or a single jump in a chain). */
export interface MoveStep {
  from: Square
  to: Square
  /** id of the enemy piece jumped by this step, if it is a capture */
  capturedId?: string
}

/**
 * A complete legal turn for one piece. Multi-captures are always returned as
 * full sequences so mandatory-continuation and maximum-capture can be enforced.
 */
export interface MoveSequence {
  pieceId: string
  steps: MoveStep[]
  capturedIds: string[]
  /** true when a man ends the turn on its far row and becomes a king */
  promotes: boolean
}

export interface MoveRecord {
  side: Side
  pieceId: string
  path: Square[]
  capturedIds: string[]
  promoted: boolean
  notation: string
}

export type GameStatus = 'playing' | 'finished'

export type ResultReason = 'no-pieces' | 'no-moves' | 'surrender' | 'draw'

export interface GameState {
  pieces: Piece[]
  turn: Side
  status: GameStatus
  winner?: Side
  resultReason?: ResultReason
  moveHistory: MoveRecord[]
}

export type BotDifficulty = 'easy' | 'normal' | 'hard'
