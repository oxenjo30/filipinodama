package com.filipinodama.app.data.social

import kotlinx.serialization.Serializable

/**
 * GET /api/users/search?q= result row — matches server's `searchSelect`
 * projection exactly (apps/server/src/modules/users.ts, "Public search-result
 * projection — only fields safe to show in a results list").
 */
@Serializable
data class UserSearchResultDto(
    val id: String,
    val username: String,
    val displayName: String,
    val tag: String,
    val avatarUrl: String? = null,
    val frameId: String? = null,
    val trophies: Int = 0,
    val rankTier: String = ""
)

@Serializable
data class UserSearchResponse(val items: List<UserSearchResultDto>)
