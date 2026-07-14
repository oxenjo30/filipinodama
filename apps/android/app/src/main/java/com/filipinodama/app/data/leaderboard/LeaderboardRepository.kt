package com.filipinodama.app.data.leaderboard

import com.filipinodama.app.data.apiErrorFrom

import com.filipinodama.app.data.ApiClient
import com.filipinodama.app.data.ApiEnvelope

/**
 * LeaderboardRepository — server-authoritative client for GET /api/leaderboard,
 * matching this scaffold's singleton-object convention. All three scopes
 * (global/friends/guild) are real; see LeaderboardDtos.kt kdoc.
 */
object LeaderboardRepository {

    private val api: LeaderboardApi by lazy { ApiClient.create<LeaderboardApi>() }

    suspend fun leaderboard(scope: String, season: String? = null): LeaderboardResult<LeaderboardResponse> {
        return try {
            val envelope = api.leaderboard(scope = scope, season = season)
            if (envelope.ok && envelope.data != null) {
                LeaderboardResult.Success(envelope.data)
            } else {
                val error = envelope.error
                LeaderboardResult.Failure(error?.code ?: "UNKNOWN", error?.message ?: "Couldn't load the leaderboard. Try again shortly.")
            }
        } catch (e: Exception) {
            // Surface the server's real 4xx error (validation, permission, etc.)
            // instead of a misleading network message; only true transport
            // failures (no HTTP response) fall back to NETWORK_ERROR.
            val apiError = apiErrorFrom(e)
            if (apiError != null) LeaderboardResult.Failure(apiError.code, apiError.message)
            else LeaderboardResult.Failure("NETWORK_ERROR", "Couldn't reach the server. Check your connection and try again.")
        }
    }
}

sealed class LeaderboardResult<out T> {
    data class Success<T>(val data: T) : LeaderboardResult<T>()
    data class Failure(val code: String, val message: String) : LeaderboardResult<Nothing>()
}
