package com.filipinodama.app.data.social

import com.filipinodama.app.data.apiErrorFrom

import com.filipinodama.app.data.ApiClient
import com.filipinodama.app.data.ApiEnvelope

/**
 * FriendsRepository — server-authoritative client for Friends (Phase 6b),
 * matching this scaffold's singleton-object convention (see
 * [com.filipinodama.app.data.profile.ProfileRepository]). Plain REST; live
 * online/offline state is owned separately by [PresenceRepository].
 */
object FriendsRepository {

    private val api: FriendsApi by lazy { ApiClient.create<FriendsApi>() }

    suspend fun friends(): SocialResult<FriendsResponse> = call { api.friends() }

    suspend fun requests(): SocialResult<FriendRequestsResponse> = call { api.requests() }

    suspend fun suggested(): SocialResult<SuggestedFriendsResponse> = call { api.suggested() }

    suspend fun sendRequest(toUserId: String): SocialResult<FriendActionStatusResponse> =
        call { api.sendRequest(SendFriendRequestBody(toUserId)) }

    suspend fun sendRequestByTag(tag: String): SocialResult<FriendActionStatusResponse> =
        call { api.sendRequestByTag(SendFriendRequestByTagBody(tag)) }

    suspend fun acceptRequest(requestId: String): SocialResult<FriendActionStatusResponse> =
        call { api.acceptRequest(requestId) }

    suspend fun declineRequest(requestId: String): SocialResult<FriendActionStatusResponse> =
        call { api.declineRequest(requestId) }

    suspend fun removeFriend(userId: String): SocialResult<FriendRemovedResponse> =
        call { api.removeFriend(userId) }

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
            // Surface the server's real 4xx error (validation, permission, etc.)
            // instead of a misleading network message; only true transport
            // failures (no HTTP response) fall back to NETWORK_ERROR.
            val apiError = apiErrorFrom(e)
            if (apiError != null) SocialResult.Failure(apiError.code, apiError.message)
            else SocialResult.Failure("NETWORK_ERROR", "Couldn't reach the server. Check your connection and try again.")
        }
    }
}

/** Outcome of a single social (friends/dm/guild/notif/report) call — carries the server's own message on failure. */
sealed class SocialResult<out T> {
    data class Success<T>(val data: T) : SocialResult<T>()
    data class Failure(val code: String, val message: String) : SocialResult<Nothing>()
}
