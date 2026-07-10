// Math Dama (Damath) — shared types. Fully isolated from Classic Dama (game.ts):
// opposite board parity, numeric-value pieces, per-square operators, score-based winner.
// See docs/superpowers/specs/2026-07-10-math-dama-damath-mode-design.md.

/** The four operations printed on the operation board. */
export type DamathOperator = "+" | "−" | "×" | "÷";

/** Seats. Blue is top (y=0..2, moves +y); Red is bottom (y=5..7, moves −y). */
export type DamathPlayerId = "red" | "blue";

/**
 * MVP ships `whole` only; the rest are registry-locked ("Coming Soon").
 * `level` groups them for the UI selector; it carries no rules.
 */
export type DamathVariant =
  | "counting"
  | "whole"
  | "fraction"
  | "integer"
  | "rational"
  | "radical"
  | "polynomial"
  | "binary";

/** Damath board coordinate: x = column 0..7 (L→R), y = row 0..7 (top→bottom). */
export type DamathCoord = { x: number; y: number };

export type DamathPiece = {
  id: string;
  player: DamathPlayerId;
  /** numeric chip value for numeric variants (whole/counting/integer). */
  value: number;
  dama: boolean;
  pos: DamathCoord;
};

/** One scoring event. `capture` events read a landing operator; the
 *  end-of-game chip bonus reads none (it sums remaining chip values). */
export type DamathScoreEvent = {
  kind: "capture" | "end-of-game-chip-bonus";
  player: DamathPlayerId;
  /** exact numeric delta credited to `player` (float; UI rounds for display). */
  points: number;
  /** present for `capture`: the operands + landing operator that produced it. */
  operator?: DamathOperator;
  capturingValue?: number;
  capturedValue?: number;
  multiplier?: number;
  /** human-readable formula for the history panel, e.g. "7 × 3 = 21". */
  formula: string;
  /** set when a scoring edge case fired, e.g. division-by-zero-safe-score. */
  note?: string;
};

/** A single played move (whole capture chain collapses into one record). */
export type DamathMoveRecord = {
  player: DamathPlayerId;
  pieceId: string;
  path: DamathCoord[];
  capturedIds: string[];
  promotion: boolean;
  scoreEvents: DamathScoreEvent[];
};

/** A legal move offered to a player; carries everything scoring/apply needs. */
export type DamathLegalMove = {
  pieceId: string;
  from: DamathCoord;
  /** landing squares in order; length > 1 for multi-jumps. */
  path: DamathCoord[];
  /** captured piece ids in capture order (parallel to the jumps in `path`). */
  capturedIds: string[];
  /** landing operator per jump — scoring always reads the landing square. */
  landingOperators: DamathOperator[];
  promotion: boolean;
};

export type DamathEndReason =
  | "clock"
  | "no-moves"
  | "no-pieces"
  | "threefold"
  | "inactivity"
  | "resign"
  | "manual";

export type DamathResult = {
  winner: DamathPlayerId | "draw";
  reason: DamathEndReason;
  redScore: number;
  blueScore: number;
};

/** All rules toggles. Defaults in DAMATH_RULE_OPTIONS. */
export type DamathRuleOptions = {
  mustCapture: boolean;
  mustTakeMaximumPieces: boolean;
  damaCapturePriority: boolean;
  allowBackwardCaptureForRegularPiece: boolean;
  allowFlyingDama: boolean;
  /** ÷ by a 0-valued chip → score 0 with a safe note (vs. throwing). */
  divisionByZeroSafeScore: boolean;
  /** move-timer seconds; per-player game clock seconds. */
  moveTimerSec: number;
  gameClockSec: number;
  /** plies without a capture before the inactivity end fires. */
  inactivityPlyLimit: number;
};

export type DamathGameState = {
  id: string;
  variant: DamathVariant;
  pieces: DamathPiece[];
  turn: DamathPlayerId;
  moveNumber: number;
  redScore: number;
  blueScore: number;
  history: DamathMoveRecord[];
  options: DamathRuleOptions;
  result?: DamathResult;
  /** ms remaining on each per-player clock. */
  clocks?: { red: number; blue: number };
};
