package com.filipinodama.app.data.rooms

import com.filipinodama.app.data.engine.GameSettings
import com.filipinodama.app.data.engine.PieceColor
import kotlinx.serialization.Serializable

/**
 * Wire-format payloads for the Socket.IO private-room protocol, matching
 * apps/server/src/realtime/rooms.ts EXACTLY field-for-field (verified against
 * server source during Phase 4 research). Server -> client shapes here;
 * client -> server emits are built inline in [RoomRepository] since they're
 * simple (code / userId / settings patch).
 */

/** publicMember() shape — a room member as broadcast by the server. */
@Serializable
data class RoomMemberDto(
    val userId: String,
    val name: String,
    val avatarUrl: String? = null,
    val tag: String = ""
)

/**
 * The full EV.roomState snapshot (roomState() in rooms.ts). The server also
 * reuses this same event name for four narrower status payloads (error /
 * closed / kicked / banned) — see [RoomStatePayload] for the sealed decode.
 */
@Serializable
data class RoomStateDto(
    val code: String,
    val hostId: String,
    val host: RoomMemberDto,
    val guest: RoomMemberDto? = null,
    val spectators: List<RoomMemberDto> = emptyList(),
    val settings: GameSettings,
    /** "PRIVATE" | "RANKED" (PrismaMatchMode) — rooms only ever use PRIVATE today. */
    val mode: String,
    val matchId: String? = null,
    /** Host toggled "Lock the room" — while true the server rejects new joiners. */
    val locked: Boolean = false
)

/** EV.roomStart payload — server -> host/guest/spectators once the host starts. */
@Serializable
data class RoomStartDto(
    val matchId: String,
    val yourColor: PieceColor? = null
)

/** Raw "room:chat" relay payload (literal string event, not in EV — verified in rooms.ts). */
@Serializable
data class RoomChatDto(
    val from: RoomMemberDto,
    val body: String,
    val at: Long = 0
)

// ---- client -> server emit payloads ----

@Serializable
data class RoomCreateRequest(val mode: String? = null)

@Serializable
data class RoomCodeRequest(val code: String)

@Serializable
data class RoomSettingsRequest(val settings: GameSettings)

@Serializable
data class RoomLockRequest(val locked: Boolean)

@Serializable
data class RoomUserRequest(val userId: String)

@Serializable
data class RoomChatRequest(val body: String)

// ---- REST payloads ----

/** GET /api/rooms/mine response. */
@Serializable
data class RoomsMineResponse(val code: String? = null)

/** One player entry inside a /api/matches/live item (matches.ts roomPlayer() / playerSelect). */
@Serializable
data class LiveMatchPlayerDto(
    val id: String,
    val username: String,
    val displayName: String,
    val tag: String = "",
    val avatarUrl: String? = null,
    val trophies: Int = 0
)

/**
 * One row of GET /api/matches/live's `items` array. Covers BOTH shapes the
 * endpoint returns: a plain live Match, and a synthetic open-room entry
 * (`room=true`, `code` present) — see matches.ts roomItems/matchItems. Every
 * field the union might carry is declared nullable/defaulted so a single DTO
 * decodes either shape without a custom deserializer.
 */
@Serializable
data class LiveMatchItemDto(
    val id: String,
    val mode: String,
    val red: LiveMatchPlayerDto? = null,
    val blue: LiveMatchPlayerDto? = null,
    val moveCount: Int = 0,
    val startedAt: String? = null,
    val viewers: Int = 0,
    val room: Boolean = false,
    val code: String? = null
)

@Serializable
data class LiveMatchesResponse(
    val items: List<LiveMatchItemDto> = emptyList(),
    val liveCount: Int = 0
)
