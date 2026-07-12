package com.filipinodama.app.data.social

import kotlinx.serialization.Serializable

/**
 * Wire-format DTOs for the Direct Messages REST + socket surface (Phase 6b),
 * matching apps/server/src/modules/dm.ts / chat-service.ts field-for-field —
 * mirrors apps/web/src/stores/dmStore.ts's DmMessage/DmUser/DmConversation.
 */

@Serializable
data class DmAuthorDto(
    val id: String,
    val displayName: String,
    val avatarUrl: String? = null
)

@Serializable
data class DmMessageDto(
    val id: String,
    val channelId: String,
    val body: String,
    val createdAt: String,
    val author: DmAuthorDto
)

/** A friend I share a DM channel with (dm.ts's user select). */
@Serializable
data class DmUserDto(
    val id: String,
    val displayName: String,
    val tag: String? = null,
    val avatarUrl: String? = null
)

/** One row in the conversation list (GET /api/dm). */
@Serializable
data class DmConversationDto(
    val channelId: String,
    val user: DmUserDto,
    val lastMessage: String? = null,
    val lastAt: String? = null,
    val unread: Int = 0
)

@Serializable
data class DmConversationsResponse(
    val conversations: List<DmConversationDto> = emptyList()
)

@Serializable
data class DmUnreadTotalResponse(
    val total: Int = 0
)

@Serializable
data class DmThreadResponse(
    val channelId: String,
    val user: DmUserDto,
    val messages: List<DmMessageDto> = emptyList()
)

@Serializable
data class DmSendBody(
    val body: String
)

@Serializable
data class DmSendResponse(
    val message: DmMessageDto
)

@Serializable
data class DmReadResponse(
    val read: Boolean = true
)

/** Live socket payload for a delivered DM (server: EV.chatMessage with kind="dm"). */
@Serializable
data class DmChatMessageEvent(
    val channelId: String? = null,
    val message: DmMessageDto? = null,
    val kind: String? = null,
    val from: String? = null
)
