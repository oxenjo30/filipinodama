package com.filipinodama.app.data.social

/**
 * GET /api/users/search?q= result row — matches server's `searchSelect`
 * projection exactly (apps/server/src/modules/users.ts, "Public search-result
 * projection — only fields safe to show in a results list").
 */
data class UserSearchResultDto(
    val id: String,
    val username: String,
    val displayName: String,
    val tag: String,
    val avatarUrl: String?,
    val frameId: String?,
    val trophies: Int,
    val rankTier: String
)

data class UserSearchResponse(val items: List<UserSearchResultDto>)
