package com.filipinodama.app.data.billing

import com.filipinodama.app.data.ApiEnvelope
import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

/**
 * Retrofit interface for the Google Play Billing REST surface
 * (apps/server/src/modules/payments.ts), matching the ApiEnvelope pattern
 * used by [com.filipinodama.app.data.economy.EconomyApi]. This is a
 * DELIBERATELY SEPARATE package/interface from EconomyApi: EconomyDtos.kt's
 * file kdoc documents a hard policy that the earned-currency economy surface
 * never touches payments — Play Billing is the one sanctioned real-money path
 * on Android (Play Store policy), so it gets its own home.
 *
 * NEVER credits diamonds client-side — [verifyPlay] merely forwards the
 * completed purchase to the server, which is the sole crediting authority
 * (verifies with Google, credits idempotently on the purchase token). The
 * client only consumes the purchase with Play AFTER a successful server
 * response — see BillingRepository.
 */
interface PlayBillingApi {

    /**
     * GET /api/payments/play/products — public, read-only. Returns the
     * enabled diamond packs mapped to their Play Console product ids, or
     * `enabled:false, products:[]` while Play Billing is off (dark). The app
     * uses `productId` to query Play for real formatted prices; never
     * fabricates a price.
     */
    @GET("api/payments/play/products")
    suspend fun products(): ApiEnvelope<PlayProductsResponse>

    /**
     * POST /api/payments/play/verify — the ONLY diamond-crediting path for
     * Play purchases. Server verifies with Google and credits idempotently
     * (safe to retry with the same purchaseToken). 503 if Play Billing is
     * disabled server-side; 403 GUEST_CANNOT_TOPUP for a guest session.
     */
    @POST("api/payments/play/verify")
    suspend fun verifyPlay(@Body body: PlayVerifyRequest): ApiEnvelope<PlayVerifyResponse>
}

@Serializable
data class PlayProductDto(
    val packId: String,
    val productId: String,
    val diamonds: Int,
    val bonus: Int = 0
)

@Serializable
data class PlayProductsResponse(
    val enabled: Boolean = false,
    val products: List<PlayProductDto> = emptyList()
)

@Serializable
data class PlayVerifyRequest(
    val productId: String,
    val purchaseToken: String
)

@Serializable
data class PlayVerifyResponse(
    val credited: Boolean = false,
    val alreadyProcessed: Boolean = false,
    val diamonds: Int = 0,
    val acknowledged: Boolean = false
)
