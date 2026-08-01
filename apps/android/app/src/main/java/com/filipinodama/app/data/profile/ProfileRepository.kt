package com.filipinodama.app.data.profile

import com.filipinodama.app.data.apiErrorFrom

import com.filipinodama.app.data.ApiClient
import com.filipinodama.app.data.ApiEnvelope
import com.filipinodama.app.data.AuthRepository

/**
 * ProfileRepository — server-authoritative client for Phase 6a's Profile /
 * Match History / Replay / Public Profile surfaces, matching this scaffold's
 * singleton-object convention (see [AuthRepository], [com.filipinodama.app.data.economy.EconomyRepository]).
 * Plain REST, no socket — each screen owns its own request state and calls
 * straight through to these suspend functions.
 *
 * On a successful own-profile edit we also patch [AuthRepository]'s cached
 * session user so every screen reading AuthRepository.state (Home identity
 * header, tab avatar, etc.) stays in sync without a full re-fetch.
 */
object ProfileRepository {

    private val api: ProfileApi by lazy { ApiClient.create<ProfileApi>() }

    suspend fun matches(
        userId: String,
        mode: String? = null,
        result: String? = null
    ): ProfileResult<MatchHistoryResponse> = call { api.matches(userId = userId, mode = mode, result = result) }

    /**
     * Persist a finished offline AI game so it counts toward the player's
     * "12W on Hard" record. Fire-and-forget from the caller's point of view:
     * a failure here must never block or interrupt the result screen, so the
     * result is returned but callers are free to ignore it.
     */
    suspend fun reportAiMatch(
        difficulty: String,
        winner: String?,
        reason: String?,
        moves: List<com.filipinodama.app.data.engine.Move>,
        settings: OfflineMatchSettingsDto
    ): ProfileResult<kotlinx.serialization.json.JsonElement> = call {
        api.reportOfflineMatch(
            OfflineMatchRequest(
                mode = "AI",
                aiDifficulty = difficulty,
                settings = settings,
                moves = moves,
                winner = winner,
                reason = reason
            )
        )
    }

    /** The caller's win/loss/draw tally per mode, for the Game Modes tickets. */
    suspend fun matchRecords(): ProfileResult<MatchRecordsResponse> = call { api.matchRecords() }

    suspend fun matchDetail(matchId: String): ProfileResult<MatchDetailResponse> =
        call { api.matchDetail(matchId) }

    suspend fun trophyLedger(): ProfileResult<LedgerResponse> =
        call { api.ledger("TROPHIES") }

    suspend fun publicUser(userId: String): ProfileResult<PublicUserResponse> =
        call { api.publicUser(userId) }

    suspend fun profileExtras(userId: String): ProfileResult<ProfileExtrasResponse> =
        call { api.profileExtras(userId) }

    suspend fun updateProfile(request: UpdateProfileRequest): ProfileResult<UpdateProfileResponse> {
        val result = call { api.updateProfile(request) }
        if (result is ProfileResult.Success) {
            val current = AuthRepository.state.value.user
            if (current != null) {
                val u = result.data.user
                AuthRepository.patchUser(
                    current.copy(
                        displayName = u.displayName,
                        avatarUrl = u.avatarUrl,
                        frameId = u.frameId
                    )
                )
            }
        }
        return result
    }

    private suspend fun <T> call(block: suspend () -> ApiEnvelope<T>): ProfileResult<T> {
        return try {
            val envelope = block()
            if (envelope.ok && envelope.data != null) {
                ProfileResult.Success(envelope.data)
            } else {
                val error = envelope.error
                ProfileResult.Failure(error?.code ?: "UNKNOWN", error?.message ?: "Something went wrong. Please try again.")
            }
        } catch (e: Exception) {
            // Surface the server's real 4xx error (validation, permission, etc.)
            // instead of a misleading network message; only true transport
            // failures (no HTTP response) fall back to NETWORK_ERROR.
            val apiError = apiErrorFrom(e)
            if (apiError != null) ProfileResult.Failure(apiError.code, apiError.message)
            else ProfileResult.Failure("NETWORK_ERROR", "Couldn't reach the server. Check your connection and try again.")
        }
    }
}

/** Outcome of a single profile call — carries the server's own message on failure, never a fabricated one. */
sealed class ProfileResult<out T> {
    data class Success<T>(val data: T) : ProfileResult<T>()
    data class Failure(val code: String, val message: String) : ProfileResult<Nothing>()
}
