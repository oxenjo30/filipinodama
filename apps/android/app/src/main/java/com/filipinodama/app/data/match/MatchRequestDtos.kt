package com.filipinodama.app.data.match

import com.filipinodama.app.data.engine.Move
import kotlinx.serialization.Serializable

/**
 * Client -> server emit payloads (typed so kotlinx.serialization can encode
 * them, then bridged into org.json for socket.io-client — see
 * [MatchJsonBridge]). Field shapes verified against apps/server/src/realtime/
 * match.ts + matchmaking.ts during Phase 3 research.
 */

@Serializable
data class MmJoinRequest(val mode: String, val colorPref: String)

@Serializable
data class MatchIdRequest(val matchId: String)

@Serializable
data class MatchMoveRequest(val matchId: String?, val move: Move)

@Serializable
data class MatchChatRequest(
    val matchId: String,
    val body: String? = null,
    val emote: String? = null,
    /** Client-generated id the server echoes back, so we can reconcile our
     *  optimistic render rather than showing the message twice. */
    val nonce: String? = null,
)
