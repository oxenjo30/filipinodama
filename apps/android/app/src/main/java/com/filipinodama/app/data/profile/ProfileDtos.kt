package com.filipinodama.app.data.profile

import com.filipinodama.app.data.engine.Move
import kotlinx.serialization.Serializable

/**
 * Wire-format DTOs for the Profile / Match History / Replay / Public Profile
 * REST surface (Phase 6a), matching the server modules field-for-field:
 *   apps/server/src/modules/users.ts    (GET /users/:id, GET /users/:id/profile-extras,
 *                                         PATCH /users/me, GET /users/me/ledger)
 *   apps/server/src/modules/matches.ts  (GET /matches, GET /matches/:id)
 *
 * These mirror apps/web ProfilePage.tsx / PublicProfilePage.tsx / ReplayModal.tsx
 * DTO shapes exactly — see those files' header comments for the "no mock data"
 * contract this Android port also follows.
 */

// ── Match player (nullable — a match side may be a bot/left/unassigned) ──

@Serializable
data class MatchPlayerDto(
    val id: String,
    val username: String,
    val displayName: String,
    val tag: String,
    val avatarUrl: String? = null,
    val frameId: String? = null,
    val rankTier: String = "",
    val trophies: Int = 0
)

// ── Match history row (GET /api/matches?userId=&mode=&result=) ──

@Serializable
data class MatchRowDto(
    val id: String,
    val mode: String, // AI | CASUAL | RANKED | PRIVATE | LOCAL
    val winner: String? = null, // "red" | "blue" | "draw" | null
    val reason: String? = null,
    val red: MatchPlayerDto? = null,
    val blue: MatchPlayerDto? = null,
    val redTrophyDelta: Int? = null,
    val blueTrophyDelta: Int? = null,
    val goldReward: Int? = null,
    val redCaptures: Int = 0,
    val blueCaptures: Int = 0,
    val moveCount: Int = 0,
    val startedAt: String,
    val endedAt: String? = null
)

@Serializable
data class MatchHistoryResponse(
    val items: List<MatchRowDto> = emptyList(),
    val nextCursor: String? = null
)

// ── Match detail incl. moves (GET /api/matches/:id) — replay source ──

@Serializable
data class MatchDetailDto(
    val id: String,
    val mode: String,
    val settings: com.filipinodama.app.data.engine.GameSettings? = null,
    val winner: String? = null,
    val reason: String? = null,
    val red: MatchPlayerDto? = null,
    val blue: MatchPlayerDto? = null,
    val redTrophyDelta: Int? = null,
    val blueTrophyDelta: Int? = null,
    val goldReward: Int? = null,
    val redCaptures: Int = 0,
    val blueCaptures: Int = 0,
    val moveCount: Int = 0,
    val startedAt: String,
    val endedAt: String? = null,
    val moves: List<Move> = emptyList()
)

@Serializable
data class MatchDetailResponse(
    val match: MatchDetailDto
)

// ── Trophy ledger (GET /api/users/me/ledger?currency=TROPHIES) ──

@Serializable
data class LedgerRowDto(
    val id: String,
    val currency: String, // GOLD | DIAMONDS | TROPHIES
    val amount: Int,
    val balance: Int,
    val reason: String? = null,
    val refType: String? = null,
    val refId: String? = null,
    val createdAt: String
)

@Serializable
data class LedgerResponse(
    val items: List<LedgerRowDto> = emptyList(),
    val nextCursor: String? = null
)

// ── Public profile (GET /api/users/:id) ──

@Serializable
data class TierInfoDto(
    val key: String,
    val label: String,
    val sub: String,
    val accent: String,
    val img: String
)

@Serializable
data class PublicGuildDto(
    val id: String,
    val name: String,
    val tag: String,
    val role: String? = null
)

@Serializable
data class PublicUserProfileDto(
    val id: String,
    val username: String,
    val displayName: String,
    val tag: String,
    val bio: String? = null,
    val avatarUrl: String? = null,
    val frameId: String? = null,
    val countryCode: String? = null,
    val trophies: Int = 0,
    val rankTier: String = "",
    val tier: TierInfoDto,
    val equippedBoard: String? = null,
    val equippedSkin: String? = null,
    val equippedEmotes: List<String> = emptyList(),
    val wins: Int = 0,
    val losses: Int = 0,
    val draws: Int = 0,
    val streak: Int = 0,
    val createdAt: String? = null,
    val guild: PublicGuildDto? = null,
    val isBot: Boolean = false,
    val relationship: String = "none", // self | friends | request-sent | request-received | none
    val requestId: String? = null
)

@Serializable
data class PublicUserResponse(
    val user: PublicUserProfileDto
)

// ── Profile extras / v3 delta (GET /api/users/:id/profile-extras) ──

@Serializable
data class OpeningDto(
    val label: String,
    val pct: Int
)

@Serializable
data class RecentMatchDto(
    val id: String,
    val opponentName: String,
    val result: String, // win | loss | draw
    val mode: String,
    val trophyDelta: Int? = null,
    val endedAt: String? = null,
    val hasReplay: Boolean = false
)

@Serializable
data class ProfileExtrasResponse(
    val favoriteMove: String? = null,
    val openings: List<OpeningDto> = emptyList(),
    val recentMatches: List<RecentMatchDto> = emptyList(),
    val badges: List<String> = emptyList()
)

// ── PATCH /api/users/me (edit profile / avatar) ──

@Serializable
data class UpdateProfileRequest(
    val displayName: String? = null,
    val bio: String? = null,
    val avatarUrl: String? = null,
    val countryCode: String? = null
)

@Serializable
data class UpdateProfileResponse(
    val user: PublicUserProfileDto
)
