package com.filipinodama.app.data.tournaments

import kotlinx.serialization.Serializable

/**
 * Wire-format DTOs for the player-facing tournaments REST surface
 * (apps/server/src/modules/tournaments.ts), field-for-field with its
 * GET /api/tournaments response mapping (status is one of the real
 * TournamentStatus enum values — DRAFT|OPEN|RUNNING|COMPLETED|CANCELLED —
 * NOT the mockup's placeholder live/upcoming/finished vocabulary; the UI
 * layer maps the real enum to display copy, see TournamentDisplay.kt).
 */
@Serializable
data class TournamentListItemDto(
    val id: String,
    val name: String,
    val format: String, // SINGLE_ELIM | DOUBLE_ELIM | SWISS | ROUND_ROBIN
    val status: String, // OPEN | RUNNING (server only ever returns these two for the list route)
    val entryFeeGold: Int = 0,
    val prizePoolGold: Int = 0,
    val maxPlayers: Int = 16,
    val registered: Int = 0,
    val startsAt: String? = null,
    val minTrophies: Int = 0,
    val joined: Boolean = false
)

@Serializable
data class TournamentsListResponse(
    val items: List<TournamentListItemDto> = emptyList()
)

/**
 * GET /api/tournaments/:id response — the Tournament row spread (see
 * tournaments.ts:76-83) plus entries/bracket/myEntry. Field set mirrors
 * [TournamentListItemDto] where overlapping, but the detail route's spread
 * uses the server's OWN column names directly (registeredCount, not
 * "registered" — the list route renames that one field; the detail route
 * does not), so this DTO is intentionally distinct from the list DTO rather
 * than reused.
 */
@Serializable
data class TournamentDetailDto(
    val id: String,
    val name: String,
    val format: String, // SINGLE_ELIM | DOUBLE_ELIM | SWISS | ROUND_ROBIN
    val status: String, // DRAFT | OPEN | RUNNING | COMPLETED | CANCELLED
    val entryFeeGold: Int = 0,
    val prizePoolGold: Int = 0,
    val maxPlayers: Int = 16,
    val registeredCount: Int = 0,
    val startsAt: String? = null,
    val minTrophies: Int = 0,
    val entries: List<TournamentEntryDto> = emptyList(),
    val bracket: Map<String, List<TournamentMatchDto>> = emptyMap(),
    val myEntry: TournamentMyEntryDto? = null
)

@Serializable
data class TournamentEntryDto(
    val id: String,
    val seed: Int? = null,
    val eliminated: Boolean = false,
    val placement: Int? = null,
    val joinedAt: String? = null,
    val user: TournamentEntryUserDto
)

@Serializable
data class TournamentEntryUserDto(
    val id: String,
    val username: String,
    val tag: String? = null,
    val avatarUrl: String? = null
)

@Serializable
data class TournamentMyEntryDto(
    val id: String,
    val seed: Int? = null,
    val eliminated: Boolean = false,
    val placement: Int? = null
)

/**
 * TournamentMatch row (schema.prisma model TournamentMatch, lines 698-737):
 * one bracket slot. redEntryId/blueEntryId reference TournamentEntry.id
 * (resolved to a display name client-side via [TournamentDetailDto.entries]
 * — the server does not denormalize names onto the match row itself).
 *
 * NOTE: the Prisma model has NO score column (Damath-style redScore/blueScore
 * belongs to a different model entirely) — only redEntryId/blueEntryId,
 * matchId (an optional link to the real Match row once the admin reports a
 * result), winnerEntryId, and status. The mockup's "aScore"/"bScore" fields
 * are therefore NOT populated from a real field — see TournamentDetailScreen
 * kdoc for how the UI represents a match honestly without a fabricated score.
 */
@Serializable
data class TournamentMatchDto(
    val id: String,
    val round: Int,
    val slot: Int,
    val bracket: String = "W",
    val redEntryId: String? = null,
    val blueEntryId: String? = null,
    val matchId: String? = null,
    val winnerEntryId: String? = null,
    val status: String = "pending" // pending | ready | done
)

@Serializable
data class TournamentJoinResponse(
    val id: String,
    val seed: Int? = null,
    val eliminated: Boolean = false,
    val placement: Int? = null
)

@Serializable
data class TournamentLeaveResponse(
    val left: Boolean = true
)
