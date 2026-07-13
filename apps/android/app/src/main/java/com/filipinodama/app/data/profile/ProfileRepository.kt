package com.filipinodama.app.data.profile

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
            ProfileResult.Failure("NETWORK_ERROR", "Couldn't reach the server. Check your connection and try again.")
        }
    }
}

/** Outcome of a single profile call — carries the server's own message on failure, never a fabricated one. */
sealed class ProfileResult<out T> {
    data class Success<T>(val data: T) : ProfileResult<T>()
    data class Failure(val code: String, val message: String) : ProfileResult<Nothing>()
}
