package com.filipinodama.app.data.match

import com.filipinodama.app.data.engine.Move
import com.filipinodama.app.data.engine.Square
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Serialization round-trip tests using REAL payload JSON shapes verified
 * against apps/server/src/realtime/match.ts + matchmaking.ts during Phase 3
 * research (field names, optionality, and the known payload inconsistencies
 * — e.g. match:illegal's matchId being absent on the bad-request case — are
 * all reproduced literally below, not paraphrased).
 */
class MatchDtoSerializationTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    @Test
    fun `mmFound decodes the full payload including opponent device`() {
        val raw = """
            {"matchId":"m1","opponent":{"id":"u2","username":"ermitanyo","displayName":"Ermitanyo","tag":"#4821","avatarUrl":null,"trophies":1290,"rankTier":"KABALYERO_II","skin":null,"frameId":null,"device":"web"},"yourColor":"red","settings":{"forcedMaxCapture":true,"drawMoveLimit":40}}
        """.trimIndent()

        val dto = json.decodeFromString<MmFoundDto>(raw)

        assertEquals("m1", dto.matchId)
        assertEquals("red", dto.yourColor)
        assertEquals("Ermitanyo", dto.opponent?.displayName)
        assertEquals("web", dto.opponent?.device)
        assertTrue(dto.settings.forcedMaxCapture)
        assertEquals(40, dto.settings.drawMoveLimit)
    }

    @Test
    fun `mmFound decodes a null opponent (lookup failure case)`() {
        val raw = """{"matchId":"m1","opponent":null,"yourColor":"blue","settings":{"forcedMaxCapture":true,"drawMoveLimit":40}}"""
        val dto = json.decodeFromString<MmFoundDto>(raw)
        assertNull(dto.opponent)
        assertEquals("blue", dto.yourColor)
    }

    @Test
    fun `matchState decodes a full GameState with history and clocks`() {
        val raw = """
            {"matchId":"m1","yourColor":"red","settings":{"forcedMaxCapture":true,"drawMoveLimit":40},
             "state":{"id":"m1","turn":"blue","moveNumber":2,
               "pieces":[{"id":"p0","color":"red","king":false,"square":{"r":5,"c":2}},{"id":"p1","color":"blue","king":false,"square":{"r":2,"c":3}}],
               "history":[{"from":{"r":6,"c":1},"path":[{"r":5,"c":2}],"captures":[],"promotion":false}],
               "settings":{"forcedMaxCapture":true,"drawMoveLimit":40},
               "clocks":{"red":298000,"blue":300000}}}
        """.trimIndent()

        val dto = json.decodeFromString<MatchStateDto>(raw)

        assertEquals("m1", dto.matchId)
        assertEquals("red", dto.yourColor)
        assertEquals(2, dto.state.pieces.size)
        assertEquals("blue", dto.state.turn)
        assertEquals(1, dto.state.history.size)
        assertNull(dto.state.result)
        assertEquals(298000L, dto.state.clocks?.red)
    }

    @Test
    fun `matchState decodes with null yourColor for a spectator`() {
        val raw = """
            {"matchId":"m1","yourColor":null,"settings":{"forcedMaxCapture":true,"drawMoveLimit":40},
             "state":{"id":"m1","turn":"red","moveNumber":1,"pieces":[],"history":[],"settings":{"forcedMaxCapture":true,"drawMoveLimit":40}}}
        """.trimIndent()

        val dto = json.decodeFromString<MatchStateDto>(raw)
        assertNull(dto.yourColor)
    }

    @Test
    fun `matchMoved decodes move plus full resulting state`() {
        val raw = """
            {"matchId":"m1","move":{"from":{"r":5,"c":2},"path":[{"r":3,"c":4}],"captures":[{"r":4,"c":3}],"promotion":false},
             "state":{"id":"m1","turn":"blue","moveNumber":3,"pieces":[],"history":[],"settings":{"forcedMaxCapture":true,"drawMoveLimit":40}}}
        """.trimIndent()

        val dto = json.decodeFromString<MatchMovedDto>(raw)

        assertEquals(Square(5, 2), dto.move.from)
        assertEquals(1, dto.move.captures.size)
        assertEquals("blue", dto.state.turn)
    }

    @Test
    fun `matchEnded decodes trophy and gold deltas`() {
        val raw = """
            {"matchId":"m1","result":{"winner":"red","reason":"capture-all"},"winnerId":"u1","loserId":"u2",
             "redTrophyDelta":25,"blueTrophyDelta":-18,"goldReward":50,
             "state":{"id":"m1","turn":"red","moveNumber":10,"pieces":[],"history":[],"settings":{"forcedMaxCapture":true,"drawMoveLimit":40},
               "result":{"winner":"red","reason":"capture-all"}}}
        """.trimIndent()

        val dto = json.decodeFromString<MatchEndedDto>(raw)

        assertEquals("red", dto.result.winner)
        assertEquals("capture-all", dto.result.reason)
        assertEquals(25, dto.redTrophyDelta)
        assertEquals(-18, dto.blueTrophyDelta)
        assertEquals(50, dto.goldReward)
        assertEquals("red", dto.state?.result?.winner)
    }

    @Test
    fun `matchIllegal decodes the bad-request case with matchId entirely absent`() {
        // Real server quirk verified in research: match.ts:576 omits matchId
        // and move entirely on the bad-request path.
        val raw = """{"reason":"bad-request"}"""
        val dto = json.decodeFromString<MatchIllegalDto>(raw)
        assertNull(dto.matchId)
        assertEquals("bad-request", dto.reason)
    }

    @Test
    fun `matchIllegal decodes the no-such-match case with matchId present`() {
        val raw = """{"matchId":"m1","reason":"no-such-match"}"""
        val dto = json.decodeFromString<MatchIllegalDto>(raw)
        assertEquals("m1", dto.matchId)
        assertEquals("no-such-match", dto.reason)
    }

    @Test
    fun `matchChat decodes a body-only message and an emote-only message`() {
        val bodyMsg = json.decodeFromString<MatchChatDto>(
            """{"matchId":"m1","from":"u1","color":"red","body":"gg","emote":null,"at":1731000000000}"""
        )
        assertEquals("gg", bodyMsg.body)
        assertNull(bodyMsg.emote)

        val emoteMsg = json.decodeFromString<MatchChatDto>(
            """{"matchId":"m1","from":"u2","color":"blue","body":null,"emote":"👍","at":1731000001000}"""
        )
        assertNull(emoteMsg.body)
        assertEquals("👍", emoteMsg.emote)
    }

    @Test
    fun `spectateCount decodes viewer count`() {
        val dto = json.decodeFromString<SpectateCountDto>("""{"matchId":"m1","viewers":7}""")
        assertEquals(7, dto.viewers)
    }

    @Test
    fun `rematchReady decodes matchId and yourColor for the new match`() {
        val dto = json.decodeFromString<RematchReadyDto>("""{"matchId":"m2","yourColor":"blue"}""")
        assertEquals("m2", dto.matchId)
        assertEquals("blue", dto.yourColor)
    }

    @Test
    fun `request DTOs encode field-for-field matching the server contract`() {
        val mmJoin = json.encodeToString(MmJoinRequest.serializer(), MmJoinRequest(mode = "RANKED", colorPref = "either"))
        assertTrue(mmJoin.contains("\"mode\":\"RANKED\""))
        assertTrue(mmJoin.contains("\"colorPref\":\"either\""))

        val move = MatchMoveRequest(
            matchId = "m1",
            move = Move(from = Square(5, 2), path = listOf(Square(3, 4)), captures = listOf(Square(4, 3)), promotion = false)
        )
        val moveJson = json.encodeToString(MatchMoveRequest.serializer(), move)
        assertTrue(moveJson.contains("\"matchId\":\"m1\""))
        assertTrue(moveJson.contains("\"captures\""))

        val chat = json.encodeToString(MatchChatRequest.serializer(), MatchChatRequest(matchId = "m1", emote = "🔥"))
        assertTrue(chat.contains("\"emote\":\"🔥\""))
    }
}
