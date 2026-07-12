package com.filipinodama.app.data.leaderboard

import kotlinx.serialization.Serializable

/**
 * Wire-format DTOs for GET /api/leaderboard (apps/server/src/modules/leaderboard.ts),
 * matching apps/web/src/features/leaderboard/LeaderboardPage.tsx's LbRow/LbResponse
 * shapes field-for-field.
 *
 * scope is one of "global" | "friends" | "guild" — ALL THREE are real,
 * server-backed scopes (leaderboard.ts querySchema). global is public;
 * friends/guild require a signed-in user (401 if requested while signed out —
 * the same "needsAuth" gate LeaderboardPage.tsx applies client-side before
 * even issuing the request).
 */

@Serializable
data class LbTierDto(
    val key: String,
    val label: String,
    val sub: String,
    val accent: String,
    val img: String
)

@Serializable
data class LbRowDto(
    val rank: Int,
    val userId: String,
    val username: String,
    val displayName: String,
    val tag: String,
    val avatarUrl: String? = null,
    val frameId: String? = null,
    val countryCode: String? = null,
    val trophies: Int = 0,
    val wins: Int = 0,
    val losses: Int = 0,
    val streak: Int = 0,
    val rankTier: LbTierDto
)

@Serializable
data class LeaderboardResponse(
    val scope: String,
    val season: String? = null,
    val rows: List<LbRowDto> = emptyList(),
    val me: LbRowDto? = null
)
