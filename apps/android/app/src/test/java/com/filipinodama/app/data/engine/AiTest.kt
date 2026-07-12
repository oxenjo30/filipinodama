package com.filipinodama.app.data.engine

import kotlin.random.Random
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Parity/sanity tests for the negamax AI port (mirrors packages/game-engine
 * test/engine.test.ts's "ai bestMove" describe block). We don't assert exact
 * move equality with the TS engine (floating-point search order can differ
 * trivially) — we assert the CONTRACT: always a legal move, always takes a
 * forced winning capture, throws with no legal moves, and every difficulty
 * runs without error.
 */
class AiTest {

    private fun man(id: String, color: PieceColor, r: Int, c: Int) = Piece(id, color, king = false, square = Square(r, c))

    private fun board(pieces: List<Piece>, turn: PieceColor = PieceColors.RED) =
        GameState(id = "t", pieces = pieces, turn = turn, moveNumber = 1, history = emptyList(), settings = DEFAULT_SETTINGS)

    // A random source that never triggers the blunder branch (mirrors the TS
    // tests' `vi.spyOn(Math, "random").mockReturnValue(0.99)`).
    private val noBlunder = object : Random() {
        override fun nextBits(bitCount: Int): Int = Random.Default.nextBits(bitCount)
        override fun nextDouble(): Double = 0.99
    }

    @Test
    fun `easy returns a legal move on the opening position`() {
        val s = Rules.initialState()
        val mv = Ai.bestMove(s, AiDifficulties.EASY, noBlunder)
        assertTrue(Rules.isLegal(s, mv))
    }

    @Test
    fun `hard search returns a legal move on a small board`() {
        val s = board(listOf(man("a", PieceColors.RED, 6, 1), man("b", PieceColors.BLUE, 1, 2)))
        val mv = Ai.bestMove(s, AiDifficulties.HARD, noBlunder)
        assertTrue(Rules.isLegal(s, mv))
    }

    @Test(expected = IllegalStateException::class)
    fun `throws when there are no legal moves`() {
        val s = board(
            listOf(
                man("b", PieceColors.BLUE, 0, 1),
                man("r1", PieceColors.RED, 1, 0),
                man("r2", PieceColors.RED, 1, 2),
                man("r3", PieceColors.RED, 2, 3)
            ),
            PieceColors.BLUE
        )
        Ai.bestMove(s, AiDifficulties.HARD, noBlunder)
    }

    @Test
    fun `takes a forced winning capture`() {
        val s = board(listOf(man("a", PieceColors.RED, 5, 2), man("b", PieceColors.BLUE, 4, 3)))
        val mv = Ai.bestMove(s, AiDifficulties.HARD, noBlunder)
        assertTrue(mv.captures.isNotEmpty())
        val ns = Rules.applyMove(s, mv)
        assertTrue(ns.result?.winner == PieceColors.RED)
    }

    @Test
    fun `normal difficulty returns a legal move`() {
        val s = Rules.initialState()
        val mv = Ai.bestMove(s, AiDifficulties.NORMAL, noBlunder)
        assertTrue(Rules.isLegal(s, mv))
    }

    @Test
    fun `easy difficulty can play a random legal blunder`() {
        val alwaysBlunder = object : Random() {
            override fun nextBits(bitCount: Int): Int = Random.Default.nextBits(bitCount)
            override fun nextDouble(): Double = 0.0
        }
        val s = Rules.initialState()
        val mv = Ai.bestMove(s, AiDifficulties.EASY, alwaysBlunder)
        assertTrue(Rules.isLegal(s, mv))
    }
}
