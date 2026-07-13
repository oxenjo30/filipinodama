package com.filipinodama.app.data.tournaments

import com.filipinodama.app.data.ApiEnvelope
import retrofit2.http.GET
import retrofit2.http.Query

/**
 * Retrofit interface for the player-facing tournaments endpoints
 * (apps/server/src/modules/tournaments.ts). Mounted under the shared "api/"
 * prefix exactly like [com.filipinodama.app.data.economy.EconomyApi].
 */
interface TournamentsApi {
    @GET("api/tournaments")
    suspend fun list(@Query("status") status: String? = null): ApiEnvelope<TournamentsListResponse>
}
