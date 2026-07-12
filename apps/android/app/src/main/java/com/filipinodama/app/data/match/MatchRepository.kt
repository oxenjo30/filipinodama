package com.filipinodama.app.data.match

import com.filipinodama.app.data.ApiClient
import com.filipinodama.app.data.SocketClient
import com.filipinodama.app.data.engine.GameResult
import com.filipinodama.app.data.engine.GameState
import com.filipinodama.app.data.engine.MatchEndReasons
import com.filipinodama.app.data.engine.PieceColor
import com.filipinodama.app.data.engine.Rules
import com.filipinodama.app.data.engine.Square
import io.socket.client.Manager
import io.socket.client.Socket
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * MatchRepository — Android's server-authoritative online-match client,
 * mirroring apps/web/src/stores/onlineStore.ts EXACTLY: same event wiring,
 * same "client only sends move intents, server drives every state change"
 * contract, same matchIllegal no-such-match honest-interrupted-end handling,
 * same 1.8s Match Found reveal before resync. Singleton-object + StateFlow,
 * matching this scaffold's AuthRepository convention rather than a DI
 * framework or ViewModel.
 *
 * The Kotlin [Rules] helper is used ONLY to compute tap-target highlights
 * from the server's authoritative [GameState] — never to decide legality or
 * apply a move locally. Every real state transition comes from a server
 * event (matchState / matchMoved / matchEnded / matchResync's reply).
 */
object MatchRepository {

    /** Identical constant to onlineStore.ts's MATCH_FOUND_REVEAL_MS. */
    const val MATCH_FOUND_REVEAL_MS = 1800L

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private val _state = MutableStateFlow(MatchUiState())
    val state: StateFlow<MatchUiState> = _state.asStateFlow()

    private var wired = false
    private var socket: Socket? = null

    /** Injectable delay hook so tests can run the mmFound -> resync timer
     *  synchronously instead of waiting 1.8 real seconds or needing a Looper. */
    var scheduler: (Long, () -> Unit) -> Unit = { delayMs, action ->
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(action, delayMs)
    }

    // ---- event names (packages/shared/src/events.ts, verified verbatim) ----
    private object EV {
        const val mmJoin = "mm:join"
        const val mmLeave = "mm:leave"
        const val mmSearching = "mm:searching"
        const val mmFound = "mm:found"
        const val mmCancelled = "mm:cancelled"
        const val matchState = "match:state"
        const val matchMove = "match:move"
        const val matchMoved = "match:moved"
        const val matchIllegal = "match:illegal"
        const val matchResign = "match:resign"
        const val matchEnded = "match:ended"
        const val matchResync = "match:resync"
        const val matchRematchOffer = "match:rematch:offer"
        const val matchRematchDecline = "match:rematch:decline"
        const val matchRematchReady = "match:rematch:ready"
        const val matchChat = "match:chat"
        const val spectateJoin = "spectate:join"
        const val spectateLeave = "spectate:leave"
        const val spectateCount = "spectate:count"
    }

    private fun ensureConnected(): Socket {
        val existing = socket
        if (existing != null && existing.connected()) return existing
        val s = SocketClient.connect(ApiClient.okHttpClient) ?: error("Could not create socket")
        socket = s
        wire(s)
        return s
    }

    /** Attach every event listener exactly once per socket instance. */
    private fun wire(s: Socket) {
        if (wired) return
        wired = true

        s.on(EV.mmSearching) {
            _state.update { it.copy(status = MatchStatus.SEARCHING, error = null) }
        }

        s.on(EV.mmFound) { args ->
            val payload = decode<MmFoundDto>(args) ?: return@on
            _state.update {
                it.copy(
                    status = MatchStatus.FOUND,
                    matchId = payload.matchId,
                    myColor = payload.yourColor,
                    opponent = payload.opponent,
                    end = null,
                    chat = emptyList(),
                    offeredByMe = false,
                    offeredByOpponent = false,
                    rematchDeclined = false
                )
            }
            scheduler(MATCH_FOUND_REVEAL_MS) {
                if (_state.value.matchId == payload.matchId) {
                    emitPayload(EV.matchResync, MatchIdRequest(payload.matchId))
                }
            }
        }

        s.on(EV.mmCancelled) { args ->
            val payload = decode<MmCancelledDto>(args)
            _state.update {
                it.copy(status = MatchStatus.IDLE, error = if (payload?.reason == "left") null else payload?.reason)
            }
        }

        s.on(EV.matchState) { args ->
            val payload = decode<MatchStateDto>(args) ?: return@on
            _state.update { st ->
                val myColor = payload.yourColor ?: st.myColor
                st.copy(
                    status = MatchStatus.PLAYING,
                    matchId = payload.matchId,
                    gameState = payload.state,
                    myColor = myColor,
                    selected = null,
                    connectionLost = false
                ).withHighlights()
            }
        }

        s.on(Socket.EVENT_DISCONNECT) {
            val st = _state.value
            if (st.matchId != null && (st.status == MatchStatus.PLAYING || st.status == MatchStatus.FOUND)) {
                _state.update { it.copy(connectionLost = true) }
            }
        }

        // Manager-level reconnect (mirrors onlineStore.ts's `s.io.on("reconnect", ...)`)
        // — fired by socket.io-client's own backoff/retry loop, not a custom one.
        s.io().on(Manager.EVENT_RECONNECT) {
            val id = _state.value.matchId
            if (id != null) emitPayload(EV.matchResync, MatchIdRequest(id))
            _state.update { it.copy(connectionLost = false) }
        }

        s.on(EV.matchMoved) { args ->
            val payload = decode<MatchMovedDto>(args) ?: return@on
            _state.update { st -> st.copy(gameState = payload.state, selected = null).withHighlights() }
        }

        s.on(EV.matchIllegal) { args ->
            val payload = decode<MatchIllegalDto>(args)
            if (payload?.reason == "no-such-match") {
                _state.update { st ->
                    st.copy(
                        selected = null,
                        connectionLost = false,
                        error = null,
                        status = MatchStatus.ENDED,
                        end = st.end ?: MatchEndInfo(
                            result = GameResult(winner = "draw", reason = MatchEndReasons.ABANDON),
                            winnerId = null,
                            redTrophyDelta = 0,
                            blueTrophyDelta = 0,
                            goldReward = 0,
                            interrupted = true
                        )
                    ).withHighlights()
                }
                return@on
            }
            _state.update { st -> st.copy(selected = null, error = payload?.reason).withHighlights() }
        }

        s.on(EV.matchEnded) { args ->
            val payload = decode<MatchEndedDto>(args) ?: return@on
            _state.update {
                it.copy(
                    status = MatchStatus.ENDED,
                    gameState = payload.state,
                    end = MatchEndInfo(
                        result = payload.result,
                        winnerId = payload.winnerId,
                        redTrophyDelta = payload.redTrophyDelta,
                        blueTrophyDelta = payload.blueTrophyDelta,
                        goldReward = payload.goldReward,
                        interrupted = false
                    ),
                    selected = null,
                    moveTargets = emptyList(),
                    captureTargets = emptyList()
                )
            }
        }

        s.on(EV.matchChat) { args ->
            val payload = decode<MatchChatDto>(args) ?: return@on
            _state.update { st ->
                if (st.matchId != null && payload.matchId != st.matchId) return@update st
                val msg = ChatMsg(
                    id = "${payload.at}-${payload.from}-${st.chat.size}",
                    mine = st.myColor != null && payload.color == st.myColor,
                    color = payload.color,
                    body = payload.body,
                    emote = payload.emote,
                    at = payload.at
                )
                st.copy(chat = st.chat + msg)
            }
        }

        s.on(EV.spectateCount) { args ->
            val payload = decode<SpectateCountDto>(args) ?: return@on
            _state.update { st -> if (st.matchId != null && payload.matchId == st.matchId) st.copy(viewers = payload.viewers) else st }
        }

        s.on(EV.matchRematchOffer) { args ->
            val payload = decode<RematchSignalDto>(args) ?: return@on
            _state.update { st ->
                if (st.matchId != null && payload.fromMatchId != st.matchId) st
                else st.copy(offeredByOpponent = true, rematchDeclined = false)
            }
        }

        s.on(EV.matchRematchReady) { args ->
            val payload = decode<RematchReadyDto>(args) ?: return@on
            _state.update {
                MatchUiState(
                    status = MatchStatus.PLAYING,
                    matchId = payload.matchId,
                    myColor = payload.yourColor,
                    opponent = it.opponent
                )
            }
            emitPayload(EV.matchResync, MatchIdRequest(payload.matchId))
        }

        s.on(EV.matchRematchDecline) { args ->
            val payload = decode<RematchSignalDto>(args) ?: return@on
            _state.update { st ->
                if (st.matchId != null && payload.fromMatchId != st.matchId) st
                else st.copy(offeredByMe = false, offeredByOpponent = false, rematchDeclined = true)
            }
        }
    }

    // ---- public actions (mirror onlineStore.ts's exported actions 1:1) ----

    fun joinQueue(mode: String, colorPref: String = "either") {
        _state.update { it.copy(status = MatchStatus.SEARCHING, error = null, end = null) }
        try {
            ensureConnected()
            emitPayload(EV.mmJoin, MmJoinRequest(mode, colorPref))
        } catch (e: Exception) {
            _state.update { it.copy(status = MatchStatus.IDLE, error = "Could not connect. Are you logged in?") }
        }
    }

    fun leaveQueue() {
        runCatching { socket?.emit(EV.mmLeave) }
        _state.update { it.copy(status = MatchStatus.IDLE) }
    }

    fun resync() {
        val id = _state.value.matchId ?: return
        try {
            ensureConnected()
            emitPayload(EV.matchResync, MatchIdRequest(id))
        } catch (_: Exception) {
            /* server will resend match:state on its own retry path if reachable */
        }
    }

    fun spectate(matchId: String) {
        _state.update { MatchUiState(status = MatchStatus.PLAYING, matchId = matchId, myColor = null) }
        try {
            ensureConnected()
            emitPayload(EV.spectateJoin, MatchIdRequest(matchId))
        } catch (_: Exception) {
            _state.update { it.copy(error = "Could not connect. Are you logged in?") }
        }
    }

    /**
     * Hand off from a private room's EV.roomStart into the match view, mirroring
     * roomStore.ts's `s.on(EV.roomStart, ...)` handler: the server has already
     * seeded a real match and joined our socket to its room, so this resets
     * MatchUiState to a fresh PLAYING/spectating shell and asks the server to
     * resync the opening state. [yourColor] null means we're a SPECTATOR
     * (read-only); a color means we're a player.
     */
    fun enterFromRoom(matchId: String, yourColor: PieceColor?, opponent: PublicUserDto?) {
        _state.value = MatchUiState(
            status = MatchStatus.PLAYING,
            matchId = matchId,
            myColor = yourColor,
            opponent = opponent
        )
        try {
            ensureConnected()
            emitPayload(EV.matchResync, MatchIdRequest(matchId))
        } catch (_: Exception) {
            _state.update { it.copy(error = "Could not connect. Are you logged in?") }
        }
    }

    /**
     * Best-effort opponent identity hint for a room-originated match, using the
     * room's cached member fields (name/tag/avatar — no trophies/rankTier, same
     * limitation roomStore.ts documents with a follow-up TODO). Only fills the
     * opponent in if one hasn't already arrived some other way.
     */
    fun setRoomOpponentHint(userId: String, name: String, tag: String, avatarUrl: String?) {
        _state.update { st ->
            if (st.opponent != null) return@update st
            st.copy(
                opponent = PublicUserDto(
                    id = userId,
                    username = name,
                    displayName = name,
                    tag = tag,
                    avatarUrl = avatarUrl,
                    trophies = 0,
                    rankTier = "squire"
                )
            )
        }
    }

    fun onSquareClick(square: Square) {
        val st = _state.value
        val gs = st.gameState ?: return
        val myColor = st.myColor ?: return
        if (gs.result != null) return
        if (gs.turn != myColor) return

        val selected = st.selected
        if (selected != null) {
            val options = Rules.legalMoves(gs).filter { it.from.sameAs(selected) }
            val chosen = options.find { it.landing.sameAs(square) }
            if (chosen != null) {
                emitPayload(EV.matchMove, MatchMoveRequest(st.matchId, chosen))
                _state.update { it.copy(selected = null, moveTargets = emptyList(), captureTargets = emptyList()) }
                return
            }
        }

        val piece = gs.pieces.find { it.square.sameAs(square) }
        val canSelect = piece != null && piece.color == myColor && Rules.legalMoves(gs).any { it.from.sameAs(square) }
        _state.update { s ->
            if (canSelect) s.copy(selected = square).withHighlights() else s.copy(selected = null).withHighlights()
        }
    }

    fun resign() {
        val id = _state.value.matchId ?: return
        emitPayload(EV.matchResign, MatchIdRequest(id))
    }

    fun reset() {
        val cur = _state.value
        if (cur.matchId != null && cur.myColor == null) {
            runCatching { emitPayload(EV.spectateLeave, MatchIdRequest(cur.matchId)) }
        }
        _state.value = MatchUiState()
    }

    fun sendChat(body: String) {
        val text = body.trim()
        val id = _state.value.matchId
        if (text.isEmpty() || id == null) return
        runCatching { emitPayload(EV.matchChat, MatchChatRequest(matchId = id, body = text)) }
    }

    fun sendEmote(emote: String) {
        val id = _state.value.matchId
        if (emote.isEmpty() || id == null) return
        runCatching { emitPayload(EV.matchChat, MatchChatRequest(matchId = id, emote = emote)) }
    }

    fun offerRematch() {
        val id = _state.value.matchId ?: return
        try {
            emitPayload(EV.matchRematchOffer, MatchIdRequest(id))
            _state.update { it.copy(offeredByMe = true, rematchDeclined = false) }
        } catch (_: Exception) {
            _state.update { it.copy(error = "Couldn't reach the server.") }
        }
    }

    fun acceptRematch() = offerRematch()

    fun declineRematch() {
        val id = _state.value.matchId
        if (id != null) runCatching { emitPayload(EV.matchRematchDecline, MatchIdRequest(id)) }
        _state.update { it.copy(offeredByMe = false, offeredByOpponent = false) }
    }

    /** Test/teardown hook: drop all wiring and reset in-memory state. */
    fun hardReset() {
        wired = false
        socket = null
        _state.value = MatchUiState()
    }

    // ---- internals ----

    private inline fun <reified T> emitPayload(event: String, payload: T) {
        val s = socket ?: return
        val jsonString = json.encodeToString(payload)
        s.emit(event, org.json.JSONObject(jsonString))
    }

    private inline fun <reified T> decode(args: Array<Any>): T? {
        val raw = args.firstOrNull() ?: return null
        val jsonString = raw.toString()
        return try {
            json.decodeFromString<T>(jsonString)
        } catch (_: Exception) {
            null
        }
    }
}

enum class MatchStatus { IDLE, SEARCHING, FOUND, PLAYING, ENDED }

data class MatchEndInfo(
    val result: GameResult,
    val winnerId: String?,
    val redTrophyDelta: Int,
    val blueTrophyDelta: Int,
    val goldReward: Int,
    val interrupted: Boolean
)

data class ChatMsg(
    val id: String,
    val mine: Boolean,
    val color: PieceColor,
    val body: String?,
    val emote: String?,
    val at: Long
)

data class MatchUiState(
    val status: MatchStatus = MatchStatus.IDLE,
    val matchId: String? = null,
    val myColor: PieceColor? = null,
    val opponent: PublicUserDto? = null,
    val gameState: GameState? = null,
    val selected: Square? = null,
    val moveTargets: List<Square> = emptyList(),
    val captureTargets: List<Square> = emptyList(),
    val mustCapture: Boolean = false,
    val end: MatchEndInfo? = null,
    val error: String? = null,
    val connectionLost: Boolean = false,
    val chat: List<ChatMsg> = emptyList(),
    val offeredByMe: Boolean = false,
    val offeredByOpponent: Boolean = false,
    val rematchDeclined: Boolean = false,
    val viewers: Int? = null
) {
    /** Recomputes moveTargets/captureTargets/mustCapture from [gameState] +
     *  [selected] using the read-only Kotlin Rules helper — mirrors
     *  onlineStore.ts's derive(). Never used to decide what's SENT to the
     *  server, only what's highlighted. */
    fun withHighlights(): MatchUiState {
        val gs = gameState
        val color = myColor
        if (gs == null || color == null) {
            return copy(moveTargets = emptyList(), captureTargets = emptyList(), mustCapture = false)
        }
        val mine = gs.turn == color && gs.result == null
        val all = Rules.legalMoves(gs)
        val mustCapture = all.any { it.captures.isNotEmpty() }
        val moveTargets = mutableListOf<Square>()
        val captureTargets = mutableListOf<Square>()
        if (mine && selected != null) {
            for (m in all.filter { it.from.sameAs(selected) }) {
                if (m.captures.isNotEmpty()) captureTargets.add(m.landing) else moveTargets.add(m.landing)
            }
        }
        return copy(moveTargets = moveTargets, captureTargets = captureTargets, mustCapture = mustCapture)
    }
}
