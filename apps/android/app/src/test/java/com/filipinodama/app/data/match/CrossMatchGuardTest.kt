package com.filipinodama.app.data.match

import com.filipinodama.app.data.engine.DEFAULT_SETTINGS
import com.filipinodama.app.data.engine.GameResult
import com.filipinodama.app.data.engine.GameState
import com.filipinodama.app.data.engine.Move
import com.filipinodama.app.data.engine.Piece
import com.filipinodama.app.data.engine.PieceColors
import com.filipinodama.app.data.engine.Square
import kotlinx.serialization.json.Json
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test

/**
 * Cross-match event isolation.
 *
 * Leaving a match SCREEN does not leave the server-side match ROOM (the server's
 * spectate:leave refuses to evict a real player, and the client never emits an
 * explicit leave). The Socket.IO connection is a process-wide singleton, so a
 * previous match's `match:moved` / `match:ended` broadcasts keep arriving after
 * the player has started a NEW match.
 *
 * Before the guard, those payloads were applied to whatever match was on screen:
 * the board silently became a different game, and a stale `match:ended` forced a
 * VICTORY/DEFEAT card for a match the player was not in — with the win/lose copy
 * evaluated against the wrong colour. `match:chat` was already guarded; the two
 * handlers that actually mutate the board were not.
 */
class CrossMatchGuardTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    @After
    fun tearDown() {
        MatchRepository.hardReset()
    }

    private fun board(vararg pieces: Piece) = GameState(
        id = "gs", pieces = pieces.toList(), turn = PieceColors.RED,
        moveNumber = 1, history = emptyList(), settings = DEFAULT_SETTINGS
    )

    private fun man(id: String, r: Int, c: Int) =
        Piece(id, PieceColors.RED, king = false, square = Square(r, c))

    private fun inMatch(id: String, gs: GameState) = MatchUiState(
        status = MatchStatus.PLAYING, matchId = id, gameState = gs, myColor = PieceColors.RED
    )

    private fun aMove() = Move(
        from = Square(5, 2), path = listOf(Square(4, 3)), captures = emptyList(), promotion = false
    )

    // ---- matchMoved ----

    @Test
    fun `a move from a DIFFERENT match leaves the current board untouched`() {
        val mine = board(man("a", 5, 2))
        val theirs = board(man("z", 2, 3))
        val before = inMatch("match-B", mine)

        val after = applyMatchMoved(before, MatchMovedDto("match-A", aMove(), theirs))

        assertSame("state must be returned unchanged, not copied", before, after)
        assertEquals(mine, after.gameState)
    }

    @Test
    fun `a move for the current match is applied`() {
        val before = inMatch("match-B", board(man("a", 5, 2)))
        val next = board(man("a", 4, 3))

        val after = applyMatchMoved(before, MatchMovedDto("match-B", aMove(), next))

        assertEquals(next, after.gameState)
        assertEquals(false, after.pendingMove)
    }

    @Test
    fun `a move is applied when we hold no match yet`() {
        // The guard is deliberately `current.matchId != null && ...` so it can
        // never block a legitimate first payload.
        val next = board(man("a", 4, 3))

        val after = applyMatchMoved(MatchUiState(), MatchMovedDto("match-NEW", aMove(), next))

        assertEquals(next, after.gameState)
    }

    // ---- matchEnded ----

    @Test
    fun `an ending from a DIFFERENT match does not end the current one`() {
        val before = inMatch("match-B", board(man("a", 5, 2)))

        val after = applyMatchEnded(
            before,
            MatchEndedDto(
                matchId = "match-A",
                result = GameResult(winner = PieceColors.RED, reason = "resign"),
                state = null
            )
        )

        assertSame(before, after)
        assertEquals(MatchStatus.PLAYING, after.status)
        assertNull("no result card for a match we are not in", after.end)
    }

    @Test
    fun `an ending for the current match ends it`() {
        val before = inMatch("match-B", board(man("a", 5, 2)))

        val after = applyMatchEnded(
            before,
            MatchEndedDto(
                matchId = "match-B",
                result = GameResult(winner = PieceColors.RED, reason = "resign"),
                state = null
            )
        )

        assertEquals(MatchStatus.ENDED, after.status)
        assertNotNull(after.end)
    }

    // ---- matchState ----

    @Test
    fun `a resync for a DIFFERENT match is ignored`() {
        val mine = board(man("a", 5, 2))
        val before = inMatch("match-B", mine)

        val after = applyMatchState(
            before,
            MatchStateDto("match-A", board(man("z", 2, 3)), yourColor = PieceColors.BLUE)
        )

        assertSame(before, after)
        assertEquals("match-B", after.matchId)
        assertEquals(PieceColors.RED, after.myColor)
    }

    @Test
    fun `a resync is accepted as the ENTRY path when we hold no match yet`() {
        val gs = board(man("a", 5, 2))

        val after = applyMatchState(
            MatchUiState(),
            MatchStateDto("match-NEW", gs, yourColor = PieceColors.BLUE)
        )

        assertEquals("match-NEW", after.matchId)
        assertEquals(PieceColors.BLUE, after.myColor)
        assertEquals(MatchStatus.PLAYING, after.status)
    }

    // ---- MatchEndedDto null-state tolerance ----

    @Test
    fun `matchEnded payload with an explicit null state deserializes`() {
        // The stranded-match sweeper (server realtime/match.ts) emits exactly
        // this. A non-null `state` type made the WHOLE payload fail to decode,
        // the event was swallowed, and the board froze on "Opponent's move..."
        // with no result card and no timeout. A Kotlin default does NOT cover an
        // explicit null — only a missing key — so this needs a nullable type.
        val raw = """
            {"matchId":"m1","result":{"winner":"draw","reason":"abandon"},
             "winnerId":null,"loserId":null,
             "redTrophyDelta":0,"blueTrophyDelta":0,"goldReward":0,"state":null}
        """.trimIndent()

        val dto = json.decodeFromString(MatchEndedDto.serializer(), raw)

        assertNull(dto.state)
        assertEquals("abandon", dto.result.reason)
    }

    @Test
    fun `a null-state ending keeps the last known board instead of blanking it`() {
        val lastKnown = board(man("a", 5, 2))
        val before = inMatch("m1", lastKnown)

        val after = applyMatchEnded(
            before,
            MatchEndedDto(
                matchId = "m1",
                result = GameResult(winner = "draw", reason = "abandon"),
                state = null
            )
        )

        assertEquals(MatchStatus.ENDED, after.status)
        assertEquals("board must survive a null-state ending", lastKnown, after.gameState)
        assertNotNull(after.end)
    }
}
