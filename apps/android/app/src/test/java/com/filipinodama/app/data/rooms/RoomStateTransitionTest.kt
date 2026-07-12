package com.filipinodama.app.data.rooms

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * State-transition tests for [applyRoomStatePayload] — the pure function that
 * mirrors apps/web/src/stores/roomStore.ts's `s.on(EV.roomState, ...)`
 * handler. Fixtures are real EV.roomState JSON shapes verified against
 * apps/server/src/realtime/rooms.ts's roomState()/RoomStatePayload union
 * during Phase 4 research (full snapshot, error, closed, kicked, banned).
 */
class RoomStateTransitionTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }
    private fun parse(raw: String) = json.parseToJsonElement(raw).jsonObject

    @Test
    fun `full snapshot mirrors every field verbatim including a joined guest`() {
        val raw = """
            {"code":"ABC123","hostId":"u1","host":{"userId":"u1","name":"Kap","avatarUrl":null,"tag":"#0001"},
             "guest":{"userId":"u2","name":"Ermi","avatarUrl":"http://x/a.png","tag":"#0002"},
             "spectators":[],"settings":{"forcedMaxCapture":true,"drawMoveLimit":40},"mode":"PRIVATE","matchId":null}
        """.trimIndent()

        val next = applyRoomStatePayload(RoomUiState(), parse(raw))

        assertEquals("ABC123", next.code)
        assertEquals("u1", next.hostId)
        assertEquals("Kap", next.host?.name)
        assertEquals("Ermi", next.guest?.name)
        assertEquals("PRIVATE", next.mode)
        assertNull(next.matchId)
        assertTrue(next.spectators.isEmpty())
        assertNull(next.error)
        assertEquals(false, next.connecting)
    }

    @Test
    fun `snapshot with spectators decodes the full list`() {
        val raw = """
            {"code":"ZZZ999","hostId":"u1","host":{"userId":"u1","name":"Host","avatarUrl":null,"tag":""},
             "guest":null,
             "spectators":[{"userId":"u3","name":"Watcher1","avatarUrl":null,"tag":""},{"userId":"u4","name":"Watcher2","avatarUrl":null,"tag":""}],
             "settings":{"forcedMaxCapture":false,"drawMoveLimit":80,"moveTimerSec":60},"mode":"PRIVATE","matchId":"m1"}
        """.trimIndent()

        val next = applyRoomStatePayload(RoomUiState(), parse(raw))

        assertEquals(2, next.spectators.size)
        assertEquals("Watcher1", next.spectators[0].name)
        assertEquals(60, next.settings.moveTimerSec)
        assertEquals("m1", next.matchId)
    }

    @Test
    fun `not-found error sets the error state and clears connecting`() {
        val current = RoomUiState(connecting = true)
        val raw = """{"code":"NOPE12","error":"not-found"}"""

        val next = applyRoomStatePayload(current, parse(raw))

        assertTrue(next.error is RoomError.NotFound)
        assertEquals("NOPE12", (next.error as RoomError.NotFound).code)
        assertEquals(false, next.connecting)
    }

    @Test
    fun `banned error decodes distinctly from not-found`() {
        val raw = """{"code":"BAN001","error":"banned"}"""
        val next = applyRoomStatePayload(RoomUiState(connecting = true), parse(raw))
        assertTrue(next.error is RoomError.Banned)
        assertEquals("BAN001", (next.error as RoomError.Banned).code)
    }

    @Test
    fun `closed only resets state when it is OUR current room`() {
        val current = RoomUiState(code = "ABC123", hostId = "u1")
        val raw = """{"code":"ABC123","closed":true}"""

        val next = applyRoomStatePayload(current, parse(raw))

        assertTrue(next.error is RoomError.Closed)
        assertNull(next.code) // full reset
    }

    @Test
    fun `closed for a DIFFERENT room code is ignored (stale broadcast)`() {
        val current = RoomUiState(code = "ABC123", hostId = "u1")
        val raw = """{"code":"OTHER99","closed":true}"""

        val next = applyRoomStatePayload(current, parse(raw))

        assertEquals(current, next) // untouched
    }

    @Test
    fun `kicked resets state when it is our room`() {
        val current = RoomUiState(code = "ROOM01")
        val raw = """{"code":"ROOM01","kicked":"u2"}"""
        val next = applyRoomStatePayload(current, parse(raw))
        assertTrue(next.error is RoomError.Kicked)
        assertNull(next.code)
    }

    @Test
    fun `banned status flag resets state as you-banned`() {
        val current = RoomUiState(code = "ROOM01")
        val raw = """{"code":"ROOM01","banned":"u2"}"""
        val next = applyRoomStatePayload(current, parse(raw))
        assertTrue(next.error is RoomError.YouBanned)
    }

    @Test
    fun `malformed snapshot is ignored and current state is returned unchanged`() {
        val current = RoomUiState(code = "KEEPME")
        val raw = """{"code":"X","hostId":"u1"}""" // missing required host/settings/mode fields
        val next = applyRoomStatePayload(current, parse(raw))
        assertEquals(current, next)
    }
}
