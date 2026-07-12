package com.filipinodama.app.data.engine

import kotlin.random.Random

/**
 * Kotlin port of packages/game-engine/src/ai.ts — same negamax search, same
 * depth-per-difficulty and blunder-chance tables, so Android's offline
 * "Play vs AI" mode (mirrors apps/web/src/stores/gameStore.ts, which is
 * fully client-local with zero server/socket involvement — see Phase 3
 * research) plays at parity with the web client's local AI, not a
 * simplified/random substitute.
 */
object Ai {

    private val DEPTH = mapOf(
        AiDifficulties.EASY to 2,
        AiDifficulties.NORMAL to 4,
        AiDifficulties.HARD to 7
    )
    private val BLUNDER = mapOf(
        AiDifficulties.EASY to 0.35,
        AiDifficulties.NORMAL to 0.08,
        AiDifficulties.HARD to 0.0
    )

    private fun evaluate(state: GameState, me: PieceColor): Double {
        var score = 0.0
        for (p in state.pieces) {
            val v = if (p.king) 3.0 else 1.0
            val adv = if (p.king) 0.0 else if (p.color == PieceColors.RED) (7 - p.square.r) * 0.05 else p.square.r * 0.05
            score += (if (p.color == me) 1 else -1) * (v + adv)
        }
        return score
    }

    private fun negamax(state: GameState, depth: Int, alphaIn: Double, beta: Double, me: PieceColor): Double {
        val result = state.result
        if (result != null) {
            return when (result.winner) {
                me -> 1e6
                "draw" -> 0.0
                else -> -1e6
            }
        }
        if (depth == 0) return evaluate(state, me) * (if (state.turn == me) 1 else -1)
        var alpha = alphaIn
        var best = Double.NEGATIVE_INFINITY
        for (mv in Rules.legalMoves(state)) {
            val child = Rules.applyMove(state, mv)
            val value = -negamax(child, depth - 1, -beta, -alpha, me)
            if (value > best) best = value
            if (best > alpha) alpha = best
            if (alpha >= beta) break
        }
        return best
    }

    /** Returns the engine's chosen move for the side to move. Throws if none exist. */
    fun bestMove(state: GameState, difficulty: String = AiDifficulties.NORMAL, random: Random = Random.Default): Move {
        val moves = Rules.legalMoves(state)
        if (moves.isEmpty()) throw IllegalStateException("No legal moves")
        val blunderChance = BLUNDER[difficulty] ?: BLUNDER.getValue(AiDifficulties.NORMAL)
        if (random.nextDouble() < blunderChance) return moves[random.nextInt(moves.size)]
        val depth = DEPTH[difficulty] ?: DEPTH.getValue(AiDifficulties.NORMAL)
        val me = state.turn
        var best = moves[0]
        var bestVal = Double.NEGATIVE_INFINITY
        for (mv in moves) {
            val child = Rules.applyMove(state, mv)
            val value = -negamax(child, depth - 1, Double.NEGATIVE_INFINITY, Double.POSITIVE_INFINITY, me)
            if (value > bestVal) {
                bestVal = value
                best = mv
            }
        }
        return best
    }
}
