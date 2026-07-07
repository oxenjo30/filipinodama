import { type GameState, type Move, type PieceColor, type AiDifficulty } from "@dama/shared";
import { legalMoves, applyMove } from "./engine.js";

const DEPTH: Record<AiDifficulty, number> = { easy: 2, normal: 4, hard: 7 };
const BLUNDER: Record<AiDifficulty, number> = { easy: 0.35, normal: 0.08, hard: 0 };

function evaluate(state: GameState, me: PieceColor): number {
  let score = 0;
  for (const p of state.pieces) {
    const v = p.king ? 3 : 1;
    // advancement bonus for men
    const adv = p.king ? 0 : p.color === "red" ? (7 - p.square.r) * 0.05 : p.square.r * 0.05;
    score += (p.color === me ? 1 : -1) * (v + adv);
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
