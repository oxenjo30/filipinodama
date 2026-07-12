package com.filipinodama.app.data

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * ApiEnvelope parsing — the server's standard `{ ok, data }` / `{ ok, error }`
 * response shape (apps/server/src/lib/errors.ts `ok()` / `fail()`). Covers
 * both the success and error branches, plus the real `AuthUser` /
 * `MeResponse` shapes used by the auth shell.
 */
class ApiEnvelopeTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    @Test
    fun `parses a success envelope with AuthUser data`() {
        val raw = """
            {"ok":true,"data":{"user":{"id":"u1","email":"a@b.com","emailVerified":true,"isGuest":false,"username":"rico","displayName":"Rico","tag":"#1234","trophies":1340,"gold":500,"diamonds":10,"rankTier":"DATU_III"}}}
        """.trimIndent()

        val envelope = json.decodeFromString<ApiEnvelope<MeResponse>>(raw)

        assertTrue(envelope.ok)
        assertNull(envelope.error)
        val user = envelope.data?.user
        assertEquals("u1", user?.id)
        assertEquals("rico", user?.username)
        assertEquals(1340, user?.trophies)
        assertFalse(user?.isGuest ?: true)
    }

    @Test
    fun `parses a success envelope with null user (logged out)`() {
        val raw = """{"ok":true,"data":{"user":null}}"""

        val envelope = json.decodeFromString<ApiEnvelope<MeResponse>>(raw)

        assertTrue(envelope.ok)
        assertNull(envelope.data?.user)
    }

    @Test
    fun `parses an error envelope`() {
        val raw = """{"ok":false,"error":{"code":"INVALID_CREDENTIALS","message":"Incorrect email or password."}}"""

        val envelope = json.decodeFromString<ApiEnvelope<MeResponse>>(raw)

        assertFalse(envelope.ok)
        assertNull(envelope.data)
        assertEquals("INVALID_CREDENTIALS", envelope.error?.code)
        assertEquals("Incorrect email or password.", envelope.error?.message)
    }

    @Test
    fun `unknown extra fields on AuthUser are ignored`() {
        val raw = """
            {"ok":true,"data":{"user":{"id":"u1","username":"rico","displayName":"Rico","tag":"#1234","equippedBoard":"ebony","wins":10,"losses":2}}}
        """.trimIndent()

        val envelope = json.decodeFromString<ApiEnvelope<MeResponse>>(raw)

        assertTrue(envelope.ok)
        assertEquals("u1", envelope.data?.user?.id)
    }

    @Test
    fun `RegisterResponse parses needsVerification and emailConfigured flags`() {
        val raw = """
            {"ok":true,"data":{"user":{"id":"u2","username":"newplayer","displayName":"newplayer","tag":"#5678"},"needsVerification":true,"emailConfigured":true}}
        """.trimIndent()

        val envelope = json.decodeFromString<ApiEnvelope<RegisterResponse>>(raw)

        assertTrue(envelope.ok)
        assertTrue(envelope.data?.needsVerification == true)
        assertTrue(envelope.data?.emailConfigured == true)
        assertEquals("newplayer", envelope.data?.user?.username)
    }

    @Test
    fun `ForgotPasswordResponse always reports sent true`() {
        val raw = """{"ok":true,"data":{"sent":true}}"""

        val envelope = json.decodeFromString<ApiEnvelope<ForgotPasswordResponse>>(raw)

        assertTrue(envelope.ok)
        assertTrue(envelope.data?.sent == true)
    }
}
