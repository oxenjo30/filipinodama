package com.filipinodama.app.data

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.filipinodama.app.BuildConfig
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException

/**
 * Native "Sign in with Google" via Credential Manager — the on-device
 * equivalent of the web client's redirect-to-Google-consent flow
 * (apps/web/src/features/auth/AuthPage.tsx `startOAuth("google")`).
 *
 * Unlike web (server-side authorization-code exchange), Credential Manager
 * hands the app a Google-signed ID token directly; that token is POSTed to
 * POST /api/auth/oauth/google/token, which verifies it server-side and
 * reuses the exact same find-or-create-user logic as the web OAuth
 * callback (see AuthRepository.googleSignIn / apps/server/src/auth/oauth.ts
 * verifyGoogleIdToken + findOrCreateOAuthUser).
 *
 * The server client ID MUST be the WEB OAuth client ID — the same one the
 * server's GOOGLE_CLIENT_ID env var already validates token audience
 * against — NOT a separate Android-specific client ID. Per the owner's
 * shared-credentials directive (web and mobile share API credentials, no
 * mobile-specific keys/config), this is now resolved from the SERVER at
 * runtime via GET /api/auth/providers' `googleClientId` field
 * (AuthRepository.providers), not from Android-side BuildConfig — see
 * [resolveClientId]. `BuildConfig.GOOGLE_SERVER_CLIENT_ID` survives only as
 * a local-dev override for pointing a debug build at a different client ID
 * than whatever the server currently returns; it is never required.
 *
 * See apps/android/README.md for the required Google Cloud Console step (an
 * ANDROID OAuth client registered with this app's package name + debug
 * SHA-1, in the SAME Google Cloud project as the web client) that this
 * depends on; until that registration exists, credential retrieval below
 * fails on-device even though this code path is fully wired.
 */
object GoogleSignInHelper {

    /** Result of attempting to retrieve a Google ID token via Credential Manager. */
    sealed class Result {
        data class Success(val idToken: String) : Result()
        data class Failure(val message: String) : Result()
        /** User dismissed the account picker — not an error, show no banner. */
        data object Cancelled : Result()
    }

    /**
     * Resolves which Google OAuth client ID to hand Credential Manager, or
     * null if none is available. Resolution order:
     *  1. `serverClientId` (the server's `providers.googleClientId`, from GET
     *     /api/auth/providers) — the shared web/server credential, per the
     *     owner's directive that web and mobile must never carry separate
     *     keys.
     *  2. `localOverride` ([BuildConfig.GOOGLE_SERVER_CLIENT_ID]) ONLY when
     *     the server value is null/blank AND the override is non-blank —
     *     keeps a local-dev override possible (e.g. pointing at a different
     *     client ID than whatever a shared dev server currently returns)
     *     without it ever being required for normal operation.
     *  3. null — "not configured" is the honest state; never fabricate a
     *     value.
     *
     * `localOverride` is a parameter (rather than reading [BuildConfig]
     * directly) so this stays a pure function callable from a plain JVM unit
     * test without a build-variant-specific BuildConfig value in play.
     */
    fun resolveClientId(serverClientId: String?, localOverride: String = BuildConfig.GOOGLE_SERVER_CLIENT_ID): String? {
        if (!serverClientId.isNullOrBlank()) return serverClientId
        if (localOverride.isNotBlank()) return localOverride
        return null
    }

    /**
     * Launches the Credential Manager bottom sheet and resolves to the
     * Google ID token, or an honest failure message — never a fabricated
     * success. Distinguishes a user-cancelled picker ([Result.Cancelled], no
     * error banner needed) from a genuine "no Google account on this device"
     * / "not configured" failure (surfaced to the caller like any other auth
     * error, per the web's "surface the real error, never invent copy" rule).
     *
     * `serverClientId` is the caller's current best-known value of
     * `providers.googleClientId` (AuthRepository.providers) — the caller is
     * responsible for having refreshed providers if stale/absent before
     * invoking this, same as it already does for the `providers.google` gate.
     */
    suspend fun requestIdToken(context: Context, serverClientId: String?): Result {
        val clientId = resolveClientId(serverClientId)
        if (clientId == null) {
            return Result.Failure(
                "Google sign-in is not configured yet. See apps/android/README.md."
            )
        }

        val googleIdOption = GetGoogleIdOption.Builder()
            .setFilterByAuthorizedAccounts(false)
            .setServerClientId(clientId)
            .setAutoSelectEnabled(false)
            .build()

        val request = GetCredentialRequest.Builder()
            .addCredentialOption(googleIdOption)
            .build()

        return try {
            val credentialManager = CredentialManager.create(context)
            val response = credentialManager.getCredential(context, request)
            val credential = response.credential
            if (credential is CustomCredential &&
                credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
            ) {
                val googleIdTokenCredential = GoogleIdTokenCredential.createFrom(credential.data)
                Result.Success(googleIdTokenCredential.idToken)
            } else {
                Result.Failure("Google did not return a usable credential. Please try again.")
            }
        } catch (e: GetCredentialCancellationException) {
            Result.Cancelled
        } catch (e: NoCredentialException) {
            Result.Failure("No Google account is available on this device. Add one in Settings and try again.")
        } catch (e: GetCredentialException) {
            Result.Failure(e.message ?: "Google sign-in failed. Please try again.")
        } catch (e: GoogleIdTokenParsingException) {
            Result.Failure("Google returned an unreadable credential. Please try again.")
        }
    }
}
