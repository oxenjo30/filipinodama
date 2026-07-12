package com.filipinodama.app.data.rooms

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Serialization round-trip tests for room/spectate DTOs, using REAL payload
 * JSON shapes verified against apps/server/src/realtime/rooms.ts and
 * apps/server/src/modules/matches.ts (GET /matches/live) during Phase 4
 * research.
 */
class RoomDtoSerializationTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    @Test
    fun `roomStart decodes a player color and a spectator null color`() {
        val player = json.decodeFromString<RoomStartDto>("""{"matchId":"m1","yourColor":"red"}""")
        assertEquals("red", player.yourColor)

        val spectator = json.decodeFromString<RoomStartDto>("""{"matchId":"m1","yourColor":null}""")
        assertNull(spectator.yourColor)
    }

    @Test
    fun `roomChat relay decodes from, body and at exactly as the server emits it`() {
        val raw = """{"from":{"userId":"u1","name":"Kap","avatarUrl":null,"tag":"#0001"},"body":"gg","at":1731000000000}"""
        val dto = json.decodeFromString<RoomChatDto>(raw)
        assertEquals("Kap", dto.from.name)
        assertEquals("gg", dto.body)
        assertEquals(1731000000000L, dto.at)
    }

    @Test
    fun `request DTOs encode field-for-field matching the server contract`() {
        val create = json.encodeToString(RoomCreateRequest.serializer(), RoomCreateRequest(mode = "RANKED"))
        assertTrue(create.contains("\"mode\":\"RANKED\""))

        val code = json.encodeToString(RoomCodeRequest.serializer(), RoomCodeRequest("abc123"))
        assertTrue(code.contains("\"code\":\"abc123\""))

        val chat = json.encodeToString(RoomChatRequest.serializer(), RoomChatRequest("hello"))
        assertTrue(chat.contains("\"body\":\"hello\""))

        val user = json.encodeToString(RoomUserRequest.serializer(), RoomUserRequest("u9"))
        assertTrue(user.contains("\"userId\":\"u9\""))
    }

    @Test
    fun `roomsMine decodes a present code and a null code (no active room)`() {
        val present = json.decodeFromString<RoomsMineResponse>("""{"code":"ABC123"}""")
        assertEquals("ABC123", present.code)

        val absent = json.decodeFromString<RoomsMineResponse>("""{"code":null}""")
        assertNull(absent.code)
    }

    @Test
    fun `liveMatches decodes a plain match item and a synthetic room item in the same array`() {
        val raw = """
            {"items":[
              {"id":"room-ABC123","room":true,"code":"ABC123","mode":"PRIVATE",
               "red":{"id":"u1","username":"kap","displayName":"Kap","tag":"#0001","avatarUrl":null,"trophies":1200},
               "blue":{"id":"u2","username":"ermi","displayName":"Ermi","tag":"#0002","avatarUrl":null,"trophies":1100},
               "moveCount":4,"startedAt":"2026-07-01T00:00:00.000Z","viewers":3},
              {"id":"m2","mode":"RANKED",
               "red":{"id":"u3","username":"tan","displayName":"Tan","tag":"#0003","avatarUrl":null,"trophies":1500},
               "blue":{"id":"u4","username":"bay","displayName":"Bay","tag":"#0004","avatarUrl":null,"trophies":1480},
               "moveCount":12,"startedAt":"2026-07-01T00:05:00.000Z","viewers":0}
            ],"liveCount":2}
        """.trimIndent()

        val dto = json.decodeFromString<LiveMatchesResponse>(raw)

        assertEquals(2, dto.liveCount)
        assertEquals(2, dto.items.size)

        val roomItem = dto.items[0]
        assertTrue(roomItem.room)
        assertEquals("ABC123", roomItem.code)
        assertEquals(3, roomItem.viewers)

        val matchItem = dto.items[1]
        assertTrue(!matchItem.room)
        assertNull(matchItem.code)
        assertEquals(0, matchItem.viewers) // 0 viewers is a legitimate real value, never omitted
        assertEquals("Tan", matchItem.red?.displayName)
    }

    @Test
    fun `liveMatches decodes an empty items array (no live matches right now)`() {
        val dto = json.decodeFromString<LiveMatchesResponse>("""{"items":[],"liveCount":0}""")
        assertTrue(dto.items.isEmpty())
        assertEquals(0, dto.liveCount)
    }
}
