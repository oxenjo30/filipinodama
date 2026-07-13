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

    private fun <T> unwrap(envelope: ApiEnvelope<T>): EconomyResult<T> {
        return if (envelope.ok && envelope.data != null) {
            EconomyResult.Success(envelope.data)
        } else {
            val error = envelope.error
            EconomyResult.Failure(error?.code ?: "UNKNOWN", error?.message ?: "Something went wrong. Please try again.")
        }
    }
}
