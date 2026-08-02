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

    // ── malformed payloads must be DROPPED, never fatal ──────────────────────
    //
    // presence:update is handled on socket.io's Engine.IO thread, so a throw out
    // of applyUpdate is an uncaught exception on a background thread — i.e. a
    // process crash, on every installed client, the moment the server reshapes
    // the payload. These fixtures are the shapes a server-side change would
    // plausibly produce; the assertion that matters in all of them is simply
    // that the call returns.

    @Test
    fun `a snapshot of objects instead of ids is dropped instead of crashing`() {
        // e.g. the server starts sending snapshot: [{id, status}] — the exact
        // change that used to throw IllegalArgumentException via jsonPrimitive.
        PresenceRepository.applyUpdate(parse("""{"snapshot":[{"id":"u1","status":"online"}],"at":1}"""))

        assertTrue("unreadable snapshot degrades to nobody online", PresenceRepository.online.value.isEmpty())
    }

    @Test
    fun `a snapshot mixing ids with junk keeps only the readable ids`() {
        PresenceRepository.applyUpdate(parse("""{"snapshot":["u1",{"id":"u2"},["u3"],null],"at":1}"""))

        assertEquals(setOf("u1"), PresenceRepository.online.value)
    }

    @Test
    fun `an object-shaped userId is ignored and leaves presence untouched`() {
        PresenceRepository.applyUpdate(parse("""{"snapshot":["u1"],"at":1}"""))
        PresenceRepository.applyUpdate(parse("""{"userId":{"id":"u1"},"status":"offline","at":2}"""))

        assertTrue("last known presence is retained", PresenceRepository.isOnline("u1"))
    }

    @Test
    fun `an object-shaped status is ignored`() {
        PresenceRepository.applyUpdate(parse("""{"snapshot":["u1"],"at":1}"""))
        PresenceRepository.applyUpdate(parse("""{"userId":"u2","status":{"state":"online"},"at":2}"""))

        assertEquals(setOf("u1"), PresenceRepository.online.value)
    }

    @Test
    fun `a null userId is not tracked as a user literally named null`() {
        // JsonNull IS a JsonPrimitive whose content is the string "null", so a
        // bare safe-cast without the explicit null check would add "null" here.
        PresenceRepository.applyUpdate(parse("""{"userId":null,"status":"online","at":1}"""))

        assertFalse(PresenceRepository.isOnline("null"))
        assertTrue(PresenceRepository.online.value.isEmpty())
    }

    @Test
    fun `a payload with neither snapshot nor userId is a no-op`() {
        PresenceRepository.applyUpdate(parse("""{"snapshot":["u1"],"at":1}"""))
        PresenceRepository.applyUpdate(parse("""{"at":2}"""))

        assertEquals(setOf("u1"), PresenceRepository.online.value)
    }
}
