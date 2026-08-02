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
    /** The MatchMode this Cup's games actually run as (admin-set; CASUAL default).
     *  Carried through to the online-match screen so a RANKED Cup shows the ranked
     *  chrome and its trophy delta on the end card — otherwise every tournament
     *  game would read "CASUAL MATCH" regardless of what is really at stake. */
    val matchMode: String = "CASUAL",
    val entries: List<TournamentEntryDto> = emptyList(),
    val bracket: Map<String, List<TournamentMatchDto>> = emptyMap(),
    val myEntry: TournamentMyEntryDto? = null,
    /** The signed-in player's current playable slot, or null (see
     *  [TournamentMyMatchDto]). Served here as well as pushed over
     *  "tournament:matchState" so the screen is right on a cold load. */
    val myMatch: TournamentMyMatchDto? = null
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

/**
 * The signed-in player's ONE unresolved slot in a running Cup — the payload
 * behind the "Your Match" card (apps/server/src/realtime/tournament-live.ts,
 * type TournamentMyMatch). Identical shape on GET /api/tournaments/:id and on
 * the "tournament:matchState" push, so one renderer handles both.
 *
 * [deadlineAt] is non-null once EITHER player has readied: it is the no-show
 * clock, and there is deliberately NO un-ready (see TournamentLiveRepository).
 * [matchId] is non-null once the match is live — the player belongs on the
 * board, not on this card.
 */
@Serializable
data class TournamentMyMatchDto(
    val tournamentId: String,
    val tmId: String,
    val round: Int = 0,
    val bracket: String = "W",
    val roundLabel: String = "",
    val opponent: TournamentOpponentDto? = null,
    val iAmReady: Boolean = false,
    val opponentReady: Boolean = false,
    val deadlineAt: String? = null, // ISO-8601
    val matchId: String? = null,
    val yourColor: String = "red" // red | blue
)

@Serializable
data class TournamentOpponentDto(
    val userId: String,
    val username: String,
    val tag: String = "",
    val avatarUrl: String? = null,
    val frameId: String? = null
)

/** "tournament:ready" — client → server. There is no matching un-ready event. */
@Serializable
data class TournamentReadyRequest(
    val tmId: String
)

/** "tournament:start" — the server created and seeded the match; go play. */
@Serializable
data class TournamentStartDto(
    val tournamentId: String = "",
    val tmId: String = "",
    val matchId: String,
    val yourColor: String = "red"
)

/** The `{error:{code,message}}` variant of a "tournament:matchState" push —
 *  same envelope shape as the REST errors, so message mapping is shared. */
data class TournamentReadyError(val code: String, val message: String)

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
