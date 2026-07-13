package com.filipinodama.app.data.leaderboard

import com.filipinodama.app.data.ApiEnvelope
import retrofit2.http.GET
import retrofit2.http.Query

/** Retrofit interface for GET /api/leaderboard, mounted under the shared "api/" prefix. */
interface LeaderboardApi {

    @GET("api/leaderboard")
    suspend fun leaderboard(
        @Query("scope") scope: String,
        @Query("season") season: String? = null,
        @Query("limit") limit: Int? = null
    ): ApiEnvelope<LeaderboardResponse>
}
