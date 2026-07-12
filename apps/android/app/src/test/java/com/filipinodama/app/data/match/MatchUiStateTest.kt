package com.filipinodama.app.data.match

import com.filipinodama.app.data.engine.DEFAULT_SETTINGS
import com.filipinodama.app.data.engine.GameState
import com.filipinodama.app.data.engine.Piece
import com.filipinodama.app.data.engine.PieceColors
import com.filipinodama.app.data.engine.Square
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * [MatchUiState.withHighlights] mirrors onlineStore.ts's `derive()` — legal
 * move/capture highlights are computed from the server's authoritative
 * GameState, gated on "it's actually my turn to act," and NEVER computed for
 * the opponent's turn (so a stale selection can't linger across a turn flip).
 */
class MatchUiStateTest {

    private fun man(id: String, color: String, r: Int, c: Int) = Piece(id, color, king = false, square = Square(r, c))

    private fun state(pieces: List<Piece>, turn: String = PieceColors.RED) =
        GameState(id = "m1", pieces = pieces, turn = turn, moveNumber = 1, history = emptyList(), settings = DEFAULT_SETTINGS)

    @Test
    fun `no highlights when nothing is selected`() {
        val gs = state(listOf(man("a", PieceColors.RED, 5, 2)))
        val ui = MatchUiState(gameState = gs, myColor = PieceColors.RED, selected = null).withHighlights()
        assertTrue(ui.moveTargets.isEmpty())
        assertTrue(ui.captureTargets.isEmpty())
    }

    @Test
    fun `selecting my own piece on my turn populates moveTargets`() {
        val gs = state(listOf(man("a", PieceColors.RED, 5, 2)))
        val ui = MatchUiState(gameState = gs, myColor = PieceColors.RED, selected = Square(5, 2)).withHighlights()
        assertEquals(setOf(Square(4, 1), Square(4, 3)), ui.moveTargets.toSet())
        assertTrue(ui.captureTargets.isEmpty())
    }

    @Test
    fun `highlights are suppressed when it is NOT my turn even with a stale selection`() {
        val gs = state(listOf(man("a", PieceColors.RED, 5, 2), man("b", PieceColors.BLUE, 2, 3)), turn = PieceColors.BLUE)
        val ui = MatchUiState(gameState = gs, myColor = PieceColors.RED, selected = Square(5, 2)).withHighlights()
        assertTrue(ui.moveTargets.isEmpty())
        assertTrue(ui.captureTargets.isEmpty())
    }

    @Test
    fun `mustCapture is true when ANY legal move for the side to move is a capture`() {
        val gs = state(listOf(man("a", PieceColors.RED, 5, 2), man("b", PieceColors.BLUE, 4, 3)))
        val ui = MatchUiState(gameState = gs, myColor = PieceColors.RED, selected = null).withHighlights()
        assertTrue(ui.mustCapture)
    }

    @Test
    fun `captureTargets populate separately from moveTargets when the selected piece must capture`() {
        val gs = state(listOf(man("a", PieceColors.RED, 5, 2), man("b", PieceColors.BLUE, 4, 3)))
        val ui = MatchUiState(gameState = gs, myColor = PieceColors.RED, selected = Square(5, 2)).withHighlights()
        assertEquals(setOf(Square(3, 4)), ui.captureTargets.toSet())
        assertTrue(ui.moveTargets.isEmpty())
    }

    @Test
    fun `no highlights at all when gameState or myColor is null`() {
        val ui1 = MatchUiState(gameState = null, myColor = PieceColors.RED).withHighlights()
        assertFalse(ui1.mustCapture)
        val gs = state(listOf(man("a", PieceColors.RED, 5, 2)))
        val ui2 = MatchUiState(gameState = gs, myColor = null).withHighlights()
        assertFalse(ui2.mustCapture)
    }
}
