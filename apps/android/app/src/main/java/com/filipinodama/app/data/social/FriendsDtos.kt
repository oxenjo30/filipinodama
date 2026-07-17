package com.filipinodama.app.data.social

import kotlinx.serialization.Serializable

/**
 * Wire-format DTOs for the Friends REST surface (Phase 6b), matching
 * apps/server/src/modules/friends.ts's `publicFriend()` shape field-for-field
 * — mirrors apps/web FriendsPage.tsx's FriendUser/FriendReq types exactly.
 */

@Serializable
data class FriendUserDto(
    val id: String,
    val username: String,
    val displayName: String,
    val tag: String,
    val avatarUrl: String? = null,
    val frameId: String? = null,
    val trophies: Int = 0,
    val rankTier: String = "",
    val lastSeenAt: String = "",
    // presence is delivered live over sockets; REST always reports "unknown".
    val presence: String = "unknown",
    // REAL "in a live match" flag from GET /api/friends (server reads the
    // rt:userMatch Redis index). Drives the amber "in-game" presence dot.
    val inMatch: Boolean = false
)

@Serializable
data class FriendRequestDto(
    val id: String,
    val createdAt: String,
    val user: FriendUserDto
)

@Serializable
data class FriendsResponse(
    val friends: List<FriendUserDto> = emptyList()
)

@Serializable
data class FriendRequestsResponse(
    val incoming: List<FriendRequestDto> = emptyList(),
    val outgoing: List<FriendRequestDto> = emptyList()
)

@Serializable
data class SuggestedFriendsResponse(
    val suggested: List<FriendUserDto> = emptyList()
)

@Serializable
data class FriendActionStatusResponse(
    val status: String, // "accepted" | "pending" | "declined"
    val requestId: String? = null
)

@Serializable
data class FriendRemovedResponse(
    val removed: Boolean = true
)

@Serializable
data class SendFriendRequestBody(
    val toUserId: String
)

@Serializable
data class SendFriendRequestByTagBody(
    val tag: String
)
