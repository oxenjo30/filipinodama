package com.filipinodama.app.data.tournaments

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Unit tests for the tournament ready-check's pure logic — which of the four
 * "Your Match" card states a slot is in, the no-show countdown, and the wire
 * shape of the payload both the REST detail route and the
 * "tournament:matchState" push carry.
 *
 * The state selection is the part that must not drift: readying is a
 * COMMITMENT (there is no un-ready), so showing the Ready button one state too
 * late — or showing it at all once the match is live — is a real gameplay
 * bug, not a cosmetic one.
 */
class TournamentReadyCheckTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private fun opponent(username: String = "Rival", tag: String = "1234") =
        TournamentOpponentDto(userId = "u2", username = username, tag = tag)

    private fun myMatch(
        opponent: TournamentOpponentDto? = opponent(),
        iAmReady: Boolean = false,
        opponentReady: Boolean = false,
        deadlineAt: String? = null,
        matchId: String? = null
    ) = TournamentMyMatchDto(
        tournamentId = "t1",
        tmId = "tm1",
        round = 1,
        bracket = "W",
        roundLabel = "Semifinals",
        opponent = opponent,
        iAmReady = iAmReady,
        opponentReady = opponentReady,
        deadlineAt = deadlineAt,
        matchId = matchId,
        yourColor = "red"
    )

    // ── card state selection ──

    @Test
    fun `a slot with both competitors and no readiness offers the Ready button`() {
        assertEquals(YourMatchState.CAN_READY, yourMatchState(myMatch()))
    }

    @Test
    fun `an opponent who readied first still leaves us on the Ready button`() {
        assertEquals(YourMatchState.CAN_READY, yourMatchState(myMatch(opponentReady = true)))
    }

    @Test
    fun `our own ready switches the card to waiting`() {
        assertEquals(YourMatchState.READY_WAITING, yourMatchState(myMatch(iAmReady = true)))
    }

    @Test
    fun `a slot whose other side is an unfinished earlier match cannot be readied`() {
        assertEquals(YourMatchState.AWAITING_OPPONENT, yourMatchState(myMatch(opponent = null)))
    }

    @Test
    fun `a live match beats every other state — the player belongs on the board`() {
        val live = myMatch(iAmReady = true, opponentReady = true, matchId = "m1")
        assertEquals(YourMatchState.LIVE, yourMatchState(live))
        // …even if the server hadn't recorded our readiness for some reason.
        assertEquals(YourMatchState.LIVE, yourMatchState(myMatch(matchId = "m1")))
    }

    // ── countdown ──

    @Test
    fun `the countdown only runs once a deadline is armed and the match has not started`() {
        assertFalse("no deadline armed yet", countdownRunning(myMatch()))
        assertTrue(countdownRunning(myMatch(iAmReady = true, deadlineAt = "2026-08-02T10:05:00Z")))
        assertFalse(
            "a started match supersedes the no-show clock",
            countdownRunning(myMatch(deadlineAt = "2026-08-02T10:05:00Z", matchId = "m1"))
        )
    }

    @Test
    fun `secondsUntilDeadline floors to whole seconds and never goes negative`() {
        val now = java.time.Instant.parse("2026-08-02T10:00:00Z").toEpochMilli()
        assertEquals(300, secondsUntilDeadline("2026-08-02T10:05:00Z", now))
        assertEquals(90, secondsUntilDeadline("2026-08-02T10:01:30.500Z", now))
        assertEquals(0, secondsUntilDeadline("2026-08-02T09:59:00Z", now))
    }

    @Test
    fun `secondsUntilDeadline is zero for a missing or unparseable deadline`() {
        assertEquals(0, secondsUntilDeadline(null, 0L))
        assertEquals(0, secondsUntilDeadline("not-a-timestamp", 0L))
    }

    @Test
    fun `formatCountdown reads as a countdown, not a clock time`() {
        assertEquals("5:00", formatCountdown(300))
        assertEquals("4:07", formatCountdown(247))
        assertEquals("0:38", formatCountdown(38))
        assertEquals("0:00", formatCountdown(-5))
    }

    // ── wire shape ──

    @Test
    fun `the myMatch payload decodes field-for-field from the server shape`() {
        val raw = """
            {"tournamentId":"t1","tmId":"tm1","round":101,"bracket":"L",
             "roundLabel":"Lower Bracket Final",
             "opponent":{"userId":"u2","username":"Rival","tag":"1234","avatarUrl":null,"frameId":"filigree"},
             "iAmReady":true,"opponentReady":false,"deadlineAt":"2026-08-02T10:05:00.000Z",
             "matchId":null,"yourColor":"blue"}
        """.trimIndent()

        val dto = json.decodeFromString(TournamentMyMatchDto.serializer(), raw)

        assertEquals("tm1", dto.tmId)
        assertEquals(101, dto.round)
        assertEquals("Lower Bracket Final", dto.roundLabel)
        assertEquals("Rival", dto.opponent?.username)
        assertEquals("filigree", dto.opponent?.frameId)
        assertNull(dto.opponent?.avatarUrl)
        assertTrue(dto.iAmReady)
        assertFalse(dto.opponentReady)
        assertEquals("2026-08-02T10:05:00.000Z", dto.deadlineAt)
        assertNull(dto.matchId)
        assertEquals("blue", dto.yourColor)
    }

    @Test
    fun `the tournament detail response carries myMatch, and tolerates it being absent`() {
        val withMatch = """
            {"id":"t1","name":"Cup","format":"SINGLE_ELIM","status":"RUNNING",
             "myMatch":{"tournamentId":"t1","tmId":"tm1","yourColor":"red"}}
        """.trimIndent()
        val withoutMatch = """{"id":"t1","name":"Cup","format":"SINGLE_ELIM","status":"OPEN"}"""

        assertEquals(
            "tm1",
            json.decodeFromString(TournamentDetailDto.serializer(), withMatch).myMatch?.tmId
        )
        assertNull(json.decodeFromString(TournamentDetailDto.serializer(), withoutMatch).myMatch)
    }

    @Test
    fun `the start payload decodes the match handoff`() {
        val raw = """{"tournamentId":"t1","tmId":"tm1","matchId":"m9","yourColor":"red"}"""

        val dto = json.decodeFromString(TournamentStartDto.serializer(), raw)

        assertEquals("m9", dto.matchId)
        assertEquals("red", dto.yourColor)
        assertEquals("tm1", dto.tmId)
    }
}
