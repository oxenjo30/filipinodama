package com.filipinodama.app.ui.screens.auth

import com.filipinodama.app.data.AuthResult
import com.filipinodama.app.data.GoogleSignInHelper
import com.filipinodama.app.data.ProvidersResponse

/**
 * Pure decision logic for the Google Sign-In button's gating + outcome
 * handling, extracted from LoginScreen/CreateAccountScreen so the state
 * machine is unit-testable without Robolectric (this project's Phase 2
 * convention — see AuthRepositoryLogicTest.kt's header comment).
 *
 * Two independent decisions:
 *  1. [googleButtonEnabled] — is the button clickable at all? Mirrors
 *     AuthPage.tsx's `disabled={!googleOn}` (providers.google), extended for
 *     Android's runtime client-ID resolution (see
 *     GoogleSignInHelper.resolveClientId): the button must ALSO have a
 *     resolvable client ID, since a feature that's "on" server-side but
 *     whose client ID we can't resolve (server null + no BuildConfig
 *     fallback) still can't actually launch Credential Manager. web has no
 *     equivalent second condition because it never needs a client ID
 *     client-side (server-side redirect flow).
 *  2. [resolveGoogleSignInOutcome] — given what Credential Manager returned
 *     and (if it returned a token) what the server said, what should the
 *     screen show/do? Three terminal states: silently do nothing (user
 *     cancelled the picker — matches how a user backing out of the web's
 *     Google consent screen just returns to /login with no error banner),
 *     show an error, or treat as a successful sign-in.
 */

/**
 * Mirrors AuthPage.tsx's `const googleOn = providers.google` gate, extended
 * with the Android-only requirement that a client ID actually be
 * resolvable (see GoogleSignInHelper.resolveClientId) — busy/loading state
 * is handled separately by the screen, same as every other button there.
 */
fun googleButtonEnabled(providers: ProvidersResponse): Boolean =
    providers.google && GoogleSignInHelper.resolveClientId(providers.googleClientId) != null

sealed class GoogleSignInOutcome {
    data class SignedIn(val user: com.filipinodama.app.data.AuthUser?) : GoogleSignInOutcome()
    data class Error(val message: String) : GoogleSignInOutcome()
    /** User dismissed the Credential Manager picker — no error, no navigation. */
    data object Cancelled : GoogleSignInOutcome()
}

/**
 * Step 1 of the flow: interpret what Credential Manager gave back. Only a
 * [GoogleSignInHelper.Result.Success] needs a further server round-trip
 * (handled by the caller); Failure/Cancelled are already terminal.
 */
fun resolveCredentialResult(result: GoogleSignInHelper.Result): GoogleSignInOutcome? = when (result) {
    is GoogleSignInHelper.Result.Cancelled -> GoogleSignInOutcome.Cancelled
    is GoogleSignInHelper.Result.Failure -> GoogleSignInOutcome.Error(result.message)
    is GoogleSignInHelper.Result.Success -> null // caller must still exchange the token with the server
}

/** Step 2: interpret the server's response to POST /api/auth/oauth/google/token. */
fun resolveServerAuthResult(result: AuthResult): GoogleSignInOutcome = when (result) {
    is AuthResult.Success -> GoogleSignInOutcome.SignedIn(result.user)
    is AuthResult.Failure -> GoogleSignInOutcome.Error(result.message)
}
