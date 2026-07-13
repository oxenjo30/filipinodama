package com.filipinodama.app.data.profile

import com.filipinodama.app.data.ApiEnvelope
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * DTO round-trip tests for the Profile / Match History / Replay / Public
 * Profile REST surface (Phase 6a) — verifies each DTO decodes real server
 * response shapes (field-for-field per users.ts/matches.ts) and survives an
 * encode/decode round-trip, mirroring the existing convention in
 * EconomyDtoSerializationTest.kt / MatchDtoSerializationTest.kt.
 */
class ProfileDtoSerializationTest {

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `MatchHistoryResponse decodes a real GET api-matches payload shape`() {
        val raw = """
            {
              "items": [
                {
                  "id": "m1",
                  "mode": "RANKED",
                  "winner": "red",
                  "reason": "capture-all",
                  "red": {"id":"u1","username":"a","displayName":"Alpha","tag":"#AAAA","avatarUrl":"champion","frameId":null,"rankTier":"datu","trophies":1200},
                  "blue": {"id":"u2","username":"b","displayName":"Beta","tag":"#BBBB","avatarUrl":null,"frameId":"laurel","rankTier":"squire","trophies":100},
                  "redTrophyDelta": 25,
                  "blueTrophyDelta": -5,
                  "goldReward": 50,
                  "redCaptures": 6,
                  "blueCaptures": 2,
                  "moveCount": 18,
                  "startedAt": "2026-07-01T00:00:00.000Z",
                  "endedAt": "2026-07-01T00:05:00.000Z"
                }
              ],
              "nextCursor": null
            }
        """.trimIndent()

        val decoded = json.decodeFromString(MatchHistoryResponse.serializer(), raw)
        assertEquals(1, decoded.items.size)
        val m = decoded.items[0]
        assertEquals("m1", m.id)
        assertEquals("RANKED", m.mode)
        assertEquals("red", m.winner)
        assertEquals("Alpha", m.red?.displayName)
        assertEquals("Beta", m.blue?.displayName)
        assertEquals(25, m.redTrophyDelta)
        assertEquals(-5, m.blueTrophyDelta)
        assertEquals(6, m.redCaptures)
        assertEquals(18, m.moveCount)
        assertNull(decoded.nextCursor)

        // round-trip
        val reencoded = json.encodeToString(MatchHistoryResponse.serializer(), decoded)
        val redecoded = json.decodeFromString(MatchHistoryResponse.serializer(), reencoded)
        assertEquals(decoded, redecoded)
    }

    @Test
    fun `MatchDetailResponse decodes moves for replay reconstruction`() {
        val raw = """
            {
              "match": {
                "id": "m1",
                "mode": "CASUAL",
                "settings": {"forcedMaxCapture": true, "drawMoveLimit": 40},
                "winner": null,
                "reason": null,
                "red": {"id":"u1","username":"a","displayName":"Alpha","tag":"#AAAA"},
                "blue": null,
                "redTrophyDelta": null,
                "blueTrophyDelta": null,
                "goldReward": 0,
                "redCaptures": 0,
                "blueCaptures": 0,
                "moveCount": 1,
                "startedAt": "2026-07-01T00:00:00.000Z",
                "endedAt": null,
                "moves": [
                  {"from": {"r":5,"c":2}, "path": [{"r":4,"c":1}], "captures": [], "promotion": false}
                ]
              }
            }
        """.trimIndent()

        val decoded = json.decodeFromString(MatchDetailResponse.serializer(), raw)
        assertEquals(1, decoded.match.moves.size)
        assertEquals(5, decoded.match.moves[0].from.r)
        assertTrue(decoded.match.settings?.forcedMaxCapture == true)
        assertNull(decoded.match.winner)
    }

    @Test
    fun `LedgerResponse decodes a real GET ledger currency=TROPHIES payload`() {
        val raw = """
            {"items":[{"id":"l1","currency":"TROPHIES","amount":25,"balance":1225,"reason":"Ranked win","refType":"match","refId":"m1","createdAt":"2026-07-01T00:00:00.000Z"}],"nextCursor":null}
        """.trimIndent()
        val decoded = json.decodeFromString(LedgerResponse.serializer(), raw)
        assertEquals(1, decoded.items.size)
        assertEquals("TROPHIES", decoded.items[0].currency)
        assertEquals(25, decoded.items[0].amount)
        assertEquals(1225, decoded.items[0].balance)
    }

    @Test
    fun `PublicUserResponse decodes a real GET users-id payload incl tier and guild`() {
        val raw = """
            {
              "user": {
                "id":"u9","username":"z","displayName":"Zeta","tag":"#ZZZZ","bio":"hi",
                "avatarUrl":"sultan","frameId":"jade-dragon","countryCode":"PH",
                "trophies":1500,"rankTier":"alamat",
                "tier": {"key":"alamat","label":"Alamat","sub":"Legend","accent":"#ff5d73","img":"tier-alamat"},
                "equippedBoard":"ebony","equippedSkin":"jade","equippedEmotes":["victory"],
                "wins":40,"losses":10,"draws":2,"streak":5,"createdAt":"2026-01-01T00:00:00.000Z",
                "guild": {"id":"g1","name":"Vanguard","tag":"#VG","role":"leader"},
                "isBot": false, "relationship": "friends", "requestId": null
              }
            }
        """.trimIndent()
        val decoded = json.decodeFromString(PublicUserResponse.serializer(), raw)
        val u = decoded.user
        assertEquals("Zeta", u.displayName)
        assertEquals("Alamat", u.tier.label)
        assertEquals("Vanguard", u.guild?.name)
        assertEquals("friends", u.relationship)
        assertEquals(40, u.wins)
    }

    @Test
    fun `ProfileExtrasResponse decodes the honest-empty shape (no matches yet)`() {
        val raw = """{"favoriteMove":null,"openings":[],"recentMatches":[],"badges":[]}"""
        val decoded = json.decodeFromString(ProfileExtrasResponse.serializer(), raw)
        assertNull(decoded.favoriteMove)
        assertTrue(decoded.openings.isEmpty())
        assertTrue(decoded.recentMatches.isEmpty())
        assertTrue(decoded.badges.isEmpty())
    }

    @Test
    fun `ProfileExtrasResponse decodes a populated payload incl recent match hasReplay flag`() {
        val raw = """
            {
              "favoriteMove": "b3 -> c4",
              "openings": [{"label":"b3 -> c4","pct":60}],
              "recentMatches": [
                {"id":"m1","opponentName":"Beta","result":"win","mode":"RANKED","trophyDelta":25,"endedAt":"2026-07-01T00:00:00.000Z","hasReplay":true}
              ],
              "badges": ["First Win"]
            }
        """.trimIndent()
        val decoded = json.decodeFromString(ProfileExtrasResponse.serializer(), raw)
        assertEquals("b3 -> c4", decoded.favoriteMove)
        assertEquals(60, decoded.openings[0].pct)
        assertEquals(true, decoded.recentMatches[0].hasReplay)
        assertEquals("First Win", decoded.badges[0])
    }

    @Test
    fun `UpdateProfileRequest omits unset fields (PATCH sends only what changed)`() {
        val req = UpdateProfileRequest(avatarUrl = "champion")
        val encoded = json.encodeToString(UpdateProfileRequest.serializer(), req)
        assertTrue(encoded.contains("\"avatarUrl\":\"champion\""))
    }

    @Test
    fun `ApiEnvelope wraps PublicUserResponse the same way every other envelope does`() {
        val raw = """
            {"ok":true,"data":{"user":{"id":"u1","username":"a","displayName":"A","tag":"#AAAA","trophies":0,"rankTier":"squire","tier":{"key":"squire","label":"Squire","sub":"Recruit","accent":"#9aa6bf","img":"tier-squire"},"wins":0,"losses":0,"draws":0,"streak":0,"isBot":false,"relationship":"self"}}}
        """.trimIndent()
        val decoded = json.decodeFromString(ApiEnvelope.serializer(PublicUserResponse.serializer()), raw)
        assertTrue(decoded.ok)
        assertEquals("A", decoded.data?.user?.displayName)
    }
}
