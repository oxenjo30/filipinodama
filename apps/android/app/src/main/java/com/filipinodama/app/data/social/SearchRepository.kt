package com.filipinodama.app.data.social

import com.filipinodama.app.data.ApiClient
import com.filipinodama.app.data.ApiEnvelope

/**
 * SearchRepository — backs the Global Player Search screen (mockup
 * `{{ gsOpen }}`, the destination for Home's magnifier icon). This was a
 * confirmed real gap: the search icon was previously wired to a literal
 * no-op (`onOpenSearch = { /* later phase, no destination yet */ }`), even
 * though the server's GET /api/users/search already backs the web client's
 * equivalent modal. See mobile UI-fidelity sweep, Screen: Global Player Search.
 */
object SearchRepository {

    private val api: SearchApi by lazy { ApiClient.create<SearchApi>() }

    suspend fun searchUsers(query: String): SocialResult<UserSearchResponse> =
        call { api.searchUsers(query) }

    private suspend fun <T> call(block: suspend () -> ApiEnvelope<T>): SocialResult<T> {
        return try {
            val envelope = block()
            if (envelope.ok && envelope.data != null) {
                SocialResult.Success(envelope.data)
            } else {
                val error = envelope.error
                SocialResult.Failure(error?.code ?: "UNKNOWN", error?.message ?: "Something went wrong. Please try again.")
            }
        } catch (e: Exception) {
            SocialResult.Failure("NETWORK_ERROR", "Couldn't reach the server. Check your connection and try again.")
        }
    }
}
