package com.filipinodama.app.data.leaderboard

import com.filipinodama.app.data.ApiEnvelope
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * DTO round-trip tests for GET /api/leaderboard, verified against the real
 * server response shape (leaderboard.ts toRow()/querySchema) for all three
 * scopes.
 */
class LeaderboardDtoSerializationTest {

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `LeaderboardResponse decodes a real global-scope payload with podium + me`() {
        val raw = """
            {
              "scope": "global",
              "season": null,
              "rows": [
                {"rank":1,"userId":"u1","username":"a","displayName":"Alpha","tag":"#AAAA","avatarUrl":"sultan","frameId":"jade-dragon","countryCode":"PH","trophies":1800,"wins":90,"losses":10,"streak":5,"rankTier":{"key":"alamat","label":"Alamat","sub":"Legend","accent":"#ff5d73","img":"tier-alamat"}},
                {"rank":2,"userId":"u2","username":"b","displayName":"Beta","tag":"#BBBB","avatarUrl":null,"frameId":null,"countryCode":null,"trophies":1500,"wins":50,"losses":20,"streak":0,"rankTier":{"key":"star-guardian","label":"Star Guardian","sub":"Ascendant","accent":"#a06bff","img":"tier-star-guardian"}}
              ],
              "me": {"rank":2,"userId":"u2","username":"b","displayName":"Beta","tag":"#BBBB","avatarUrl":null,"frameId":null,"countryCode":null,"trophies":1500,"wins":50,"losses":20,"streak":0,"rankTier":{"key":"star-guardian","label":"Star Guardian","sub":"Ascendant","accent":"#a06bff","img":"tier-star-guardian"}}
            }
        """.trimIndent()

        val decoded = json.decodeFromString(LeaderboardResponse.serializer(), raw)
        assertEquals("global", decoded.scope)
        assertNull(decoded.season)
        assertEquals(2, decoded.rows.size)
        assertEquals(1, decoded.rows[0].rank)
        assertEquals("Alamat", decoded.rows[0].rankTier.label)
        assertEquals("u2", decoded.me?.userId)

        val reencoded = json.encodeToString(LeaderboardResponse.serializer(), decoded)
        val redecoded = json.decodeFromString(LeaderboardResponse.serializer(), reencoded)
        assertEquals(decoded, redecoded)
    }

    @Test
    fun `LeaderboardResponse decodes an empty guild-scope response (not-in-a-guild honest empty)`() {
        val raw = """{"scope":"guild","season":null,"rows":[],"me":null}"""
        val decoded = json.decodeFromString(LeaderboardResponse.serializer(), raw)
        assertEquals("guild", decoded.scope)
        assertTrue(decoded.rows.isEmpty())
        assertNull(decoded.me)
    }

    @Test
    fun `LeaderboardResponse decodes a friends-scope response with a season id echoed back`() {
        val raw = """
            {"scope":"friends","season":"season-1","rows":[
              {"rank":1,"userId":"u1","username":"a","displayName":"Alpha","tag":"#AAAA","avatarUrl":null,"frameId":null,"countryCode":null,"trophies":900,"wins":10,"losses":5,"streak":1,"rankTier":{"key":"bayani","label":"Bayani","sub":"Champion","accent":"#e8b84b","img":"tier-bayani"}}
            ],"me":null}
        """.trimIndent()
        val decoded = json.decodeFromString(LeaderboardResponse.serializer(), raw)
        assertEquals("friends", decoded.scope)
        assertEquals("season-1", decoded.season)
        assertEquals(1, decoded.rows.size)
    }

    @Test
    fun `ApiEnvelope wraps LeaderboardResponse the same way every other envelope does`() {
        val raw = """{"ok":true,"data":{"scope":"global","season":null,"rows":[],"me":null}}"""
        val decoded = json.decodeFromString(ApiEnvelope.serializer(LeaderboardResponse.serializer()), raw)
        assertTrue(decoded.ok)
        assertEquals("global", decoded.data?.scope)
    }

    @Test
    fun `a friends-guild-scope 401 decodes as a normal error envelope, not a crash`() {
        val raw = """{"ok":false,"error":{"code":"UNAUTHORIZED","message":"Sign in required"}}"""
        val decoded = json.decodeFromString(ApiEnvelope.serializer(LeaderboardResponse.serializer()), raw)
        assertEquals(false, decoded.ok)
        assertEquals("UNAUTHORIZED", decoded.error?.code)
    }
}
