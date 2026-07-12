package com.filipinodama.app.data.economy

import com.filipinodama.app.data.ApiEnvelope
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * Retrofit interface for the economy REST endpoints (Phase 5), mounted under
 * the shared "api/" prefix exactly like [com.filipinodama.app.data.AuthApi] /
 * [com.filipinodama.app.data.rooms.RoomsApi]. No top-up/payments endpoints —
 * see EconomyDtos.kt header for the hard policy.
 */
interface EconomyApi {

    @GET("api/store/items")
    suspend fun storeItems(): ApiEnvelope<StoreItemsResponse>

    @POST("api/store/purchase")
    suspend fun purchase(@Body request: PurchaseRequest): ApiEnvelope<PurchaseResponse>

    @GET("api/orders")
    suspend fun orders(): ApiEnvelope<OrdersResponse>

    /**
     * GDPR export — used ONLY for its `inventory` array (the sole REST read of
     * the user's InventoryItem rows), mirroring apps/web StorePage.tsx /
     * InventoryPage.tsx. Ownership is keyed by inventory itemId, never derived
     * from order history (granted starter items have no Order rows).
     */
    @GET("api/users/me/export")
    suspend fun export(): ApiEnvelope<UserExportResponse>

    @PATCH("api/users/me/equip")
    suspend fun equip(@Body request: EquipRequest): ApiEnvelope<EquipResponse>

    @GET("api/rewards/daily-login")
    suspend fun dailyLoginStatus(): ApiEnvelope<DailyLoginStatusResponse>

    @POST("api/rewards/daily-login")
    suspend fun claimDailyLogin(): ApiEnvelope<DailyLoginClaimResponse>

    @GET("api/quests")
    suspend fun quests(): ApiEnvelope<QuestsResponse>

    @POST("api/quests/{id}/claim")
    suspend fun claimQuest(@Path("id") id: String): ApiEnvelope<QuestClaimResponse>

    @GET("api/season/current")
    suspend fun seasonCurrent(): ApiEnvelope<SeasonCurrentResponse>

    @POST("api/season/claim")
    suspend fun claimSeasonTier(@Body request: SeasonClaimRequest): ApiEnvelope<SeasonClaimResponse>

    @POST("api/season/pass")
    suspend fun buySeasonPass(): ApiEnvelope<SeasonPassResponse>

    @GET("api/matches/active")
    suspend fun activeMatch(): ApiEnvelope<ActiveMatchResponse>
}
