import type {
  DamathEndReason,
  DamathGameState,
  DamathLegalMove,
  DamathMoveRecord,
  DamathPiece,
  DamathPlayerId,
  DamathResult,
  DamathRuleOptions,
  DamathScoreEvent,
} from "@dama/shared";
import { calculateDamathScore } from "./damathScoring.js";

/**
 * Default Damath rule options (spec §5.2, §5.4). All forcing rules on;
 * per-design timer + anti-stall values.
 */
export const DAMATH_RULE_OPTIONS: DamathRuleOptions = {
  mustCapture: true,
  mustTakeMaximumPieces: true,
  damaCapturePriority: true,
  allowBackwardCaptureForRegularPiece: true,
  allowFlyingDama: true,
  divisionByZeroSafeScore: true,
  moveTimerSec: 30,
  gameClockSec: 20 * 60,
  inactivityPlyLimit: 40,
};

const other = (p: DamathPlayerId): DamathPlayerId => (p === "red" ? "blue" : "red");

/**
 * Apply a whole chosen move (quiet or full capture chain) to the state.
 * Pure/immutable: returns a new state. Removes captured pieces, relocates the
 * mover, scores each jump against its own landing operator, applies promotion,
 * records the move, and switches the player. (Spec §5.4.)
 */
export function applyDamathMove(
  state: DamathGameState,
  move: DamathLegalMove,
): DamathGameState {
  const mover = state.pieces.find((p) => p.id === move.pieceId);
  if (!mover) throw new Error(`Damath move references unknown piece ${move.pieceId}`);

  const captured = new Set(move.capturedIds);
  const scoreEvents: DamathScoreEvent[] = [];
  let gained = 0;

  // score each jump against its own landing operator, in order.
  for (let i = 0; i < move.capturedIds.length; i++) {
    const victim = state.pieces.find((p) => p.id === move.capturedIds[i]);
    if (!victim) throw new Error(`Damath move references unknown victim ${move.capturedIds[i]}`);
    const op = move.landingOperators[i];
    const r = calculateDamathScore(
      { value: mover.value, dama: mover.dama },
      { value: victim.value, dama: victim.dama },
      op,
    );
    gained += r.points;
    const ev: DamathScoreEvent = {
      kind: "capture",
      player: mover.player,
      points: r.points,
      operator: op,
      capturingValue: mover.value,
      capturedValue: victim.value,
      multiplier: r.multiplier,
      formula: r.formula,
    };
    if (r.note !== undefined) ev.note = r.note;
    scoreEvents.push(ev);
  }

  const landing = move.path[move.path.length - 1];
  const nextPieces: DamathPiece[] = state.pieces
    .filter((p) => !captured.has(p.id))
    .map((p) =>
      p.id === mover.id
        ? { ...p, pos: { ...landing }, dama: p.dama || move.promotion }
        : p,
    );

  const record: DamathMoveRecord = {
    player: mover.player,
    pieceId: mover.id,
    path: move.path.map((c) => ({ ...c })),
    capturedIds: [...move.capturedIds],
    promotion: move.promotion,
    scoreEvents,
  };

  return {
    ...state,
    pieces: nextPieces,
    turn: other(mover.player),
    moveNumber: state.moveNumber + 1,
    redScore: state.redScore + (mover.player === "red" ? gained : 0),
    blueScore: state.blueScore + (mover.player === "blue" ? gained : 0),
    history: [...state.history, record],
  };
}

/** Sum a player's own remaining chips, dama doubled (§5.4 end-of-game bonus). */
function chipBonus(pieces: DamathPiece[], player: DamathPlayerId): number {
  return pieces
    .filter((p) => p.player === player)
    .reduce((sum, p) => sum + p.value * (p.dama ? 2 : 1), 0);
}

/**
 * Finalize scores at a non-resign end: add each player's own remaining-chip
 * bonus to their capture total, emitting a bonus score event per side (§5.4).
 * Pure/immutable.
 */
export function finalizeScores(state: DamathGameState): DamathGameState {
  const redBonus = chipBonus(state.pieces, "red");
  const blueBonus = chipBonus(state.pieces, "blue");

  const bonusEvents: DamathScoreEvent[] = (["red", "blue"] as DamathPlayerId[]).map(
    (player) => {
      const points = player === "red" ? redBonus : blueBonus;
      return {
        kind: "end-of-game-chip-bonus",
        player,
        points,
        formula: `Chips on board: +${points}`,
      };
    },
  );

  const bonusRecord: DamathMoveRecord = {
    player: state.turn,
    pieceId: "",
    path: [],
    capturedIds: [],
    promotion: false,
    scoreEvents: bonusEvents,
  };

  return {
    ...state,
    redScore: state.redScore + redBonus,
    blueScore: state.blueScore + blueBonus,
    history: [...state.history, bonusRecord],
  };
}

/**
 * Resolve the game outcome for an end reason. For non-resign ends the winner
 * is the higher FINAL score (captures + remaining-chip bonus); equal = draw.
 * Resign = the side to move loses outright, no bonus applied. (Spec §5.4.)
 */
export function checkDamathEnd(
  state: DamathGameState,
  reason: DamathEndReason,
): DamathResult {
  if (reason === "resign") {
    return {
      winner: other(state.turn),
      reason,
      redScore: state.redScore,
      blueScore: state.blueScore,
    };
  }

  const finalized = finalizeScores(state);
  const winner: DamathPlayerId | "draw" =
    finalized.redScore > finalized.blueScore
      ? "red"
      : finalized.blueScore > finalized.redScore
        ? "blue"
        : "draw";

  return {
    winner,
    reason,
    redScore: finalized.redScore,
    blueScore: finalized.blueScore,
  };
}
