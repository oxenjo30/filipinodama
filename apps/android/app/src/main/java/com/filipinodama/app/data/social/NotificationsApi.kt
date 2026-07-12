package com.filipinodama.app.data.social

import com.filipinodama.app.data.ApiEnvelope
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * Retrofit interface for the Notifications REST endpoints, matching
 * apps/server/src/modules/notifications.ts exactly (mounted under "api/").
 */
interface NotificationsApi {

    @GET("api/notifications")
    suspend fun list(): ApiEnvelope<NotificationsResponse>

    @POST("api/notifications/read-all")
    suspend fun readAll(): ApiEnvelope<NotificationReadAllResponse>

    @POST("api/notifications/{id}/dismiss")
    suspend fun dismiss(@Path("id") id: String): ApiEnvelope<NotificationDismissResponse>

    @POST("api/notifications/{id}/resolve")
    suspend fun resolve(@Path("id") id: String, @Body body: NotificationResolveBody): ApiEnvelope<NotificationResolveResponse>

    @POST("api/notifications/{id}/read")
    suspend fun markRead(@Path("id") id: String): ApiEnvelope<NotificationReadResponse>
}
