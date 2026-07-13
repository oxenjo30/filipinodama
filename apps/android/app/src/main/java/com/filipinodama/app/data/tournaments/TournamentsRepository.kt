package com.filipinodama.app.data.tournaments

import com.filipinodama.app.data.ApiClient
import com.filipinodama.app.data.ApiEnvelope
import com.filipinodama.app.data.economy.EconomyResult

/**
 * TournamentsRepository — server-authoritative client for GET /api/tournaments
 * (OPEN + RUNNING tournaments only, matching the server's default filter),
 * backing the Home hub's Tournaments strip and TournamentsListScreen.
 *
 * Follows the same singleton-object + [EconomyResult] convention as
 * [com.filipinodama.app.data.economy.EconomyRepository] rather than
 * introducing a second result type for one small surface.
 */
object TournamentsRepository {

    private val api: TournamentsApi by lazy { ApiClient.create<TournamentsApi>() }

    suspend fun list(): EconomyResult<TournamentsListResponse> {
        return try {
            val envelope = api.list()
            unwrap(envelope)
        } catch (e: Exception) {
            EconomyResult.Failure("NETWORK_ERROR", "Couldn't reach the server. Check your connection and try again.")
        }
    }

    /** GET /api/tournaments/:id — full detail + entries + bracket + myEntry (tournaments.ts:55-84). */
    suspend fun detail(id: String): EconomyResult<TournamentDetailDto> {
        return try {
            unwrap(api.detail(id))
        } catch (e: Exception) {
            EconomyResult.Failure("NETWORK_ERROR", "Couldn't reach the server. Check your connection and try again.")
        }
    }

    /**
     * POST /api/tournaments/:id/join — guest-blocked (403 GUEST_CANNOT_JOIN).
     * A non-2xx response surfaces via Retrofit as an HttpException, which the
     * generic catch below can't decode a real server error code/message out
     * of (this app's Retrofit setup has no error-body-decoding interceptor
     * anywhere — see EconomyRepository.purchase for the identical, already-
     * accepted limitation on store purchases). The guest case specifically is
     * additionally guarded client-side in TournamentDetailScreen (checks
     * AuthRepository's isGuest before calling this at all) so the honest
     * "Sign in to join tournaments" message shows without depending on
     * decoding the 403 body.
     */
    suspend fun join(id: String): EconomyResult<TournamentJoinResponse> {
        return try {
            unwrap(api.join(id))
        } catch (e: Exception) {
            EconomyResult.Failure("JOIN_FAILED", "Couldn't join this tournament. Please try again.")
        }
    }

    /** POST /api/tournaments/:id/leave — only while OPEN (tournaments-core.ts enforces). */
    suspend fun leave(id: String): EconomyResult<TournamentLeaveResponse> {
        return try {
            unwrap(api.leave(id))
        } catch (e: Exception) {
            EconomyResult.Failure("LEAVE_FAILED", "Couldn't leave this tournament. Please try again.")
        }
    }

    private fun <T> unwrap(envelope: ApiEnvelope<T>): EconomyResult<T> {
        return if (envelope.ok && envelope.data != null) {
            EconomyResult.Success(envelope.data)
        } else {
            val error = envelope.error
            EconomyResult.Failure(error?.code ?: "UNKNOWN", error?.message ?: "Something went wrong. Please try again.")
        }
    }
}
