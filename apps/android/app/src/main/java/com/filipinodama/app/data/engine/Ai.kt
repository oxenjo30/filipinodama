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

    /**
     * Positional evaluation (higher = better for [me]). Kept IDENTICAL to the
     * shared TS engine (packages/game-engine/src/ai.ts) so Android and web play
     * at equal strength. Beyond raw material this rewards the ideas a strong
     * Dama player uses — which is what makes Hard feel "calculating":
     *  - Kings worth much more than men (mobile in all directions).
     *  - Central squares > edge squares (rim pieces have half the moves).
     *  - Men advancing toward promotion gain value (squared, so the last steps
     *    matter most).
     *  - Holding your own back rank denies the opponent easy promotions.
     * Board is 8x8; red starts at the bottom (rows 5-7) moving UP (toward r=0),
     * blue starts at the top moving DOWN (toward r=7).
     */
    private fun evaluate(state: GameState, me: PieceColor): Double {
        var score = 0.0
        for (p in state.pieces) {
            var v = if (p.king) 5.0 else 1.0

            if (!p.king) {
                // Advancement toward promotion (0..1), squared so the final
                // steps before kinging matter most.
                val rowsToPromote = if (p.color == PieceColors.RED) p.square.r else 7 - p.square.r
                val progress = (7 - rowsToPromote) / 7.0
                v += progress * progress * 0.9

                // Back-rank hold: a man on its own home row guards two promotion
                // squares.
                val homeRow = if (p.color == PieceColors.RED) 7 else 0
                if (p.square.r == homeRow) v += 0.35
            }

            // Central control: closer to centre (3.5, 3.5) = more mobility.
            val centreDist = kotlin.math.abs(p.square.r - 3.5) + kotlin.math.abs(p.square.c - 3.5)
            v += (7 - centreDist) * 0.03

            score += (if (p.color == me) 1 else -1) * v
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
