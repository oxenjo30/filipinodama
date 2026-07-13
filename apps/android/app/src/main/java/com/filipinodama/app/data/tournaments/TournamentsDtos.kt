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
