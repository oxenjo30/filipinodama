package com.filipinodama.app.data.tournaments

import com.filipinodama.app.data.ApiEnvelope
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Retrofit interface for the player-facing tournaments endpoints
 * (apps/server/src/modules/tournaments.ts). Mounted under the shared "api/"
 * prefix exactly like [com.filipinodama.app.data.economy.EconomyApi].
 */
interface TournamentsApi {
    @GET("api/tournaments")
    suspend fun list(@Query("status") status: String? = null): ApiEnvelope<TournamentsListResponse>

    @GET("api/tournaments/{id}")
    suspend fun detail(@Path("id") id: String): ApiEnvelope<TournamentDetailDto>

    @POST("api/tournaments/{id}/join")
    suspend fun join(@Path("id") id: String): ApiEnvelope<TournamentJoinResponse>

    @POST("api/tournaments/{id}/leave")
    suspend fun leave(@Path("id") id: String): ApiEnvelope<TournamentLeaveResponse>
}
