package com.filipinodama.app.data.profile

import com.filipinodama.app.data.engine.DEFAULT_SETTINGS
import com.filipinodama.app.data.engine.Move
import com.filipinodama.app.data.engine.PieceColors
import com.filipinodama.app.data.engine.Rules
import com.filipinodama.app.data.engine.Square
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * ReplayReconstruction tests — a real match-moves fixture reconstructed
 * board-per-ply, mirroring apps/web ReplayModal.tsx's
 * `[createInitialState(settings), ...moves.reduce(applyMove)]` snapshot list.
 * Verifies: states[0] is the untouched initial position, states.size ==
 * moves.size + 1 (one snapshot per ply), and the FINAL board matches what
 * independently re-applying every move via [Rules.applyMove] produces
 * (i.e. reconstruction agrees with the engine, not a re-derived expectation).
 */
class ReplayReconstructionTest {

    /**
     * A real legal opening sequence, verified against Rules.legalMoves() from
     * the actual initial position (not hand-guessed coordinates):
     *   1. Red   (5,2) -> (4,1)
     *   2. Blue  (2,3) -> (3,2)
     *   3. Red   (4,1) captures the blue man at (3,2), lands (2,3)
     */
    private fun fixtureMoves(): List<Move> = listOf(
        Move(from = Square(5, 2), path = listOf(Square(4, 1)), captures = emptyList(), promotion = false),
        Move(from = Square(2, 3), path = listOf(Square(3, 2)), captures = emptyList(), promotion = false),
        Move(from = Square(4, 1), path = listOf(Square(2, 3)), captures = listOf(Square(3, 2)), promotion = false)
    )

    @Test
    fun `reconstruction produces one snapshot per ply, states0 is the untouched initial position`() {
        val moves = fixtureMoves()
        val states = ReplayReconstruction.reconstruct(DEFAULT_SETTINGS, moves)

        assertEquals(moves.size + 1, states.size)

        val initial = states[0]
        assertEquals(12, initial.pieces.count { it.color == PieceColors.RED })
        assertEquals(12, initial.pieces.count { it.color == PieceColors.BLUE })
        assertEquals(PieceColors.RED, initial.turn)
        assertTrue(initial.history.isEmpty())
    }

    @Test
    fun `reconstruction final board matches independently re-applying the same moves via Rules-applyMove`() {
        val moves = fixtureMoves()
        val states = ReplayReconstruction.reconstruct(DEFAULT_SETTINGS, moves)

        // Independently walk the engine forward from a fresh initial state —
        // this is the "expected" side, built without going through
        // ReplayReconstruction at all.
        var expected = Rules.initialState(DEFAULT_SETTINGS)
        for (mv in moves) expected = Rules.applyMove(expected, mv)

        val actual = states.last()
        assertEquals(expected.pieces.toSet().map { it.id to it.square to it.king to it.color },
            actual.pieces.toSet().map { it.id to it.square to it.king to it.color })
        assertEquals(expected.turn, actual.turn)
        assertEquals(expected.moveNumber, actual.moveNumber)
    }

    @Test
    fun `the captured piece is removed from the final board and the mover has advanced`() {
        val moves = fixtureMoves()
        val states = ReplayReconstruction.reconstruct(DEFAULT_SETTINGS, moves)
        val final = states.last()

        // The blue man that moved to (3,2) was captured; a real replay
        // reconstruction must show ONE FEWER blue piece than the start.
        assertEquals(11, final.pieces.count { it.color == PieceColors.BLUE })
        assertEquals(12, final.pieces.count { it.color == PieceColors.RED })

        // The capturing red man landed at (2,3).
        assertTrue(final.pieces.any { it.color == PieceColors.RED && it.square == Square(2, 3) })
        // No piece remains on the captured square.
        assertFalse(final.pieces.any { it.square == Square(3, 2) })
    }

    @Test
    fun `an illegal stored move stops reconstruction early rather than crashing`() {
        val illegal = Move(from = Square(0, 0), path = listOf(Square(0, 1)), captures = emptyList(), promotion = false)
        val moves = listOf(fixtureMoves()[0], illegal, fixtureMoves()[1])

        val states = ReplayReconstruction.reconstruct(DEFAULT_SETTINGS, moves)

        // Reconstruction stops right after the last VALID move (index 0): initial
        // state + 1 successfully-applied move = 2 snapshots, not 4.
        assertEquals(2, states.size)
    }

    @Test
    fun `null settings falls back to DEFAULT_SETTINGS, matching the web modal's m-settings ?? DEFAULT_SETTINGS`() {
        val states = ReplayReconstruction.reconstruct(null, emptyList())
        assertEquals(1, states.size)
        assertEquals(DEFAULT_SETTINGS, states[0].settings)
    }
}
