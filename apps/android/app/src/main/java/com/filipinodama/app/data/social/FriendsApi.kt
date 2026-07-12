package com.filipinodama.app.data.social

import com.filipinodama.app.data.ApiEnvelope
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * Retrofit interface for the Friends REST endpoints, matching
 * apps/server/src/modules/friends.ts exactly (mounted under "api/").
 */
interface FriendsApi {

    @GET("api/friends")
    suspend fun friends(): ApiEnvelope<FriendsResponse>

    @GET("api/friends/requests")
    suspend fun requests(): ApiEnvelope<FriendRequestsResponse>

    @GET("api/friends/suggested")
    suspend fun suggested(): ApiEnvelope<SuggestedFriendsResponse>

    @POST("api/friends/request")
    suspend fun sendRequest(@Body body: SendFriendRequestBody): ApiEnvelope<FriendActionStatusResponse>

    @POST("api/friends/request-by-tag")
    suspend fun sendRequestByTag(@Body body: SendFriendRequestByTagBody): ApiEnvelope<FriendActionStatusResponse>

    @POST("api/friends/request/{id}/accept")
    suspend fun acceptRequest(@Path("id") id: String): ApiEnvelope<FriendActionStatusResponse>

    @POST("api/friends/request/{id}/decline")
    suspend fun declineRequest(@Path("id") id: String): ApiEnvelope<FriendActionStatusResponse>

    @DELETE("api/friends/{userId}")
    suspend fun removeFriend(@Path("userId") userId: String): ApiEnvelope<FriendRemovedResponse>
}
