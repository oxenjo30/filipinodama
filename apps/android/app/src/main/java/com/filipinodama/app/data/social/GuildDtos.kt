package com.filipinodama.app.data.social

import kotlinx.serialization.Serializable

/**
 * Wire-format DTOs for the Guilds REST + chat surface (Phase 6b), matching
 * apps/server/src/modules/guilds.ts / guild-chat-service.ts field-for-field —
 * mirrors apps/web GuildsPage.tsx / GuildProfilePage.tsx / GuildChatPanel.tsx.
 *
 * NOTE: Guild Wars has NO server module, socket events, or web UI anywhere in
 * this codebase (verified against apps/server/src/modules + apps/web/src —
 * only GuildsPage.tsx's cosmetic "Weekly Guild War" progress bar exists,
 * driven by the real `weeklyPoints` field below, and there is no wars list/
 * opponent/schedule endpoint). The inventory's "Wars" tab + "War Log" rows
 * are therefore honestly NOT built — there is no real source to back them.
 */

@Serializable
data class GuildCardDto(
    val id: String,
    val name: String,
    val tag: String,
    val description: String? = null,
    val crestKey: String? = null,
    val minTrophies: Int = 0,
    val joinPolicy: String = "open", // open | request | invite
    val weeklyPoints: Int = 0,
    val memberCount: Int = 0,
    val createdAt: String? = null
)

@Serializable
data class GuildsListResponse(
    val guilds: List<GuildCardDto> = emptyList()
)

@Serializable
data class GuildMemberUserDto(
    val id: String,
    val username: String,
    val displayName: String,
    val tag: String,
    val avatarUrl: String? = null,
    val frameId: String? = null,
    val trophies: Int = 0,
    val rankTier: String = "",
    val lastSeenAt: String = "",
    val presence: String = "unknown"
)

@Serializable
data class GuildMemberDto(
    val userId: String,
    val role: String, // LEADER | OFFICER | MEMBER
    val weeklyContribution: Int = 0,
    val joinedAt: String = "",
    val user: GuildMemberUserDto
)

@Serializable
data class GuildDetailDto(
    val id: String,
    val name: String,
    val tag: String,
    val description: String? = null,
    val crestKey: String? = null,
    val minTrophies: Int = 0,
    val joinPolicy: String = "open",
    val weeklyPoints: Int = 0,
    val memberCount: Int = 0,
    val createdAt: String? = null
)

@Serializable
data class GuildDetailResponse(
    val guild: GuildDetailDto,
    val roster: List<GuildMemberDto> = emptyList(),
    val myRole: String? = null,
    // Present only on the public GET /api/guilds/:id (server always returns
    // it there); own-guild callers derive membership from myRole instead.
    val joinState: String? = null
)

@Serializable
data class GuildJoinRequestDto(
    val id: String,
    val createdAt: String,
    val user: GuildMemberUserDto
)

// GET /api/guilds/war — weekly Guild War status (matches getWarStatus on server).
@Serializable
data class WarStandingDto(
    val guildId: String,
    val name: String,
    val tag: String,
    val crestKey: String? = null,
    val points: Int = 0,
    val rank: Int = 0,
    val rewardGold: Int = 0
)

@Serializable
data class WarMyGuildDto(
    val guildId: String,
    val name: String,
    val tag: String,
    val points: Int = 0,
    val rank: Int = 0,
    val myContribution: Int = 0
)

@Serializable
data class WarLogEntryDto(
    val guildName: String,
    val guildTag: String,
    val crestKey: String? = null,
    val rank: Int = 0,
    val points: Int = 0,
    val rewardGold: Int = 0
)

@Serializable
data class WarStatusResponse(
    val week: Int = 1,
    val startsAt: String = "",
    val endsAt: String = "",
    val topN: Int = 3,
    val poolGold: Int = 0,
    val standings: List<WarStandingDto> = emptyList(),
    val myGuild: WarMyGuildDto? = null,
    val lastWeek: List<WarLogEntryDto> = emptyList()
)

@Serializable
data class GuildJoinRequestsResponse(
    val requests: List<GuildJoinRequestDto> = emptyList()
)

@Serializable
data class GuildJoinResponse(
    val status: String, // "joined" | "requested"
    val requestId: String? = null
)

@Serializable
data class GuildRequestActionResponse(
    val status: String // "accepted" | "declined"
)

@Serializable
data class GuildCreateBody(
    val name: String,
    val tag: String,
    val crestKey: String,
    val minTrophies: Int? = null,
    val joinPolicy: String? = null,
    val description: String? = null
)

@Serializable
data class GuildCreateResponse(
    val guild: GuildCardDto
)

@Serializable
data class GuildUpdateBody(
    val name: String? = null,
    val description: String? = null,
    val minTrophies: Int? = null,
    val crestKey: String? = null,
    val joinPolicy: String? = null
)

@Serializable
data class GuildUpdateResponse(
    val guild: GuildDetailDto
)

@Serializable
data class GuildMemberRoleBody(
    val role: String // OFFICER | MEMBER
)

@Serializable
data class GuildMemberRoleResponse(
    val userId: String,
    val role: String
)

@Serializable
data class GuildMemberRemovedResponse(
    val removed: Boolean = true,
    val guildDeleted: Boolean = false
)

// ── Guild chat ──

@Serializable
data class GuildChatAuthorDto(
    val id: String,
    val displayName: String,
    val avatarUrl: String? = null
)

@Serializable
data class GuildChatMessageDto(
    val id: String,
    val guildId: String,
    val body: String,
    val createdAt: String,
    val author: GuildChatAuthorDto,
    val role: String? = null // LEADER | OFFICER | MEMBER | null
)

@Serializable
data class GuildChatHistoryResponse(
    val messages: List<GuildChatMessageDto> = emptyList()
)

@Serializable
data class GuildChatSendBody(
    val body: String
)

@Serializable
data class GuildChatSendResponse(
    val message: GuildChatMessageDto
)
