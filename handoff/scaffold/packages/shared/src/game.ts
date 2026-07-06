import type { PieceColor, MatchEndReason } from "./enums.js";

export type Square = { r: number; c: number };

export type Piece = {
  id: string;
  color: PieceColor;
  king: boolean;
  square: Square;
};

export type Move = {
  from: Square;
  /** landing square(s); length > 1 for multi-jumps */
  path: Square[];
  /** squares of pieces removed by this move */
  captures: Square[];
  promotion: boolean;
};

export type GameSettings = {
  forcedMaxCapture: boolean;
  drawMoveLimit: number;
  moveTimerSec?: number;
};

export type GameResult = {
  winner: PieceColor | "draw";
  reason: MatchEndReason;
};

export type GameState = {
  id: string;
  pieces: Piece[];
  turn: PieceColor;
  moveNumber: number;
  history: Move[];
  settings: GameSettings;
  result?: GameResult;
  clocks?: { red: number; blue: number };
};

export const DEFAULT_SETTINGS: GameSettings = {
  forcedMaxCapture: true,
  drawMoveLimit: 40,
};

/** true when (r,c) is a playable (dark) square */
export const isDark = (r: number, c: number): boolean => (r + c) % 2 === 1;

export const sq = (r: number, c: number): Square => ({ r, c });
export const sameSquare = (a: Square, b: Square): boolean => a.r === b.r && a.c === b.c;
