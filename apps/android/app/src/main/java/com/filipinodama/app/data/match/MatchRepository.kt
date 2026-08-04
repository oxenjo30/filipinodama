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

    /**
     * The socket instance our listeners are currently attached to — NOT a
     * boolean. A plain `wired` flag was a defect: [SocketClient] could hand back
     * a different Socket, and the flag then suppressed wiring on it, leaving the
     * new instance with no listeners for the rest of the process.
     */
    private var wiredSocket: Socket? = null
    private var socket: Socket? = null

    /**
     * Bumped on every join / leave / found so a join-ack watchdog can tell
     * whether it is still the CURRENT search before it tears anything down.
     */
    private var joinAckToken: Int = 0

    /** Injectable delay hook so tests can run the mmFound -> resync timer
     *  synchronously instead of waiting 1.8 real seconds or needing a Looper. */
    var scheduler: (Long, () -> Unit) -> Unit = { delayMs, action ->
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(action, delayMs)
    }

    /**
     * How long to wait for the server's mm:searching ACK before declaring the
     * join lost. Comfortably above a normal handshake, and well UNDER the
     * server's 7-20s bot-fill window so a player never sits past the point an
     * AI would have arrived anyway.
     */
    private val JOIN_ACK_TIMEOUT_MS = 6_000L

    private val JOIN_FAILED_MESSAGE =
        "Couldn't reach the game server. Check your connection and try again."

    /**
     * How long to sit in a SEARCHING state before re-asking the server.
     *
     * The join-ack watchdog above only covers the window BEFORE mm:searching
     * arrives — receiving it bumps joinAckToken and disarms the watchdog for
     * good. After that the client has no timer at all, so anything that goes
     * wrong with the later mm:found leaves us on "Finding an opponent" forever:
     * no error, no timeout, nothing logged. That is the exact silent-forever
     * shape behind the 2026-08-04 reports, and `decode(...) ?: return@on` below
     * is one way to enter it.
     *
     * So we re-send mm:join once per SEARCHING period. The server answers
     * "you're already in a game" first (matchmaking.ts deliverExistingMatch), so
     * a recovery costs the queue nothing; only a genuinely-unqueued player is
     * re-queued. MUST stay longer than the server's BOT_FILL_MAX_MS (20s),
     * because re-joining cancels and reschedules the pending bot-fill — a
     * shorter period could push the bot back indefinitely. Mirrors the web
     * client's SEARCH_RETRY_MS.
     *
     * Armed once per mm:searching rather than self-rescheduling: re-sending
     * mm:join produces another mm:searching, which arms the next one. That keeps
     * it self-sustaining without a recursive timer that a synchronous test
     * scheduler would spin forever.
     */
    private val SEARCH_RETRY_MS = 25_000L
    private var searchRetryToken: Int = 0

    /** The queue we last asked for, so a retry can re-send the same request. */
    private var lastQueueRequest: MmJoinRequest? = null

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

    /**
     * Attach every event listener exactly once PER SOCKET INSTANCE.
     *
     * Keyed on identity, not a boolean: if [SocketClient] ever hands back a new
     * Socket (only after an explicit disconnect, but be defensive), we must
     * re-attach rather than assume the old wiring carried over.
     *
     * The per-event [Socket.off] calls make re-wiring idempotent. They name
     * their event deliberately — the socket is SHARED with rooms, DM, presence,
     * notifications and guild chat, so a bare `s.off()` here would silently
     * deafen all of them.
     */
    private fun wire(s: Socket) {
        if (wiredSocket === s) return
        wiredSocket = s

        listOf(
            EV.mmSearching, EV.mmFound, EV.mmCancelled, EV.matchState,
            EV.matchMoved, EV.matchIllegal, EV.matchEnded, EV.matchChat,
            EV.spectateCount, EV.matchRematchOffer, EV.matchRematchReady,
            EV.matchRematchDecline
        ).forEach { s.off(it) }

        s.on(EV.mmSearching) {
            // The server ACK. Invalidating the token here is what distinguishes a
            // real search from the optimistic one that stranded players in v55.
            joinAckToken += 1
            // ...but that also disarms the only timer we had. Arm the search
            // retry so a later lost/undecodable mm:found can't strand us silently.
            armSearchRetry()
            _state.update { it.copy(status = MatchStatus.SEARCHING, error = null) }
        }

        s.on(EV.mmFound) { args ->
            val payload = decode<MmFoundDto>(args) ?: return@on
            joinAckToken += 1 // matched — no watchdog may fire after this
            cancelSearchRetry()
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
            // Only "left" is the player choosing to stop. Any other reason is the
            // server cancelling a search we still believe we're in, so keep the
            // retry armed and let it re-join rather than dropping to IDLE with a
            // reason string the matchmaking screen doesn't surface. Mirrors the
            // web client's mmCancelled handling.
            val recoverable = payload?.reason != "left" && lastQueueRequest != null
            if (recoverable) {
                armSearchRetry()
                _state.update { it.copy(status = MatchStatus.SEARCHING, error = null) }
            } else {
                cancelSearchRetry()
                _state.update {
                    it.copy(status = MatchStatus.IDLE, error = if (payload?.reason == "left") null else payload?.reason)
                }
            }
        }

        s.on(EV.matchState) { args ->
            val payload = decode<MatchStateDto>(args) ?: return@on
            _state.update { st -> applyMatchState(st, payload) }
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
            _state.update { st -> applyMatchMoved(st, payload) }
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
            // Server rejected the move — ROLL BACK our optimistic apply to the
            // pre-move state (latency fix #1). Common benign reasons here are a
            // race (opponent moved / match ended between our tap and the server
            // seeing it); the rollback + the authoritative state keep us in sync.
            _state.update { st ->
                val rolledBack = st.pendingBaseState ?: st.gameState
                st.copy(
                    gameState = rolledBack,
                    selected = null,
                    pendingBaseState = null,
                    pendingMove = false,
                    error = payload?.reason
                ).withHighlights()
            }
        }

        s.on(EV.matchEnded) { args ->
            val payload = decode<MatchEndedDto>(args) ?: return@on
            _state.update { st -> applyMatchEnded(st, payload) }
        }

        s.on(EV.matchChat) { args ->
            val payload = decode<MatchChatDto>(args) ?: return@on
            _state.update { st -> applyMatchChat(st, payload) }
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

    /**
     * Join a matchmaking queue.
     *
     * OWNER-REPORTED (v55): "Quick Match sat on Finding opponent for well over
     * 20s and never matched an AI", for casual AND ranked. Confirmed against
     * production Redis WHILE the player was searching: rt:mmq:CASUAL and
     * rt:mmq:RANKED were both empty, no rt:queuedIn:<user> key existed, and no
     * bot-fill job was pending — the server had no idea anyone was queued. The
     * 7-20s bot fallback is armed only by a join the server actually receives
     * (matchmaking.ts), so no AI could ever arrive.
     *
     * The defect is that SEARCHING was purely optimistic: the status flipped
     * before anything was sent, and nothing ever required the server to confirm
     * it. The server DOES acknowledge a successful join with mm:searching, and
     * this repository already listens for it — it just never insisted on it. So
     * a join that failed to land (socket still handshaking, handshake rejected,
     * emit buffered on a socket that never completes CONNECT) left the player on
     * an eternal spinner with no error and no way to know it had failed.
     *
     * Deliberately fixed AT THE ACK rather than by guessing the transport-level
     * cause: whichever of those it is, an unacknowledged join is not a search
     * and must not be displayed as one. The emit result is now honoured too,
     * matching sendMove and resign — this call site was missed when those were
     * given the same treatment in versionCode 53.
     */
    fun joinQueue(mode: String, colorPref: String = "either") {
        _state.update { it.copy(status = MatchStatus.SEARCHING, error = null, end = null) }
        joinAckToken += 1
        val token = joinAckToken
        val request = MmJoinRequest(mode, colorPref)
        lastQueueRequest = request // so a search retry can re-send the same ask
        try {
            ensureConnected()
            if (!emitPayload(EV.mmJoin, request)) {
                lastQueueRequest = null
                cancelSearchRetry()
                _state.update { it.copy(status = MatchStatus.IDLE, error = JOIN_FAILED_MESSAGE) }
                return
            }
            armJoinAckWatchdog(token)
        } catch (e: Exception) {
            lastQueueRequest = null
            cancelSearchRetry()
            _state.update { it.copy(status = MatchStatus.IDLE, error = "Could not connect. Are you logged in?") }
        }
    }

    /**
     * Re-ask the server for a match if we are still SEARCHING in
     * [SEARCH_RETRY_MS]. Single-shot: the resulting mm:searching arms the next
     * one, so the loop sustains itself without a self-rescheduling timer.
     * [searchRetryToken] invalidates any in-flight retry when we match, leave, or
     * re-join, so a stale timer can never re-queue a player who has moved on.
     */
    private fun armSearchRetry() {
        searchRetryToken += 1
        val token = searchRetryToken
        scheduler(SEARCH_RETRY_MS) {
            if (token != searchRetryToken) return@scheduler
            if (_state.value.status != MatchStatus.SEARCHING) return@scheduler
            val request = lastQueueRequest ?: return@scheduler
            emitPayload(EV.mmJoin, request)
        }
    }

    /** Invalidate any pending search retry (matched, cancelled, or left). */
    private fun cancelSearchRetry() {
        searchRetryToken += 1
    }

    /**
     * Stop pretending we are searching if the server never acknowledged the join.
     *
     * [token] guards against a stale watchdog: re-joining, leaving, or a match
     * being found all bump [joinAckToken], so an older timer can never tear down
     * a newer, healthy search.
     */
    private fun armJoinAckWatchdog(token: Int) {
        scheduler(JOIN_ACK_TIMEOUT_MS) {
            if (token != joinAckToken) return@scheduler
            // Only fires while STILL un-acknowledged: mm:searching and mm:found
            // both bump the token, and FOUND/PLAYING must never be torn down.
            if (_state.value.status != MatchStatus.SEARCHING) return@scheduler
            _state.update { it.copy(status = MatchStatus.IDLE, error = JOIN_FAILED_MESSAGE) }
            runCatching { socket?.emit(EV.mmLeave) }
        }
    }

    fun leaveQueue() {
        joinAckToken += 1 // cancelled by the player — the watchdog must not fire
        cancelSearchRetry()
        lastQueueRequest = null
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
                // Optimistic apply (latency fix #1): render OUR move immediately
                // using the same engine the server uses, so the board never
                // freezes for the round-trip. Stash the pre-move state to roll
                // back to if the server rejects it (matchIllegal); the server's
                // matchMoved echo replaces this with the authoritative state.
                // Guard: don't optimistically stack a second move while one is
                // still in flight (wait for the echo first).
                if (st.pendingMove) return
                val optimistic = runCatching { Rules.applyMove(gs, chosen) }.getOrNull()
                // Emit FIRST and only fake success if it actually left. Applying
                // the optimistic move after a silently-dropped emit was the worst
                // version of this bug: the board advanced, "Sending move…" stuck
                // forever, and the move clock forfeited the player for a move the
                // server never saw.
                if (!emitPayload(EV.matchMove, MatchMoveRequest(st.matchId, chosen))) {
                    _state.update {
                        it.copy(
                            selected = null,
                            error = "Couldn't reach the server. Tap the square again.",
                        ).withHighlights()
                    }
                    return
                }
                st.matchId?.let { armPendingMoveWatchdog(it) }
                _state.update {
                    if (optimistic != null) {
                        it.copy(
                            gameState = optimistic,
                            pendingBaseState = gs, // roll-back target
                            pendingMove = true,
                            selected = null
                        ).withHighlights()
                    } else {
                        // Local apply failed (shouldn't happen for a legal move) —
                        // fall back to the old behavior: just clear + await echo.
                        it.copy(selected = null, moveTargets = emptyList(), captureTargets = emptyList())
                    }
                }
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
        // Make sure we HAVE a socket before emitting — resign used to fail
        // silently when the field was stale, so the dialog closed, nothing was
        // sent, and the player lost on the move clock believing they'd resigned.
        runCatching { ensureConnected() }
        if (!emitPayload(EV.matchResign, MatchIdRequest(id))) {
            _state.update { it.copy(error = "Couldn't reach the server. You're still in the match.") }
        }
    }

    fun reset() {
        val cur = _state.value
        if (cur.matchId != null && cur.myColor == null) {
            runCatching { emitPayload(EV.spectateLeave, MatchIdRequest(cur.matchId)) }
        }
        _state.value = MatchUiState()
    }

    /**
     * Send a chat message, rendering it IMMEDIATELY.
     *
     * Previously this only emitted, and the message appeared once the server
     * echoed match:chat back — a full round trip before you saw your own text.
     * On a laggy connection that reads as the chat box being broken. Moves got
     * optimistic application in v51; chat did not.
     *
     * We now append locally with a nonce, and [applyMatchChat] reconciles the
     * echo against it. If the emit fails outright we mark the message failed
     * rather than leaving a message that looks sent.
     */
    fun sendChat(body: String) {
        val text = body.trim()
        val id = _state.value.matchId
        if (text.isEmpty() || id == null) return
        val nonce = newNonce()
        _state.update { st ->
            st.copy(chat = st.chat.appendCapped(ChatMsg(
                id = nonce, mine = true, color = st.myColor ?: "", body = text,
                emote = null, at = System.currentTimeMillis(), nonce = nonce, pending = true,
            )))
        }
        val sent = runCatching {
            emitPayload(EV.matchChat, MatchChatRequest(matchId = id, body = text, nonce = nonce))
        }.isSuccess
        if (!sent) markChatFailed(nonce)
    }

    fun sendEmote(emote: String) {
        val id = _state.value.matchId
        if (emote.isEmpty() || id == null) return
        val nonce = newNonce()
        _state.update { st ->
            st.copy(chat = st.chat.appendCapped(ChatMsg(
                id = nonce, mine = true, color = st.myColor ?: "", body = null,
                emote = emote, at = System.currentTimeMillis(), nonce = nonce, pending = true,
            )))
        }
        val sent = runCatching {
            emitPayload(EV.matchChat, MatchChatRequest(matchId = id, emote = emote, nonce = nonce))
        }.isSuccess
        if (!sent) markChatFailed(nonce)
    }

    /** Drop an optimistic message whose emit never left the device. */
    private fun markChatFailed(nonce: String) {
        _state.update { st ->
            st.copy(
                chat = st.chat.filterNot { it.nonce == nonce },
                error = "Message failed to send.",
            )
        }
    }

    private fun newNonce(): String = java.util.UUID.randomUUID().toString()

    /**
     * How long to wait for the server's echo of our move before assuming it was
     * lost. Comfortably past a normal round trip (moves usually echo in well
     * under a second) but short enough that a stuck board recovers on its own
     * rather than needing the user to back out of the match.
     */
    private const val PENDING_MOVE_TIMEOUT_MS = 7_000L

    /**
     * Recover from a move whose echo never arrives.
     *
     * `pendingMove` was cleared ONLY by matchMoved / matchIllegal / matchState.
     * If none of those ever came, the client was permanently wedged: the
     * optimistic apply had already flipped the turn, so `myTurn` was false, the
     * board was non-interactive, and the pill read "Sending move…" indefinitely.
     * `connectionLost` did not help either — it is set on an explicit socket
     * DISCONNECT, and the nastier case is a socket that is up but whose room
     * membership was lost (a server instance restart mid-match), which produces
     * no disconnect event at all. `resync()` existed but was unreachable from
     * the match UI.
     *
     * On expiry we ask the server for authoritative state rather than guessing.
     * matchState then clears `pendingMove` and reconciles the board, so a move
     * that DID land is confirmed and one that didn't is rolled back.
     */
    private fun armPendingMoveWatchdog(matchId: String) {
        scheduler(PENDING_MOVE_TIMEOUT_MS) {
            val st = _state.value
            // Only act if we're still stuck on the SAME match's move.
            if (!st.pendingMove || st.matchId != matchId) return@scheduler
            runCatching { ensureConnected() }
            emitPayload(EV.matchResync, MatchIdRequest(matchId))
        }
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

    /**
     * Drop all wiring and reset in-memory state. Called on LOGOUT / account
     * deletion (via [com.filipinodama.app.data.resetSessionState]) as well as
     * from tests — without it, the next user on a shared device inherits the
     * previous user's cached match state and socket wiring.
     */
    fun hardReset() {
        wiredSocket = null
        socket = null
        _state.value = MatchUiState()
    }

    // ---- internals ----

    /**
     * Emit, reporting whether it actually left the device.
     *
     * This used to be `val s = socket ?: return` — a SILENT no-op. Every caller
     * assumed the emit had happened: `onSquareClick` applied its optimistic move
     * and set `pendingMove` regardless, so the board advanced locally, the pill
     * read "Sending move…" forever, and the server eventually forfeited the
     * player on the move clock. `resign()` closed the confirm dialog and did
     * nothing at all, so the user believed they had resigned and then lost on
     * disconnect anyway.
     *
     * Returning a Boolean makes the failure visible to callers, which can then
     * decline to fake success.
     */
    private inline fun <reified T> emitPayload(event: String, payload: T): Boolean {
        val s = socket ?: return false
        return try {
            s.emit(event, org.json.JSONObject(json.encodeToString(payload)))
            true
        } catch (_: Exception) {
            false
        }
    }

    /**
     * Decode a socket payload, or null.
     *
     * The null is NOT silent any more. Every caller does `decode(...) ?: return@on`,
     * so a decode failure drops the event with no state change, no error and no
     * trace — for mm:found that means the player sits on "Finding an opponent"
     * indefinitely with nothing to go on, on the device OR the server. During the
     * 2026-08-04 investigation this was the single hardest branch to rule out,
     * precisely because it left no evidence. One logcat line makes it a two-minute
     * question next time. Kept at warn (not error) since a payload we don't
     * understand is recoverable — the search retry re-asks.
     */
    private inline fun <reified T> decode(args: Array<Any>): T? {
        val raw = args.firstOrNull() ?: return null
        val jsonString = raw.toString()
        return try {
            json.decodeFromString<T>(jsonString)
        } catch (e: Exception) {
            android.util.Log.w(
                "MatchRepository",
                "socket payload decode failed for ${T::class.simpleName}: ${e.message} — payload=${jsonString.take(400)}",
            )
            null
        }
    }
}

// ---------------------------------------------------------------------------
// Inbound-event reducers — pure (MatchUiState, payload) -> MatchUiState.
//
// Extracted to file scope, exactly like RoomRepository's applyRoomStatePayload,
// so the cross-match guards below are unit-testable without standing up a real
// Socket.IO connection. The socket handlers are thin wrappers over these.
//
// THE CROSS-MATCH GUARD, stated once for all three:
//   Leaving a match SCREEN does not leave the server-side match ROOM — the
//   server's spectate:leave deliberately refuses to evict a real player, and
//   the client never emits an explicit leave. Because the socket is a
//   process-wide singleton, a previous match's broadcasts keep arriving. Any
//   handler that mutates the board must therefore verify the payload is for
//   the match we are actually in.
//
//   The `current.matchId != null` prefix is what keeps matchState usable as the
//   match-ENTRY path: when we hold no match yet, any payload is accepted.
// ---------------------------------------------------------------------------

/**
 * How many in-match chat lines we keep in memory.
 *
 * Every append rebuilds the whole list (`chat + msg`), and nothing ever evicted,
 * so a long spectated/ongoing match grew the transcript — and the per-append
 * copy cost — without bound. 200 is far more than a single match's chat ever
 * reaches (matches run minutes, and the server rate-limits chat), so in practice
 * nothing is ever dropped; it exists purely as a ceiling.
 *
 * Keeping it comfortably above real usage also protects OnlineMatchScreen's
 * unread badge, which derives from `chat.size` growing — that reading only
 * degrades once the cap actually bites.
 */
private const val CHAT_HISTORY_LIMIT = 200

/**
 * Append and evict the oldest beyond the cap.
 *
 * `takeLast` is deliberate: it only ever drops from the FRONT, and optimistic
 * messages are appended at the END, so a still-pending message can never be
 * trimmed away before its echo arrives to reconcile it.
 */
private fun List<ChatMsg>.appendCapped(msg: ChatMsg): List<ChatMsg> =
    (this + msg).takeLast(CHAT_HISTORY_LIMIT)

/**
 * EV.matchChat — reconcile an inbound chat message against our optimistic copy.
 *
 * The server echoes back the `nonce` the sender attached. If it matches a
 * message we already rendered optimistically, we REPLACE that entry (clearing
 * `pending` and adopting the server's authoritative body — which matters now
 * that the server masks profanity, so the sender sees exactly what everyone
 * else does). Otherwise it's the opponent's message and we append.
 *
 * Nonce matching is what makes this safe to do twice: without it, sending the
 * same text twice quickly would be indistinguishable and could mis-reconcile.
 */
fun applyMatchChat(current: MatchUiState, p: MatchChatDto): MatchUiState {
    if (current.matchId != null && p.matchId != current.matchId) return current

    val pendingIdx = p.nonce?.let { n -> current.chat.indexOfFirst { it.nonce == n && it.pending } } ?: -1
    val msg = ChatMsg(
        id = p.id ?: "${p.at}-${p.from}-${current.chat.size}",
        mine = current.myColor != null && p.color == current.myColor,
        color = p.color,
        body = p.body,
        emote = p.emote,
        at = p.at,
        nonce = p.nonce,
        serverId = p.id,
        pending = false,
    )
    if (pendingIdx < 0) return current.copy(chat = current.chat.appendCapped(msg))
    // Replace in place so the message keeps its position in the transcript
    // rather than jumping to the bottom when the echo lands. No cap applied on
    // this path: it swaps an entry, it does not grow the list, and trimming here
    // would shift the index we just resolved.
    return current.copy(chat = current.chat.toMutableList().apply { this[pendingIdx] = msg })
}

/** EV.matchState — authoritative full resync (also the match-entry path). */
fun applyMatchState(current: MatchUiState, p: MatchStateDto): MatchUiState {
    if (current.matchId != null && p.matchId != current.matchId) return current
    return current.copy(
        status = MatchStatus.PLAYING,
        matchId = p.matchId,
        gameState = p.state,
        myColor = p.yourColor ?: current.myColor,
        selected = null,
        // A full resync is authoritative — discard any in-flight optimistic move
        // so a reconnect can't strand the pending flag.
        pendingBaseState = null,
        pendingMove = false,
        connectionLost = false
    ).withHighlights()
}

/**
 * EV.matchMoved — the server's authoritative echo. Reconciles our optimistic
 * apply (identical for our own move; the only update for the opponent's) and
 * clears the pending markers now the move is confirmed.
 */
fun applyMatchMoved(current: MatchUiState, p: MatchMovedDto): MatchUiState {
    if (current.matchId != null && p.matchId != current.matchId) return current
    return current.copy(
        gameState = p.state,
        selected = null,
        pendingBaseState = null,
        pendingMove = false
    ).withHighlights()
}

/**
 * EV.matchEnded — final result. Tolerates a null `state`: the server's
 * stranded-match sweeper emits one when the Redis state is already gone, and
 * blanking the board there would leave the result card with nothing behind it.
 */
fun applyMatchEnded(current: MatchUiState, p: MatchEndedDto): MatchUiState {
    if (current.matchId != null && p.matchId != current.matchId) return current
    return current.copy(
        status = MatchStatus.ENDED,
        gameState = p.state ?: current.gameState,
        end = MatchEndInfo(
            result = p.result,
            winnerId = p.winnerId,
            redTrophyDelta = p.redTrophyDelta,
            blueTrophyDelta = p.blueTrophyDelta,
            goldReward = p.goldReward,
            interrupted = false
        ),
        selected = null,
        moveTargets = emptyList(),
        captureTargets = emptyList()
    )
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
    val at: Long,
    /**
     * Client-generated id for a message we rendered OPTIMISTICALLY, echoed back
     * by the server so we can reconcile it instead of rendering it twice. Null
     * for anything that arrived unprompted (i.e. the opponent's messages).
     */
    val nonce: String? = null,
    /**
     * The server's id for this message, when it has one — what a REPORT cites.
     * Distinct from [id], which is only a stable LazyColumn key (and is the
     * nonce while a message is still in flight). Null for emotes and for a
     * message still in flight, so the report affordance stays hidden until the
     * server has actually recorded something to cite.
     */
    val serverId: String? = null,
    /**
     * True while our own message is still in flight.
     *
     * Sending used to wait a FULL ROUND TRIP before you saw your own text: the
     * client emitted match:chat and only appended when the server echoed it
     * back. On a laggy connection that read as a multi-second delay before your
     * message appeared. We now append immediately and clear this on the echo —
     * the same optimistic treatment moves already got.
     */
    val pending: Boolean = false
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
    val viewers: Int? = null,
    // Optimistic move (latency fix #1): when YOU tap a legal move we apply it to
    // [gameState] immediately (so the board never freezes waiting for the server
    // round-trip) and stash the pre-move state in [pendingBaseState] to roll back
    // to if the server rejects it. [pendingMove] is true while our own move is in
    // flight (server echo not yet received) — drives the "sending…" indicator #2.
    val pendingBaseState: GameState? = null,
    val pendingMove: Boolean = false
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
