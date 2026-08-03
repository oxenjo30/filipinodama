package com.filipinodama.app.data.tournaments

import com.filipinodama.app.data.ApiClient
import com.filipinodama.app.data.SocketClient
import com.filipinodama.app.data.match.MatchRepository
import io.socket.client.Socket
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonPrimitive
import org.json.JSONObject

/**
 * TournamentLiveRepository — the LIVE half of a running Cup: the ready-check
 * and the auto-start handoff, mirroring apps/web/src/stores/tournamentStore.ts.
 *
 * The screen already loads `myMatch` over REST, so it is correct before this
 * object does anything. All this adds is liveness: press Ready, see the
 * opponent's Ready land without a refresh, and get pushed onto the board the
 * instant the server starts the match.
 *
 * READY IS A COMMITMENT — there is no un-ready event, by design (the first
 * Ready arms the opponent's no-show clock; taking it back would let a player
 * stall the bracket indefinitely). So this exposes [ready] and nothing else.
 *
 * The start handoff is deliberately the same shape as [com.filipinodama.app
 * .data.rooms.RoomRepository]'s room:start handler: by the time the event
 * arrives the server has already created the Match, seeded it, and joined our
 * socket to its room, so all that is left client-side is to point
 * [MatchRepository] at it and resync. Singleton-object + StateFlow, matching
 * this scaffold's repository convention.
 */
object TournamentLiveRepository {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private val _state = MutableStateFlow(TournamentLiveState())
    val state: StateFlow<TournamentLiveState> = _state.asStateFlow()

    /** The socket instance our listeners are attached to — see RoomRepository. */
    private var wiredSocket: Socket? = null
    private var socket: Socket? = null

    private object EV {
        const val tournamentReady = "tournament:ready"
        const val tournamentMatchState = "tournament:matchState"
        const val tournamentStart = "tournament:start"
    }

    /**
     * Connect (if needed) and attach the listeners. Safe to call repeatedly —
     * the socket is a process-wide singleton and [wire] is identity-keyed.
     * A failure is swallowed: the REST payload already rendered the card, and
     * the socket reconnects itself.
     */
    fun bind() {
        runCatching { ensureConnected() }
    }

    /** Seed from the GET /api/tournaments/:id payload on load / refetch. */
    fun hydrate(myMatch: TournamentMyMatchDto?) {
        _state.update { it.copy(myMatch = myMatch) }
    }

    /**
     * Emit "tournament:ready". The server answers with a fresh matchState (or
     * an error envelope on the same event), which clears [TournamentLiveState.pending].
     */
    fun ready(tmId: String) {
        _state.update { it.copy(pending = true, error = null) }
        val s = runCatching { ensureConnected() }.getOrNull()
        if (s == null) {
            // Socket down — surface it rather than leaving the button spinning.
            _state.update {
                it.copy(pending = false, error = TournamentReadyError("OFFLINE", "You're offline — reconnecting…"))
            }
            return
        }
        emitPayload(s, EV.tournamentReady, TournamentReadyRequest(tmId))
    }

    /**
     * Enter an ALREADY-live slot (the "Rejoin your match" path). The start
     * event only fires once, so a player who backgrounded the app, or opened
     * the Cup fresh while their match was running, needs this to hand the match
     * to [MatchRepository] before the screen navigates.
     */
    fun enterLiveMatch(myMatch: TournamentMyMatchDto) {
        val matchId = myMatch.matchId ?: return
        MatchRepository.enterFromRoom(matchId = matchId, yourColor = myMatch.yourColor, opponent = null)
        applyOpponentHint(myMatch.opponent)
    }

    /** Clear startedMatchId after the screen has navigated into the match. */
    fun consumeStart() {
        _state.update { it.copy(startedMatchId = null) }
    }

    /** Take the pending ready failure (so a toast shows exactly once). */
    fun consumeError(): TournamentReadyError? {
        val e = _state.value.error
        if (e != null) _state.update { it.copy(error = null) }
        return e
    }

    /** Drop the cached slot when leaving the screen (the next load re-hydrates). */
    fun reset() {
        _state.value = TournamentLiveState()
    }

    /** Drop all wiring and reset in-memory state (logout / account deletion / tests). */
    fun hardReset() {
        wiredSocket = null
        socket = null
        _state.value = TournamentLiveState()
    }

    // ---- internals ----

    private fun ensureConnected(): Socket {
        val existing = socket
        if (existing != null && existing.connected()) return existing
        val s = SocketClient.connect(ApiClient.okHttpClient) ?: error("Could not create socket")
        socket = s
        wire(s)
        return s
    }

    /**
     * Attach listeners once PER SOCKET INSTANCE (identity-keyed, not a boolean
     * — see MatchRepository.wire for the defect that motivated this). The
     * per-event off() calls name their events: this socket is shared with
     * online play, rooms, DM and presence, so a bare off() would deafen them.
     */
    private fun wire(s: Socket) {
        if (wiredSocket === s) return
        wiredSocket = s

        listOf(EV.tournamentMatchState, EV.tournamentStart).forEach { s.off(it) }

        s.on(EV.tournamentMatchState) { args ->
            // THREE shapes on one event: the myMatch object, null (we have no
            // open slot any more — eliminated, or the Cup ended), or an error
            // envelope answering our own ready attempt.
            val obj = args.firstOrNull()?.let { raw ->
                runCatching { json.parseToJsonElement(raw.toString()) as? JsonObject }.getOrNull()
            }
            if (obj == null) {
                _state.update { it.copy(myMatch = null, pending = false) }
                return@on
            }
            val errorObj = obj["error"] as? JsonObject
            if (errorObj != null) {
                val code = runCatching { errorObj["code"]?.jsonPrimitive?.content }.getOrNull() ?: "READY_FAILED"
                val message = runCatching { errorObj["message"]?.jsonPrimitive?.content }.getOrNull()
                    ?: "Couldn't ready up."
                _state.update { it.copy(error = TournamentReadyError(code, message), pending = false) }
                return@on
            }
            val dto = runCatching {
                json.decodeFromJsonElement<TournamentMyMatchDto>(obj)
            }.getOrNull() ?: return@on
            _state.update { it.copy(myMatch = dto, pending = false) }
        }

        s.on(EV.tournamentStart) { args ->
            val payload = decode<TournamentStartDto>(args) ?: return@on
            // Our socket is already in the match room and the board is seeded —
            // hand the match to MatchRepository (which owns live play) and ask
            // for the opening state, exactly like RoomRepository's room:start.
            val opponent = _state.value.myMatch?.opponent
            MatchRepository.enterFromRoom(matchId = payload.matchId, yourColor = payload.yourColor, opponent = null)
            applyOpponentHint(opponent)
            _state.update { it.copy(startedMatchId = payload.matchId, pending = false) }
        }
    }

    /** Best-effort opponent identity for the board, from the slot we just left
     *  (name/tag/avatar only — the slot payload carries no trophies/rankTier,
     *  same limitation the room handoff documents). */
    private fun applyOpponentHint(opponent: TournamentOpponentDto?) {
        if (opponent == null) return
        MatchRepository.setRoomOpponentHint(
            userId = opponent.userId,
            name = opponent.username,
            tag = opponent.tag,
            avatarUrl = opponent.avatarUrl
        )
    }

    private inline fun <reified T> emitPayload(s: Socket, event: String, payload: T) {
        val jsonString = json.encodeToString(payload)
        s.emit(event, JSONObject(jsonString))
    }

    private inline fun <reified T> decode(args: Array<Any>): T? {
        val raw = args.firstOrNull() ?: return null
        return try {
            json.decodeFromString<T>(raw.toString())
        } catch (_: Exception) {
            null
        }
    }
}

data class TournamentLiveState(
    /** Latest server truth for our current slot (null = we have no open match). */
    val myMatch: TournamentMyMatchDto? = null,
    /** Set when the server starts our match, so the screen can navigate. Cleared by consumeStart(). */
    val startedMatchId: String? = null,
    /** Last ready failure, for a toast. Cleared by consumeError(). */
    val error: TournamentReadyError? = null,
    /** True between pressing Ready and the server echoing our readiness back. */
    val pending: Boolean = false
)

/**
 * Which of the four "Your Match" card states a slot is in. Pulled out as a
 * pure function (rather than a chain of ifs inside the composable) so the
 * selection is unit-testable without Compose — same discipline as
 * applyRoomStatePayload in RoomRepository.kt.
 *
 * Order matters and mirrors YourMatchCard.tsx: a live match beats everything
 * (the player belongs on the board), then our own readiness, then a slot whose
 * opponent hasn't been decided by an earlier match yet.
 */
enum class YourMatchState {
    /** The match is running — offer "Rejoin your match". */
    LIVE,

    /** We readied; the countdown is now the opponent's problem. */
    READY_WAITING,

    /** The other side of this slot is still an unfinished earlier match. */
    AWAITING_OPPONENT,

    /** Both competitors known, we haven't readied — show the Ready button. */
    CAN_READY
}

fun yourMatchState(m: TournamentMyMatchDto): YourMatchState = when {
    m.matchId != null -> YourMatchState.LIVE
    m.iAmReady -> YourMatchState.READY_WAITING
    m.opponent == null -> YourMatchState.AWAITING_OPPONENT
    else -> YourMatchState.CAN_READY
}

/** True while a no-show deadline is actually ticking (armed, and not yet
 *  superseded by the match starting) — the only time the screen needs a
 *  once-a-second recomposition. */
fun countdownRunning(m: TournamentMyMatchDto): Boolean = m.deadlineAt != null && m.matchId == null

/** Whole seconds left on a ready deadline, floored at 0. */
fun secondsUntilDeadline(iso: String?, nowMs: Long = System.currentTimeMillis()): Int {
    if (iso == null) return 0
    val ms = try {
        java.time.Instant.parse(iso).toEpochMilli() - nowMs
    } catch (_: Exception) {
        return 0
    }
    return if (ms <= 0) 0 else (ms / 1000).toInt()
}

/** "4:07" / "0:38" — a countdown, not a clock time. */
fun formatCountdown(totalSeconds: Int): String {
    val safe = totalSeconds.coerceAtLeast(0)
    return "${safe / 60}:${(safe % 60).toString().padStart(2, '0')}"
}
