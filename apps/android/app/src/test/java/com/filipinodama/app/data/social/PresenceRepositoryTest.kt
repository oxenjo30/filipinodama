package com.filipinodama.app.data.social

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * State-transition tests for [PresenceRepository.applyUpdate] — the pure
 * function mirroring apps/web/src/stores/presenceStore.ts's
 * `s.on(EV.presenceUpdate, onUpdate)` handler. Fixtures are real
 * presence:update JSON shapes verified against
 * apps/server/src/realtime/presence.ts (snapshot on presence:ping reply,
 * incremental {userId,status} on connect/disconnect).
 */
class PresenceRepositoryTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }
    private fun parse(raw: String) = json.parseToJsonElement(raw).jsonObject

    @After
    fun tearDown() {
        PresenceRepository.hardReset()
    }

    @Test
    fun `snapshot replaces the online set entirely`() {
        PresenceRepository.applyUpdate(parse("""{"snapshot":["u1","u2"],"at":123}"""))
        assertEquals(setOf("u1", "u2"), PresenceRepository.online.value)

        PresenceRepository.applyUpdate(parse("""{"snapshot":["u3"],"at":124}"""))
        assertEquals(setOf("u3"), PresenceRepository.online.value)
    }

    @Test
    fun `empty snapshot clears the online set`() {
        PresenceRepository.applyUpdate(parse("""{"snapshot":["u1"],"at":1}"""))
        assertTrue(PresenceRepository.isOnline("u1"))

        PresenceRepository.applyUpdate(parse("""{"snapshot":[],"at":2}"""))
        assertTrue(PresenceRepository.online.value.isEmpty())
    }

    @Test
    fun `incremental online adds the user without disturbing others`() {
        PresenceRepository.applyUpdate(parse("""{"snapshot":["u1"],"at":1}"""))
        PresenceRepository.applyUpdate(parse("""{"userId":"u2","status":"online","at":2}"""))

        assertTrue(PresenceRepository.isOnline("u1"))
        assertTrue(PresenceRepository.isOnline("u2"))
    }

    @Test
    fun `incremental offline removes only that user`() {
        PresenceRepository.applyUpdate(parse("""{"snapshot":["u1","u2"],"at":1}"""))
        PresenceRepository.applyUpdate(parse("""{"userId":"u1","status":"offline","at":2}"""))

        assertFalse(PresenceRepository.isOnline("u1"))
        assertTrue(PresenceRepository.isOnline("u2"))
    }

    @Test
    fun `offline for a user not currently online is a no-op`() {
        PresenceRepository.applyUpdate(parse("""{"snapshot":["u1"],"at":1}"""))
        PresenceRepository.applyUpdate(parse("""{"userId":"u9","status":"offline","at":2}"""))

        assertEquals(setOf("u1"), PresenceRepository.online.value)
    }
}
