package com.filipinodama.app.ui.screens.auth

import com.filipinodama.app.data.AuthApiException
import com.filipinodama.app.data.AuthResult
import com.filipinodama.app.data.AuthUser
import com.filipinodama.app.data.GoogleSignInHelper
import com.filipinodama.app.data.ProvidersResponse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Unit tests for the Google Sign-In button's pure decision logic
 * (GoogleSignInFlow.kt), covering:
 *  - [googleButtonEnabled] — gated ONLY on providers.google, matching
 *    AuthPage.tsx's `disabled={!googleOn}` exactly.
 *  - [resolveCredentialResult] / [resolveServerAuthResult] — the two-step
 *    token-flow state machine (Credential Manager result -> optional server
 *    round-trip -> terminal UI outcome), covering the honest failure states
 *    called out in the task: cancelled picker (silent, no error banner),
 *    Credential Manager failure (real error surfaced), and server rejection
 *    (server's own message surfaced, never invented copy).
 */
class GoogleSignInFlowTest {

    // ---- googleButtonEnabled ----

    @Test
    fun `button enabled only when providers google is true`() {
        assertTrue(googleButtonEnabled(ProvidersResponse(google = true)))
        assertFalse(googleButtonEnabled(ProvidersResponse(google = false)))
    }

    @Test
    fun `button gating ignores every other provider flag`() {
        val allElseOn = ProvidersResponse(
            email = true, guest = true, google = false, facebook = true,
            emailDelivery = true, diamondTopUp = true
        )
        assertFalse(googleButtonEnabled(allElseOn))
    }

    // ---- resolveCredentialResult ----

    @Test
    fun `credential manager cancellation resolves to Cancelled (silent, no error)`() {
        val outcome = resolveCredentialResult(GoogleSignInHelper.Result.Cancelled)
        assertTrue(outcome is GoogleSignInOutcome.Cancelled)
    }

    @Test
    fun `credential manager failure resolves to Error carrying its real message`() {
        val outcome = resolveCredentialResult(
            GoogleSignInHelper.Result.Failure("No Google account is available on this device. Add one in Settings and try again.")
        )
        assertTrue(outcome is GoogleSignInOutcome.Error)
        assertEquals(
            "No Google account is available on this device. Add one in Settings and try again.",
            (outcome as GoogleSignInOutcome.Error).message
        )
    }

    @Test
    fun `credential manager success returns null — caller must still exchange the token with the server`() {
        val outcome = resolveCredentialResult(GoogleSignInHelper.Result.Success("fake-id-token"))
        assertNull(outcome)
    }

    // ---- resolveServerAuthResult ----

    @Test
    fun `server success resolves to SignedIn carrying the returned user`() {
        val user = sampleUser()
        val outcome = resolveServerAuthResult(AuthResult.Success(user))
        assertTrue(outcome is GoogleSignInOutcome.SignedIn)
        assertEquals(user, (outcome as GoogleSignInOutcome.SignedIn).user)
    }

    @Test
    fun `server rejection (wrong audience etc) surfaces the server's own message, never invented copy`() {
        val outcome = resolveServerAuthResult(AuthResult.Failure("This token was not issued for this app"))
        assertTrue(outcome is GoogleSignInOutcome.Error)
        assertEquals("This token was not issued for this app", (outcome as GoogleSignInOutcome.Error).message)
    }

    @Test
    fun `server outcome via unwrapEnvelope-style AuthApiException surfaces the exact server message`() {
        // Mirrors how AuthRepository.googleSignIn() converts a 401
        // OAUTH_AUDIENCE_MISMATCH / OAUTH_EMAIL_UNVERIFIED / 503 NOT_CONFIGURED
        // envelope into an AuthResult.Failure via throwableToAuthFailure().
        val failure = throwableToAuthFailureLocal(AuthApiException("OAUTH_EMAIL_UNVERIFIED", "Your Google email is not verified"))
        val outcome = resolveServerAuthResult(failure)
        assertEquals("Your Google email is not verified", (outcome as GoogleSignInOutcome.Error).message)
    }

    private fun throwableToAuthFailureLocal(t: Throwable) = com.filipinodama.app.data.throwableToAuthFailure(t)

    private fun sampleUser() = AuthUser(
        id = "u1",
        username = "rico",
        displayName = "Rico",
        tag = "#1234"
    )
}
