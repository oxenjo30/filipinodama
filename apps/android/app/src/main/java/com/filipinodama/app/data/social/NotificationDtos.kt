package com.filipinodama.app.data.social

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/**
 * Wire-format DTOs for Notifications (Phase 6b), matching
 * apps/server/src/modules/notifications.ts field-for-field — mirrors
 * apps/web/src/features/nav/NotificationsMenu.tsx's Notif/NotifResponse.
 */

@Serializable
data class NotificationDto(
    val id: String,
    val type: String,
    val title: String,
    val body: String? = null,
    val data: JsonElement? = null,
    val readAt: String? = null,
    val createdAt: String
)

@Serializable
data class NotificationGroupsDto(
    val today: List<NotificationDto> = emptyList(),
    val yesterday: List<NotificationDto> = emptyList(),
    val earlier: List<NotificationDto> = emptyList()
)

@Serializable
data class NotificationsResponse(
    val notifications: List<NotificationDto> = emptyList(),
    val groups: NotificationGroupsDto = NotificationGroupsDto(),
    val unreadCount: Int = 0,
    val nextCursor: String? = null,
    val hasMore: Boolean = false
)

@Serializable
data class NotificationReadAllResponse(
    val updated: Int = 0
)

@Serializable
data class NotificationDismissResponse(
    val dismissed: Boolean = true
)

@Serializable
data class NotificationReadResponse(
    val read: Boolean = true
)

@Serializable
data class NotificationResolveBody(
    val status: String // "accepted" | "declined"
)

@Serializable
data class NotificationResolveResponse(
    val status: String
)
