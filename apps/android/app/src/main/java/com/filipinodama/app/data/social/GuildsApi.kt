package com.filipinodama.app.data.social

import com.filipinodama.app.data.ApiEnvelope
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Retrofit interface for the Guilds REST endpoints, matching
 * apps/server/src/modules/guilds.ts exactly (mounted under "api/").
 */
interface GuildsApi {

    @GET("api/guilds")
    suspend fun browse(@Query("search") search: String? = null): ApiEnvelope<GuildsListResponse>

    @GET("api/guilds/war")
    suspend fun war(): ApiEnvelope<WarStatusResponse>

    @POST("api/guilds")
    suspend fun create(@Body body: GuildCreateBody): ApiEnvelope<GuildCreateResponse>

    @GET("api/guilds/{id}")
    suspend fun detail(@Path("id") id: String): ApiEnvelope<GuildDetailResponse>

    @PATCH("api/guilds/{id}")
    suspend fun update(@Path("id") id: String, @Body body: GuildUpdateBody): ApiEnvelope<GuildUpdateResponse>

    @GET("api/guilds/{id}/chat")
    suspend fun chatHistory(@Path("id") id: String): ApiEnvelope<GuildChatHistoryResponse>

    @POST("api/guilds/{id}/chat")
    suspend fun sendChat(@Path("id") id: String, @Body body: GuildChatSendBody): ApiEnvelope<GuildChatSendResponse>

    @POST("api/guilds/{id}/join")
    suspend fun join(@Path("id") id: String): ApiEnvelope<GuildJoinResponse>

    @GET("api/guilds/{id}/requests")
    suspend fun requests(@Path("id") id: String): ApiEnvelope<GuildJoinRequestsResponse>

    @POST("api/guilds/{id}/requests/{rid}/accept")
    suspend fun acceptRequest(@Path("id") id: String, @Path("rid") requestId: String): ApiEnvelope<GuildRequestActionResponse>

    @POST("api/guilds/{id}/requests/{rid}/decline")
    suspend fun declineRequest(@Path("id") id: String, @Path("rid") requestId: String): ApiEnvelope<GuildRequestActionResponse>

    @PATCH("api/guilds/{id}/members/{uid}/role")
    suspend fun setMemberRole(@Path("id") id: String, @Path("uid") userId: String, @Body body: GuildMemberRoleBody): ApiEnvelope<GuildMemberRoleResponse>

    @DELETE("api/guilds/{id}/members/{uid}")
    suspend fun removeMember(@Path("id") id: String, @Path("uid") userId: String): ApiEnvelope<GuildMemberRemovedResponse>
}
