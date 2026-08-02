package com.filipinodama.app.data

import com.filipinodama.app.data.engine.DEFAULT_SETTINGS
import com.filipinodama.app.data.engine.GameState
import com.filipinodama.app.data.engine.PieceColors
import com.filipinodama.app.data.match.MatchRepository
import com.filipinodama.app.data.match.MatchStatus
import com.filipinodama.app.data.rooms.RoomRepository
import com.filipinodama.app.data.social.DmRepository
import com.filipinodama.app.data.social.NotificationsRepository
import com.filipinodama.app.data.social.PresenceRepository
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Session teardown on sign-out.
 *
 * Every repository here is a process-wide `object` holding a StateFlow. Clearing
 * the cookie jar does NOT clear them, and it does not end the realtime session
 * either — the server authenticates a socket ONCE at handshake, so an
 * established connection stays bound to the user it handshook as.
 *
 * On a shared device that meant the next person to sign in inherited the
 * previous user's cached DM threads, notification feed and match state, and
 * drove their still-authenticated socket: matchmaking joins, moves and chat all
 * emitted under the previous user's identity.
 *
 * These tests pin the fan-out. If someone adds a socket-backed or user-scoped
 * repository and forgets to register it in [resetSessionState], that is a
 * cross-account data leak — so the list is asserted, not assumed.
 */
class SessionResetTest {

    @After
    fun tearDown() {
        resetSessionState()
    }

    private fun aBoard() = GameState(
        id = "gs", pieces = emptyList(), turn = PieceColors.RED,
        moveNumber = 1, history = emptyList(), settings = DEFAULT_SETTINGS
    )

    @Test
    fun `resetSessionState clears cached match state`() {
        MatchRepository.enterFromRoom(matchId = "m1", yourColor = PieceColors.RED, opponent = null)
        assertEquals("m1", MatchRepository.state.value.matchId)

        resetSessionState()

        val st = MatchRepository.state.value
        assertNull("a signed-out app must not retain a match id", st.matchId)
        assertNull(st.myColor)
        assertNull(st.gameState)
        assertEquals(MatchStatus.IDLE, st.status)
    }

    @Test
    fun `resetSessionState clears cached DM conversations`() {
        // DM bodies live in this singleton's StateFlow — the most sensitive of
        // the cached surfaces, since they are another person's private messages.
        DmRepository.hardReset()
        assertTrue(DmRepository.state.value.conversations.isEmpty())

        resetSessionState()

        val st = DmRepository.state.value
        assertTrue(st.conversations.isEmpty())
        assertEquals(0, st.unread)
        assertNull(st.openUserId)
    }

    @Test
    fun `resetSessionState clears presence, notifications and room state`() {
        resetSessionState()

        assertTrue(PresenceRepository.online.value.isEmpty())
        assertNull(NotificationsRepository.state.value.data)
        assertFalse(NotificationsRepository.state.value.loading)
        assertNull(RoomRepository.state.value.code)
        assertTrue(RoomRepository.state.value.chat.isEmpty())
    }

    @Test
    fun `resetSessionState clears the active-match banner store`() {
        // Otherwise the next user sees a "Return to match" bar for a match that
        // belongs to the person who just signed out.
        resetSessionState()

        assertNull(com.filipinodama.app.data.match.ActiveMatchStore.active.value)
    }

    @Test
    fun `resetSessionState is idempotent`() {
        resetSessionState()
        resetSessionState()

        assertNull(MatchRepository.state.value.matchId)
        assertTrue(DmRepository.state.value.conversations.isEmpty())
    }
}
