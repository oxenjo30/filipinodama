package com.filipinodama.app.data.match

import com.filipinodama.app.data.engine.DEFAULT_SETTINGS
import com.filipinodama.app.data.engine.GameState
import com.filipinodama.app.data.engine.Piece
import com.filipinodama.app.data.engine.PieceColors
import com.filipinodama.app.data.engine.Square
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Spectator-mode UI-state invariants — a viewer (myColor == null) must NEVER
 * be able to produce a move intent, mirroring the server's own gating
 * (match.ts colorOf() returns null for a non-player, and matchMove is
 * refused with "not-a-player"). This is the CLIENT-side mirror of that same
 * invariant: onSquareClick must be a pure no-op whenever myColor is null,
 * regardless of board contents or whose turn it is.
 */
class SpectatorModeTest {

    private fun man(id: String, color: String, r: Int, c: Int) = Piece(id, color, king = false, square = Square(r, c))

    private fun state(pieces: List<Piece>, turn: String = PieceColors.RED) =
        GameState(id = "m1", pieces = pieces, turn = turn, moveNumber = 1, history = emptyList(), settings = DEFAULT_SETTINGS)

    @After
    fun tearDown() {
        MatchRepository.hardReset()
    }

    @Test
    fun `withHighlights never computes targets for a spectator even on a tappable square`() {
        val gs = state(listOf(man("a", PieceColors.RED, 5, 2)))
        val ui = MatchUiState(gameState = gs, myColor = null, selected = Square(5, 2)).withHighlights()
        assertTrue(ui.moveTargets.isEmpty())
        assertTrue(ui.captureTargets.isEmpty())
        assertEquals(false, ui.mustCapture)
    }

    @Test
    fun `enterFromRoom with a null yourColor puts MatchRepository into spectator state`() {
        MatchRepository.enterFromRoom(matchId = "m1", yourColor = null, opponent = null)
        val st = MatchRepository.state.value
        assertNull(st.myColor)
        assertEquals("m1", st.matchId)
        assertEquals(MatchStatus.PLAYING, st.status)
    }

    @Test
    fun `enterFromRoom with a real color puts MatchRepository into player state`() {
        MatchRepository.enterFromRoom(matchId = "m2", yourColor = PieceColors.RED, opponent = null)
        val st = MatchRepository.state.value
        assertEquals(PieceColors.RED, st.myColor)
        assertEquals("m2", st.matchId)
    }

    @Test
    fun `onSquareClick is a pure no-op for a spectator regardless of board contents or turn`() {
        // enterFromRoom leaves gameState null (a real resync/matchState event
        // would populate it) — onSquareClick's very first guard is `myColor ?:
        // return`, so it short-circuits before ever touching gameState/Rules.
        MatchRepository.enterFromRoom(matchId = "m4", yourColor = null, opponent = null)
        val before = MatchRepository.state.value
        MatchRepository.onSquareClick(Square(5, 2))
        val after = MatchRepository.state.value
        assertNull(after.selected)
        assertEquals(before.moveTargets, after.moveTargets)
        assertEquals(before.captureTargets, after.captureTargets)
    }

    @Test
    fun `setRoomOpponentHint fills a null opponent but never overwrites an existing one`() {
        MatchRepository.enterFromRoom(matchId = "m3", yourColor = PieceColors.BLUE, opponent = null)
        MatchRepository.setRoomOpponentHint("u9", "Kap", "#0001", null)
        assertEquals("u9", MatchRepository.state.value.opponent?.id)

        // A second hint must not clobber the first (mirrors roomStore.ts's
        // reference-identity best-effort, not an authoritative re-fetch).
        MatchRepository.setRoomOpponentHint("u10", "Someone Else", "#0002", null)
        assertEquals("u9", MatchRepository.state.value.opponent?.id)
    }
}
