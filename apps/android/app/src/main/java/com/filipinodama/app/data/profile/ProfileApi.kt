package com.filipinodama.app.data.profile

import com.filipinodama.app.data.ApiEnvelope
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.Body

/**
 * Retrofit interface for the Profile / Match History / Replay / Public
 * Profile REST endpoints (Phase 6a), mounted under the shared "api/" prefix
 * exactly like [com.filipinodama.app.data.AuthApi] / [com.filipinodama.app.data.economy.EconomyApi].
 */
interface ProfileApi {

    @GET("api/matches")
    suspend fun matches(
        @Query("userId") userId: String,
        @Query("mode") mode: String? = null,
        @Query("result") result: String? = null,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null
    ): ApiEnvelope<MatchHistoryResponse>

    @GET("api/matches/{id}")
    suspend fun matchDetail(@Path("id") id: String): ApiEnvelope<MatchDetailResponse>

    @GET("api/users/me/ledger")
    suspend fun ledger(@Query("currency") currency: String): ApiEnvelope<LedgerResponse>

    @GET("api/users/{id}")
    suspend fun publicUser(@Path("id") id: String): ApiEnvelope<PublicUserResponse>

    @GET("api/users/{id}/profile-extras")
    suspend fun profileExtras(@Path("id") id: String): ApiEnvelope<ProfileExtrasResponse>

    @PATCH("api/users/me")
    suspend fun updateProfile(@Body request: UpdateProfileRequest): ApiEnvelope<UpdateProfileResponse>
}
