package com.filipinodama.app.data

import com.filipinodama.app.ui.screens.SplashDestination
import com.filipinodama.app.ui.screens.resolveSplashDestination
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Unit tests for the pure onboarded/session-state decision logic used by
 * the auth shell:
 *  - [resolveSplashDestination] — where Splash routes to after the boot
 *    session probe (no session / session+onboarded / session+not-onboarded).
 *  - [unwrapEnvelope] / [throwableToAuthFailure] — the envelope-unwrapping
 *    + error-message-surfacing mechanism shared by every AuthRepository
 *    action (login/register/guest/forgotPassword).
 *
 * AuthRepository itself is a singleton object wired to ApiClient (real
 * Android Context / EncryptedSharedPreferences) and is exercised via these
 * extracted pure functions instead, since Robolectric is not part of this
 * project's dependency set (JVM-only unit tests per the Phase 2 task scope).
 */
class AuthRepositoryLogicTest {

    // ---- resolveSplashDestination ----

    // Launch NEVER routes to the login wall (owner policy: no auto-guest, no
    // forced login). An anonymous user (no session) browses freely, so routing
    // depends ONLY on the onboarded flag, never on hasUser.

    @Test
    fun `anonymous (no session) never routes to Auth — onboarded goes Home`() {
        assertEquals(SplashDestination.Home, resolveSplashDestination(hasUser = false, onboarded = true))
    }

    @Test
    fun `anonymous (no session) not-yet-onboarded routes to Onboarding, not Auth`() {
        assertEquals(SplashDestination.Onboarding, resolveSplashDestination(hasUser = false, onboarded = false))
    }

    @Test
    fun `signed-in plus onboarded routes to Home`() {
        assertEquals(SplashDestination.Home, resolveSplashDestination(hasUser = true, onboarded = true))
    }

    @Test
    fun `signed-in plus not-yet-onboarded routes to Onboarding`() {
        assertEquals(SplashDestination.Onboarding, resolveSplashDestination(hasUser = true, onboarded = false))
    }

    // ---- unwrapEnvelope ----

    @Test
    fun `unwrapEnvelope returns mapped data on ok envelope`() {
        val envelope = ApiEnvelope(ok = true, data = AuthUserResponse(user = sampleUser()))

        val user = unwrapEnvelope(envelope) { it.user }

        assertEquals("u1", user.id)
    }

    @Test
    fun `unwrapEnvelope throws AuthApiException carrying the server message on ok=false`() {
        val envelope = ApiEnvelope<AuthUserResponse>(
            ok = false,
            error = ApiError(code = "INVALID_CREDENTIALS", message = "Incorrect email or password.")
        )

        try {
            unwrapEnvelope(envelope) { it.user }
            org.junit.Assert.fail("expected AuthApiException")
        } catch (e: AuthApiException) {
            assertEquals("INVALID_CREDENTIALS", e.code)
            assertEquals("Incorrect email or password.", e.message)
        }
    }

    @Test
    fun `unwrapEnvelope throws with a fallback message when error is missing entirely`() {
        val envelope = ApiEnvelope<AuthUserResponse>(ok = false, error = null)

        try {
            unwrapEnvelope(envelope) { it.user }
            org.junit.Assert.fail("expected AuthApiException")
        } catch (e: AuthApiException) {
            assertEquals("UNKNOWN", e.code)
            assertEquals("Something went wrong. Please try again.", e.message)
        }
    }

    @Test
    fun `unwrapEnvelope throws when ok=true but data is null`() {
        val envelope = ApiEnvelope<AuthUserResponse>(ok = true, data = null)

        try {
            unwrapEnvelope(envelope) { it.user }
            org.junit.Assert.fail("expected AuthApiException")
        } catch (e: AuthApiException) {
            assertEquals("UNKNOWN", e.code)
        }
    }

    // ---- throwableToAuthFailure ----

    @Test
    fun `throwableToAuthFailure surfaces the real server error message, not invented copy`() {
        val failure = throwableToAuthFailure(AuthApiException("RATE_LIMITED", "Too many attempts. Try again in 5 minutes."))

        assertEquals("Too many attempts. Try again in 5 minutes.", failure.message)
    }

    @Test
    fun `throwableToAuthFailure falls back to a generic message for non-API exceptions`() {
        val failure = throwableToAuthFailure(java.io.IOException("Unable to resolve host"))

        assertEquals("Something went wrong. Please try again.", failure.message)
    }

    private fun sampleUser() = AuthUser(
        id = "u1",
        username = "rico",
        displayName = "Rico",
        tag = "#1234"
    )
}
