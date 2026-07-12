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
 * `serverClientId` MUST be the WEB OAuth client ID — the same one the
 * server's GOOGLE_CLIENT_ID env var already validates token audience
 * against — NOT a separate Android-specific client ID. See
 * apps/android/README.md for the required Google Cloud Console step (an
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
     * Launches the Credential Manager bottom sheet and resolves to the
     * Google ID token, or an honest failure message — never a fabricated
     * success. Distinguishes a user-cancelled picker ([Result.Cancelled], no
     * error banner needed) from a genuine "no Google account on this device"
     * / "not configured" failure (surfaced to the caller like any other auth
     * error, per the web's "surface the real error, never invent copy" rule).
     */
    suspend fun requestIdToken(context: Context): Result {
        if (BuildConfig.GOOGLE_SERVER_CLIENT_ID.isBlank()) {
            return Result.Failure(
                "Google sign-in is not configured yet. See apps/android/README.md."
            )
        }

        val googleIdOption = GetGoogleIdOption.Builder()
            .setFilterByAuthorizedAccounts(false)
            .setServerClientId(BuildConfig.GOOGLE_SERVER_CLIENT_ID)
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
