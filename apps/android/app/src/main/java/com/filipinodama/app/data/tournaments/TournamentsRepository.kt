package com.filipinodama.app.data.tournaments

import com.filipinodama.app.data.apiErrorFrom

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
            failureFrom(e, "NETWORK_ERROR", "Couldn't reach the server. Check your connection and try again.")
        }
    }

    /** GET /api/tournaments/:id — full detail + entries + bracket + myEntry (tournaments.ts:55-84). */
    suspend fun detail(id: String): EconomyResult<TournamentDetailDto> {
        return try {
            unwrap(api.detail(id))
        } catch (e: Exception) {
            failureFrom(e, "NETWORK_ERROR", "Couldn't reach the server. Check your connection and try again.")
        }
    }

    /**
     * POST /api/tournaments/:id/join — guest-blocked (403 GUEST_CANNOT_JOIN).
     * A non-2xx now surfaces the server's real error code/message via
     * [apiErrorFrom] (see ApiErrors.kt), so e.g. the 403 GUEST_CANNOT_JOIN body
     * reaches the UI. The guest case is ALSO guarded client-side in
     * TournamentDetailScreen (checks AuthRepository's isGuest before calling),
     * so the honest "Sign in to join tournaments" message shows regardless.
     */
    suspend fun join(id: String): EconomyResult<TournamentJoinResponse> {
        return try {
            unwrap(api.join(id))
        } catch (e: Exception) {
            failureFrom(e, "JOIN_FAILED", "Couldn't join this tournament. Please try again.")
        }
    }

    /** POST /api/tournaments/:id/leave — only while OPEN (tournaments-core.ts enforces). */
    suspend fun leave(id: String): EconomyResult<TournamentLeaveResponse> {
        return try {
            unwrap(api.leave(id))
        } catch (e: Exception) {
            failureFrom(e, "LEAVE_FAILED", "Couldn't leave this tournament. Please try again.")
        }
    }

    /**
     * Build a Failure from a thrown request: the server's real 4xx error when
     * present ([apiErrorFrom]), else the given transport-failure fallback.
     */
    private fun <T> failureFrom(e: Throwable, fallbackCode: String, fallbackMessage: String): EconomyResult<T> {
        val apiError = apiErrorFrom(e)
        return if (apiError != null) EconomyResult.Failure(apiError.code, apiError.message)
        else EconomyResult.Failure(fallbackCode, fallbackMessage)
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
