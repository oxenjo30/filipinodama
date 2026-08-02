import { type GameState, type Move, type PieceColor, type AiDifficulty } from "@dama/shared";
import { legalMoves, applyMove } from "./engine.js";

const DEPTH: Record<AiDifficulty, number> = { easy: 2, normal: 4, hard: 7 };
const BLUNDER: Record<AiDifficulty, number> = { easy: 0.35, normal: 0.08, hard: 0 };

/**
 * Positional evaluation (higher = better for [me]). Beyond raw material this
 * rewards the ideas a strong Dama player actually uses, which is what makes
 * Hard feel "calculating" rather than just deep:
 *  - Kings are worth much more than men (mobile in all directions).
 *  - Center squares > edge squares (a piece on the rim has half the moves).
 *  - Men advancing toward promotion gain value; the closer, the more.
 *  - Holding your own back rank denies the opponent easy promotions
 *    (a classic checkers principle) — reward each intact home-row man.
 * Board is 8x8; red starts at the bottom (rows 5-7) and moves UP (toward r=0),
 * blue starts at the top and moves DOWN (toward r=7). Kept identical to the
 * Kotlin port in apps/android/.../engine/Ai.kt so web and mobile play equally.
 */
function evaluate(state: GameState, me: PieceColor): number {
  let score = 0;
  for (const p of state.pieces) {
    let v = p.king ? 5 : 1;

    if (!p.king) {
      // Advancement toward the promotion row (0-1 range), squared so the last
      // steps before kinging matter most.
      const rowsToPromote = p.color === "red" ? p.square.r : 7 - p.square.r;
      const progress = (7 - rowsToPromote) / 7; // 0 at home, 1 at promotion edge
      v += progress * progress * 0.9;

      // Back-rank hold: a man still on its own home row guards two promotion
      // squares. Reward keeping the back rank populated.
      const homeRow = p.color === "red" ? 7 : 0;
      if (p.square.r === homeRow) v += 0.35;
    }

    // Central control: distance from the board centre (3.5, 3.5). Central
    // pieces have more legal moves and influence more of the board.
    const centreDist = Math.abs(p.square.r - 3.5) + Math.abs(p.square.c - 3.5);
    v += (7 - centreDist) * 0.03; // ~0..0.2

    score += (p.color === me ? 1 : -1) * v;
  }
  return score;
}

function negamax(state: GameState, depth: number, alpha: number, beta: number, me: PieceColor): number {
  if (state.result) return state.result.winner === me ? 1e6 : state.result.winner === "draw" ? 0 : -1e6;
  if (depth === 0) return evaluate(state, me) * (state.turn === me ? 1 : -1);
  let best = -Infinity;
  for (const mv of legalMoves(state)) {
    const child = applyMove(state, mv);
    const val = -negamax(child, depth - 1, -beta, -alpha, me);
    if (val > best) best = val;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

/** Returns the engine's chosen move for the side to move. */
export function bestMove(state: GameState, difficulty: AiDifficulty = "normal"): Move {
  const moves = legalMoves(state);
  if (moves.length === 0) throw new Error("No legal moves");
  if (Math.random() < BLUNDER[difficulty]) return moves[Math.floor(Math.random() * moves.length)];
  const me = state.turn;
  let best = moves[0];
  let bestVal = -Infinity;
  for (const mv of moves) {
    const child = applyMove(state, mv);
    const val = -negamax(child, DEPTH[difficulty] - 1, -Infinity, Infinity, me);
    if (val > bestVal) {
      bestVal = val;
      best = mv;
    }
  }
  return best;
}

/**
 * Deterministic best-move search at an explicit depth, for ANALYSIS ONLY.
 *
 * `bestMove` is the gameplay entry point and is unsuitable as an analysis
 * reference for two reasons:
 *  - it applies BLUNDER, so `normal` returns a random legal move 8% of the
 *    time. A reference that disagrees with itself cannot measure agreement.
 *  - its difficulty tiers fix the depth, and the only blunder-free tier
 *    (`hard`, depth 7) is far too slow to run in bulk: measured on this
 *    codebase it is ~2.4s in the opening and ~13.3s mid-game per call, i.e.
 *    minutes per match. Depth 4 is ~0.14-0.52s.
 *
 * This exposes the same negamax with no blunder and a caller-chosen depth, so
 * anti-cheat can pick its own speed/strength trade-off without touching how the
 * game itself plays. Gameplay behaviour is unchanged — nothing else calls this.
 */
export function analysisBestMove(state: GameState, depth: number): Move {
  const moves = legalMoves(state);
  if (moves.length === 0) throw new Error("No legal moves");
  const me = state.turn;
  let best = moves[0]!;
  let bestVal = -Infinity;
  for (const mv of moves) {
    const child = applyMove(state, mv);
    const val = -negamax(child, depth - 1, -Infinity, Infinity, me);
    if (val > bestVal) {
      bestVal = val;
      best = mv;
    }
  }
  return best;
}
