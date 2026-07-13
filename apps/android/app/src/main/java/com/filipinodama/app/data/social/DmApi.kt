package com.filipinodama.app.data.social

import com.filipinodama.app.data.ApiEnvelope
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * Retrofit interface for the Direct Messages REST endpoints, matching
 * apps/server/src/modules/dm.ts exactly (mounted under "api/"). Sending rides
 * REST (server persists + live-delivers over the socket to both parties'
 * `presence:<userId>` rooms); this interface only covers the REST half — live
 * delivery is [DmRepository]'s socket subscription.
 */
interface DmApi {

    @GET("api/dm")
    suspend fun conversations(): ApiEnvelope<DmConversationsResponse>

    @GET("api/dm/unread-total")
    suspend fun unreadTotal(): ApiEnvelope<DmUnreadTotalResponse>

    @GET("api/dm/{userId}")
    suspend fun thread(@Path("userId") userId: String): ApiEnvelope<DmThreadResponse>

    @POST("api/dm/{userId}")
    suspend fun send(@Path("userId") userId: String, @Body body: DmSendBody): ApiEnvelope<DmSendResponse>

    @POST("api/dm-channel/{channelId}/read")
    suspend fun markRead(@Path("channelId") channelId: String): ApiEnvelope<DmReadResponse>
}
