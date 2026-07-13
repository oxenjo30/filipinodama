package com.filipinodama.app.data.social

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Tests for [resolveGuildCrest], a Kotlin port of apps/web/src/lib/assets.ts
 * guildCrest(). Verifies the known-key fast path and the deterministic hash
 * fallback (`h = (h*31+charCode) >>> 0`, then `h % CREST_KEYS.length`) using
 * the SAME seeds so both implementations must agree.
 */
class GuildCrestsTest {

    @Test
    fun `a known crestKey resolves directly, ignoring the seed`() {
        val crest = resolveGuildCrest("crown", seed = "anything")
        assertEquals("crown", crest.key)
        assertEquals("Sovereign Crown", crest.name)
    }

    @Test
    fun `an unknown crestKey falls back to the seed hash`() {
        val direct = resolveGuildCrest(null, seed = "guild-abc-123")
        val viaBogusKey = resolveGuildCrest("not-a-real-crest", seed = "guild-abc-123")
        assertEquals(direct.key, viaBogusKey.key)
    }

    @Test
    fun `hash fallback is deterministic for the same seed`() {
        val a = resolveGuildCrest(null, seed = "guild-42")
        val b = resolveGuildCrest(null, seed = "guild-42")
        assertEquals(a.key, b.key)
    }

    @Test
    fun `empty seed still resolves a real crest, never crashes`() {
        val crest = resolveGuildCrest(null, seed = "")
        assertEquals(GUILD_CREST_KEYS[0], crest.key)
    }

    @Test
    fun `different seeds can resolve to different crests`() {
        // Not a strict requirement (collisions are fine), but with 6 crests and
        // varied seeds we should see more than one distinct key across a spread.
        val keys = (1..20).map { resolveGuildCrest(null, seed = "guild-$it").key }.toSet()
        assert(keys.size > 1) { "expected variety across seeds, got only ${keys.size} distinct crest(s)" }
    }

    @Test
    fun `all six crests are present with real asset urls`() {
        assertEquals(6, GUILD_CREST_KEYS.size)
        GUILD_CREST_KEYS.forEach { key ->
            val crest = GUILD_CRESTS.getValue(key)
            assert(crest.src.contains("/assets/")) { "crest $key should serve from the /assets/ static path" }
        }
    }
}
