package com.filipinodama.app.data.social

import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * Retrofit interface for the Blocks REST endpoints, matching
 * apps/server/src/modules/blocks.ts exactly (mounted under "api/").
 *
 * Unlike FriendsApi/GuildsApi, blocks.ts does NOT wrap its success bodies in
 * the standard `ok({ data })` envelope — it returns `{ ok: true }` and
 * `{ blocked: [...] }` directly (verified against the route handlers). Error
 * responses still go through the app's global `setErrorHandler` -> `fail()`,
 * so failures are still the standard `{ok:false, error:{code,message}}`
 * envelope and [com.filipinodama.app.data.apiErrorFrom] still applies. The
 * suspend functions below therefore return the raw payload types directly
 * (no `ApiEnvelope<T>` wrapper), matching the real wire shape.
 */
interface BlockApi {

    @POST("api/blocks")
    suspend fun block(@Body body: BlockRequest): BlockAckResponse

    @DELETE("api/blocks/{userId}")
    suspend fun unblock(@Path("userId") userId: String): BlockAckResponse

    @GET("api/blocks")
    suspend fun list(): BlockListResponse
}

@Serializable
data class BlockRequest(val userId: String)

@Serializable
data class BlockAckResponse(val ok: Boolean = true)

@Serializable
data class BlockedUser(
    val id: String,
    val username: String,
    val displayName: String,
    val tag: String,
    val avatarUrl: String? = null,
    val blockedAt: String? = null
)

@Serializable
data class BlockListResponse(val blocked: List<BlockedUser> = emptyList())
