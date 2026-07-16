package com.filipinodama.app.data.social

import com.filipinodama.app.data.ApiEnvelope
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
 * blocks.ts wraps its success bodies in the standard `ok({ data })` envelope,
 * same as FriendsApi/GuildsApi. The suspend functions below therefore return
 * `ApiEnvelope<T>`, unwrapped by [BlockRepository] the same way
 * [FriendsRepository] unwraps [FriendsApi] results.
 */
interface BlockApi {

    @POST("api/blocks")
    suspend fun block(@Body body: BlockRequest): ApiEnvelope<BlockAckResponse>

    @DELETE("api/blocks/{userId}")
    suspend fun unblock(@Path("userId") userId: String): ApiEnvelope<BlockAckResponse>

    @GET("api/blocks")
    suspend fun list(): ApiEnvelope<BlockListResponse>
}

@Serializable
data class BlockRequest(val userId: String)

@Serializable
data class BlockAckResponse(val blocked: Boolean = false, val unblocked: Boolean = false)

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
