import type { Piece, Side, Square } from './types'

export const SIZE = 8

/** Playable squares are the dark diagonals: (row + col) odd. */
export const isPlayable = (row: number, col: number): boolean => (row + col) % 2 === 1

export const inBounds = (row: number, col: number): boolean =>
  row >= 0 && row < SIZE && col >= 0 && col < SIZE

export const sqKey = (row: number, col: number): number => row * SIZE + col

/** Occupancy index: square key -> piece. */
export type Occupancy = Map<number, Piece>

export const buildOccupancy = (pieces: Piece[]): Occupancy =>
  new Map(pieces.map((p) => [sqKey(p.row, p.col), p]))

/** All four diagonal directions. */
export const DIAGONALS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
]

/** Red sits on rows 5-7 and advances toward row 0; blue advances toward row 7. */
export const forwardDiagonals = (side: Side): ReadonlyArray<readonly [number, number]> =>
  side === 'red' ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]]

export const farRow = (side: Side): number => (side === 'red' ? 0 : SIZE - 1)

export const opponentOf = (side: Side): Side => (side === 'red' ? 'blue' : 'red')

const COLS = 'abcdefgh'

/** "d5"-style label: file letter + rank counted from the bottom (red side). */
export const squareName = ({ row, col }: Square): string => `${COLS[col]}${SIZE - row}`
