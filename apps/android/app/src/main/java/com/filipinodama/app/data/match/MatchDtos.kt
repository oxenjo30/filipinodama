package com.filipinodama.app.data.match

import com.filipinodama.app.data.engine.GameResult
import com.filipinodama.app.data.engine.GameSettings
import com.filipinodama.app.data.engine.GameState
import com.filipinodama.app.data.engine.Move
import com.filipinodama.app.data.engine.PieceColor
import kotlinx.serialization.Serializable

/**
 * Wire-format payloads for the Socket.IO match/matchmaking protocol, matching
 * apps/server/src/realtime/match.ts + matchmaking.ts EXACTLY field-for-field
 * (verified against server source during Phase 3 research — see PR
 * description for citations). All server → client shapes here; client →
 * server emits are built inline in [com.filipinodama.app.data.match.MatchRepository]
 * since they're simple (matchId + move, or matchId alone).
 */

@Serializable
data class PublicUserDto(
    val id: String,
    val username: String,
    val displayName: String,
    val tag: String,
    val avatarUrl: String? = null,
    val trophies: Int = 0,
    val rankTier: String = "",
    val skin: String? = null,
    val frameId: String? = null,
    /** "mobile" | "web" | "tablet" — UA-classified server-side at handshake time. */
    val device: String? = null
)

/** EV.mmFound payload. */
@Serializable
data class MmFoundDto(
    val matchId: String,
    val opponent: PublicUserDto? = null,
    val yourColor: PieceColor,
    val settings: GameSettings
)

/** EV.mmSearching payload. */
@Serializable
data class MmSearchingDto(val mode: String)

/** EV.mmCancelled payload. */
@Serializable
data class MmCancelledDto(val reason: String? = null)

/** EV.matchState payload — sent on resync AND spectate-join. */
@Serializable
data class MatchStateDto(
    val matchId: String,
    val state: GameState,
    val yourColor: PieceColor? = null,
    val settings: GameSettings? = null
)

/** EV.matchMoved payload. */
@Serializable
data class MatchMovedDto(
    val matchId: String,
    val move: Move,
    val state: GameState
)

/**
 * EV.matchIllegal payload. `matchId` is sometimes entirely absent from the
 * server's emit (the "bad-request" case) — kept nullable so decode never
 * crashes. `reason` is one of: bad-request | no-such-match | not-a-player |
 * match-over | not-your-turn | illegal-move.
 */
@Serializable
data class MatchIllegalDto(
    val matchId: String? = null,
    val reason: String? = null
)

/** EV.matchEnded payload. */
@Serializable
data class MatchEndedDto(
    val matchId: String? = null,
    val result: GameResult,
    val winnerId: String? = null,
    val loserId: String? = null,
    val redTrophyDelta: Int = 0,
    val blueTrophyDelta: Int = 0,
    val goldReward: Int = 0,
    /**
     * NULLABLE on purpose. The server's stranded-match sweeper emits an explicit
     * `state: null` when closing a match whose Redis state is already gone
     * (apps/server/src/realtime/match.ts). A Kotlin default only covers a
     * MISSING key — not an explicit null — so a non-null type made the entire
     * payload fail to deserialize. The event was then swallowed by decode()'s
     * catch and the board froze on "Opponent's move..." with no result card and
     * no timeout (the 8s loader escape only applies when gameState is null).
     * The web client already tolerates this; Android did not.
     */
    val state: GameState? = null
)

/** EV.matchChat payload (server relay, broadcast to room). */
@Serializable
data class MatchChatDto(
    val matchId: String,
    val from: String,
    val color: PieceColor,
    val body: String? = null,
    val emote: String? = null,
    val at: Long = 0,
    /**
     * The sender's client-generated id, echoed back by the server so the sender
     * can reconcile the message they already rendered optimistically instead of
     * rendering it twice. Null on messages from anyone else.
     */
    val nonce: String? = null
)

/** EV.spectateCount payload. */
@Serializable
data class SpectateCountDto(val matchId: String, val viewers: Int)

/** EV.matchRematchOffer / matchRematchDecline (server -> opponent). */
@Serializable
data class RematchSignalDto(val fromMatchId: String, val by: String)

/** EV.matchRematchReady (server -> both: new match seeded). */
@Serializable
data class RematchReadyDto(val matchId: String, val yourColor: PieceColor)
