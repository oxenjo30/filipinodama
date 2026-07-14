package com.filipinodama.app.data.social

import com.filipinodama.app.data.apiErrorFrom

import com.filipinodama.app.data.ApiClient
import com.filipinodama.app.data.ApiEnvelope

/**
 * GuildsRepository — server-authoritative client for Guilds (Phase 6b),
 * matching this scaffold's singleton-object convention. Plain REST; guild
 * chat's live half is [GuildChatRepository].
 */
object GuildsRepository {

    private val api: GuildsApi by lazy { ApiClient.create<GuildsApi>() }

    suspend fun browse(search: String = ""): SocialResult<GuildsListResponse> =
        call { api.browse(search.trim().ifEmpty { null }) }

    suspend fun war(): SocialResult<WarStatusResponse> =
        call { api.war() }

    suspend fun detail(guildId: String): SocialResult<GuildDetailResponse> =
        call { api.detail(guildId) }

    suspend fun create(
        name: String,
        tag: String,
        crestKey: String,
        minTrophies: Int,
        joinPolicy: String,
        description: String?
    ): SocialResult<GuildCreateResponse> = call {
        api.create(GuildCreateBody(name = name, tag = tag, crestKey = crestKey, minTrophies = minTrophies, joinPolicy = joinPolicy, description = description))
    }

    suspend fun update(
        guildId: String,
        name: String,
        description: String,
        minTrophies: Int,
        crestKey: String,
        joinPolicy: String
    ): SocialResult<GuildUpdateResponse> = call {
        api.update(guildId, GuildUpdateBody(name = name, description = description, minTrophies = minTrophies, crestKey = crestKey, joinPolicy = joinPolicy))
    }

    suspend fun join(guildId: String): SocialResult<GuildJoinResponse> = call { api.join(guildId) }

    suspend fun requests(guildId: String): SocialResult<GuildJoinRequestsResponse> = call { api.requests(guildId) }

    suspend fun acceptRequest(guildId: String, requestId: String): SocialResult<GuildRequestActionResponse> =
        call { api.acceptRequest(guildId, requestId) }

    suspend fun declineRequest(guildId: String, requestId: String): SocialResult<GuildRequestActionResponse> =
        call { api.declineRequest(guildId, requestId) }

    suspend fun setMemberRole(guildId: String, userId: String, role: String): SocialResult<GuildMemberRoleResponse> =
        call { api.setMemberRole(guildId, userId, GuildMemberRoleBody(role)) }

    suspend fun removeMember(guildId: String, userId: String): SocialResult<GuildMemberRemovedResponse> =
        call { api.removeMember(guildId, userId) }

    private suspend fun <T> call(block: suspend () -> ApiEnvelope<T>): SocialResult<T> {
        return try {
            val envelope = block()
            if (envelope.ok && envelope.data != null) {
                SocialResult.Success(envelope.data)
            } else {
                val error = envelope.error
                SocialResult.Failure(error?.code ?: "UNKNOWN", error?.message ?: "Something went wrong. Please try again.")
            }
        } catch (e: Exception) {
            // Surface the server's real 4xx error (validation, permission, etc.)
            // instead of a misleading network message; only true transport
            // failures (no HTTP response) fall back to NETWORK_ERROR.
            val apiError = apiErrorFrom(e)
            if (apiError != null) SocialResult.Failure(apiError.code, apiError.message)
            else SocialResult.Failure("NETWORK_ERROR", "Couldn't reach the server. Check your connection and try again.")
        }
    }
}

/** Guild role rank, mirrors apps/web GuildsPage.tsx's ROLE_RANK exactly. */
val GUILD_ROLE_RANK: Map<String, Int> = mapOf("MEMBER" to 1, "OFFICER" to 2, "LEADER" to 3)

/** True if [role] is at least [min] in the guild role hierarchy. */
fun guildRoleAtLeast(role: String?, min: String): Boolean {
    val r = GUILD_ROLE_RANK[role] ?: return false
    val m = GUILD_ROLE_RANK[min] ?: return false
    return r >= m
}
