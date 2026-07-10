import type {
  AiDifficulty,
  DamathGameState,
  DamathLegalMove,
} from "@dama/shared";
import { getAllLegalDamathMoves } from "./damathMoveGeneration.js";
import { applyDamathMove } from "./damathRules.js";

/**
 * Per-difficulty blunder rate (spec §5.5, mirroring Classic's BLUNDER). The core
 * selection is a deterministic score-greedy + 1-ply search; difficulty only
 * tunes how often the AI throws a move away. Hard never blunders → optimal play.
 */
export const DAMATH_BLUNDER: Record<AiDifficulty, number> = {
  easy: 0.35,
  normal: 0.08,
  hard: 0,
};

/** A source of randomness in [0,1). Injectable so the AI is fully testable. */
export type Rng = () => number;

/** The immediate score a move earns its mover (sum of its capture events). */
export function scoreDamathMove(
  state: DamathGameState,
  move: DamathLegalMove,
): { myGain: number } {
  const before = state.turn === "red" ? state.redScore : state.blueScore;
  const next = applyDamathMove(state, move);
  const after = state.turn === "red" ? next.redScore : next.blueScore;
  return { myGain: after - before };
}

/** The opponent's best immediate capture gain from a position (0 if none). */
function opponentBestReply(next: DamathGameState): number {
  const replies = getAllLegalDamathMoves(next);
  if (replies.length === 0) return 0;
  let best = 0;
  for (const r of replies) {
    const gain = scoreDamathMove(next, r).myGain;
    if (gain > best) best = gain;
  }
  return best;
}

/**
 * Choose the AI's move: score-greedy with a 1-ply opponent check. Among all
 * legal (already forced-capture-filtered) moves, maximise
 * `myGain − opponentBestImmediateReply`. Deterministic: ties break to the
 * first-found maximiser, so the same position always yields the same move.
 *
 * Difficulty layers a blunder on top — with probability DAMATH_BLUNDER[diff]
 * the AI plays a random legal move instead. `rng` defaults to Math.random but
 * is injectable so the search itself stays testable and deterministic.
 * (Spec §5.5.)
 */
export function bestDamathMove(
  state: DamathGameState,
  difficulty: AiDifficulty = "normal",
  rng: Rng = Math.random,
): DamathLegalMove {
  const moves = getAllLegalDamathMoves(state);
  if (moves.length === 0) throw new Error("Damath AI: no legal moves");

  // blunder: play a uniformly random legal move.
  const blunderRate = DAMATH_BLUNDER[difficulty];
  if (blunderRate > 0 && rng() < blunderRate) {
    const idx = Math.min(moves.length - 1, Math.floor(rng() * moves.length));
    return moves[idx];
  }

  let best = moves[0];
  let bestNet = -Infinity;
  for (const move of moves) {
    const { myGain } = scoreDamathMove(state, move);
    const next = applyDamathMove(state, move);
    const net = myGain - opponentBestReply(next);
    if (net > bestNet) {
      bestNet = net;
      best = move;
    }
  }
  return best;
}
