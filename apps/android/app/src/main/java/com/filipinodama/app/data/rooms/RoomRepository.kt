package com.filipinodama.app.data.rooms

import com.filipinodama.app.data.ApiClient
import com.filipinodama.app.data.SocketClient
import com.filipinodama.app.data.engine.DEFAULT_SETTINGS
import com.filipinodama.app.data.engine.GameSettings
import com.filipinodama.app.data.match.MatchRepository
import io.socket.client.Socket
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.json.JSONObject

/**
 * RoomRepository — client state for a PRIVATE ROOM over the socket
 * (server-owned), mirroring apps/web/src/stores/roomStore.ts EXACTLY: this is
 * a thin mirror of whatever the server broadcasts on EV.roomState +
 * "room:chat". Nothing here is fabricated — every member, chip and chat line
 * comes from a real server event. Singleton-object + StateFlow, matching this
 * scaffold's MatchRepository/AuthRepository convention.
 *
 * When the host starts the match, the server seeds a real server-authoritative
 * Match and emits EV.roomStart {matchId,yourColor} to both players (and
 * updates roomState.matchId for spectators). We hand that match off to
 * [MatchRepository] (resync) and expose [RoomUiState.startedMatchId] /
 * [RoomUiState.spectateMatchId] so the screen can navigate into the online
 * match view.
 */
object RoomRepository {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }
    private val api: RoomsApi by lazy { ApiClient.create<RoomsApi>() }

    private val _state = MutableStateFlow(RoomUiState())
    val state: StateFlow<RoomUiState> = _state.asStateFlow()

    private var wired = false
    private var socket: Socket? = null

    private object EV {
        const val roomCreate = "room:create"
        const val roomJoin = "room:join"
        const val roomLeave = "room:leave"
        const val roomState = "room:state"
        const val roomSettings = "room:settings"
        const val roomKick = "room:kick"
        const val roomBan = "room:ban"
        const val roomLock = "room:lock"
        const val roomSpectate = "room:spectate"
        const val roomStart = "room:start"
        const val roomChat = "room:chat" // literal string on the server, not EV.roomChat
    }

    private fun ensureConnected(): Socket {
        val existing = socket
        if (existing != null && existing.connected()) return existing
        val s = SocketClient.connect(ApiClient.okHttpClient) ?: error("Could not create socket")
        socket = s
        wire(s)
        return s
    }

    private fun wire(s: Socket) {
        if (wired) return
        wired = true

        s.on(EV.roomState) { args ->
            val raw = args.firstOrNull()?.toString() ?: return@on
            val parsed = try {
                json.parseToJsonElement(raw).jsonObject
            } catch (_: Exception) {
                return@on
            }
            _state.update { applyRoomStatePayload(it, parsed) }
        }

        s.on(EV.roomStart) { args ->
            val payload = decode<RoomStartDto>(args) ?: return@on
            val rs = _state.value
            val spectating = payload.yourColor == null
            _state.update { it.copy(matchId = payload.matchId, startedMatchId = if (spectating) null else payload.matchId, spectateMatchId = if (spectating) payload.matchId else null) }
            MatchRepository.enterFromRoom(matchId = payload.matchId, yourColor = payload.yourColor, opponent = null)
            // Best-effort opponent hint using the room's cached members (same
            // reference-identity trick as roomStore.ts: host is RED, guest is BLUE).
            val opp = if (spectating) rs.host else if (payload.yourColor == "red") rs.guest else rs.host
            if (opp != null) MatchRepository.setRoomOpponentHint(opp.userId, opp.name, opp.tag, opp.avatarUrl)
        }

        s.on(EV.roomChat) { args ->
            val payload = decode<RoomChatDto>(args) ?: return@on
            _state.update { st ->
                st.copy(
                    chat = st.chat + RoomChatMsg(
                        id = "${payload.at}-${payload.from.userId}-${st.chat.size}",
                        from = payload.from,
                        body = payload.body,
                        at = payload.at
                    )
                )
            }
        }
    }

    private suspend fun ready(): Boolean {
        return try {
            ensureConnected()
            true
        } catch (_: Exception) {
            // Surface a real error so the screen can bail out of an
            // indefinite "Joining…" spinner instead of hanging forever with
            // no event ever arriving (connect failed, so room:join/spectate
            // was never even emitted).
            _state.update { it.copy(connecting = false, error = RoomError.ConnectFailed) }
            false
        }
    }

    // ---- public actions (mirror roomStore.ts's exported actions 1:1) ----

    suspend fun create(mode: String? = null) {
        _state.value = RoomUiState(connecting = true)
        if (!ready()) return
        emitPayload(EV.roomCreate, RoomCreateRequest(mode))
    }

    suspend fun join(code: String) {
        val trimmed = normalizeRoomCode(code)
        if (trimmed.isEmpty()) return
        _state.value = RoomUiState(connecting = true)
        if (!ready()) return
        emitPayload(EV.roomJoin, RoomCodeRequest(trimmed))
    }

    suspend fun spectate(code: String) {
        val trimmed = normalizeRoomCode(code)
        if (trimmed.isEmpty()) return
        _state.value = RoomUiState(connecting = true)
        if (!ready()) return
        emitPayload(EV.roomSpectate, RoomCodeRequest(trimmed))
    }

    fun setSettings(settings: GameSettings) {
        emitPayload(EV.roomSettings, RoomSettingsRequest(settings))
    }

    /** Host-only: set the room's locked state. The server rejects new joiners
     *  while locked; the authoritative value comes back on the next room:state. */
    fun setLock(locked: Boolean) {
        emitPayload(EV.roomLock, RoomLockRequest(locked))
    }

    fun kick(userId: String) {
        emitPayload(EV.roomKick, RoomUserRequest(userId))
    }

    fun ban(userId: String) {
        emitPayload(EV.roomBan, RoomUserRequest(userId))
    }

    fun start() {
        socket?.emit(EV.roomStart)
    }

    fun leave() {
        runCatching { socket?.emit(EV.roomLeave) }
        _state.value = RoomUiState()
    }

    fun sendChat(body: String) {
        val text = body.trim().take(300)
        if (text.isEmpty()) return
        emitPayload(EV.roomChat, RoomChatRequest(text))
    }

    /** Clear startedMatchId after the screen has navigated into the match. */
    fun consumeStart() {
        _state.update { it.copy(startedMatchId = null) }
    }

    fun clearError() {
        _state.update { it.copy(error = null) }
    }

    fun reset() {
        _state.value = RoomUiState()
    }

    /** Test/teardown hook: drop all wiring and reset in-memory state. */
    fun hardReset() {
        wired = false
        socket = null
        _state.value = RoomUiState()
    }

    /**
     * GET /api/rooms/mine — the caller's currently-active private room code, if
     * any (host, guest, or spectator), so the screen can resume it without a
     * deep-link code. Returns null on any failure or when no room is active
     * (never fabricates a code).
     */
    suspend fun fetchMyRoomCode(): String? = try {
        val envelope = api.mine()
        if (envelope.ok) envelope.data?.code else null
    } catch (_: Exception) {
        null
    }

    // ---- internals ----

    private inline fun <reified T> emitPayload(event: String, payload: T) {
        val s = socket ?: return
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

/** Why the room is no longer available to us (drives the screen's error banner). */
sealed class RoomError {
    data class NotFound(val code: String) : RoomError()
    data class Banned(val code: String) : RoomError()
    object Locked : RoomError() // the room is locked; the host isn't accepting new joiners
    object Closed : RoomError() // host left / room torn down
    object Kicked : RoomError()
    object YouBanned : RoomError() // host banned us
    /** create()/join()/spectate() couldn't even establish the socket connection —
     *  no server event will ever arrive, so the screen must not stay in JOINING. */
    object ConnectFailed : RoomError()
}

/** A single relayed room chat line (ephemeral; server does not persist these). */
data class RoomChatMsg(
    val id: String,
    val from: RoomMemberDto,
    val body: String,
    val at: Long
)

data class RoomUiState(
    /** Live room snapshot (null until we've created/joined one). */
    val code: String? = null,
    val hostId: String? = null,
    val host: RoomMemberDto? = null,
    val guest: RoomMemberDto? = null,
    val spectators: List<RoomMemberDto> = emptyList(),
    val settings: GameSettings = DEFAULT_SETTINGS,
    val mode: String = "PRIVATE",
    /** Set by the server once the host starts (spectators observe this too). */
    val matchId: String? = null,
    /** Host toggled "Lock the room" — while true, new joiners are turned away. */
    val locked: Boolean = false,

    /** Live relayed room chat, oldest -> newest. */
    val chat: List<RoomChatMsg> = emptyList(),

    /** True while the socket is connecting/creating (drives button states). */
    val connecting: Boolean = false,
    /** Present when the room became unavailable (not-found / banned / closed / ...). */
    val error: RoomError? = null,

    /** Set to the started match id (once EV.roomStart arrives for us as a player)
     *  so the screen can navigate into the online match view. Cleared via consumeStart(). */
    val startedMatchId: String? = null,

    /** Set (instead of startedMatchId) when EV.roomStart arrives for us as a
     *  SPECTATOR (yourColor:null). The screen stays put and renders a live,
     *  read-only board in place. Cleared when the match ends or we leave. */
    val spectateMatchId: String? = null
) {
    fun isHostUser(userId: String?): Boolean = userId != null && userId == hostId
}

/** packages/shared/src/constants.ts ROOM_CODE_LENGTH, mirrored verbatim. */
const val ROOM_CODE_LENGTH = 6

/**
 * Normalizes a user-entered room code exactly like the server does
 * (rooms.ts: `code.trim().toUpperCase()`) before it's ever emitted — so a
 * lowercase paste or stray whitespace from a shared link still resolves.
 */
fun normalizeRoomCode(raw: String): String = raw.trim().uppercase()

/** True once a normalized code is exactly [ROOM_CODE_LENGTH] characters — the
 *  only client-side gate before enabling the Join button (the server is the
 *  actual authority on whether the code resolves to a real room). */
fun isValidRoomCode(raw: String): Boolean = normalizeRoomCode(raw).length == ROOM_CODE_LENGTH

private val roomStateJson = Json { ignoreUnknownKeys = true; isLenient = true }

private fun JsonObject.stringOrNull(key: String): String? {
    val el = this[key] ?: return null
    return if (el is JsonNull) null else el.jsonPrimitive.content
}

/**
 * Applies one EV.roomState broadcast to the current [RoomUiState]. Pulled out
 * as a pure function (rather than living inline in the socket callback) so it
 * is unit-testable without a live socket — mirrors the discipline already
 * used by MatchUiState.withHighlights(). The server overloads EV.roomState
 * for FOUR distinct shapes (see rooms.ts's RoomStatePayload union on the web
 * side): a full snapshot, or one of error/closed/kicked/banned status flags.
 */
fun applyRoomStatePayload(current: RoomUiState, p: JsonObject): RoomUiState {
    if ("error" in p) {
        val errStr = p.stringOrNull("error")
        val code = p.stringOrNull("code") ?: ""
        return current.copy(
            error = when (errStr) {
                "banned" -> RoomError.Banned(code)
                "locked" -> RoomError.Locked
                else -> RoomError.NotFound(code)
            },
            connecting = false
        )
    }
    if ("closed" in p) {
        val code = p.stringOrNull("code")
        return if (current.code == code) RoomUiState(error = RoomError.Closed) else current
    }
    if ("kicked" in p) {
        val code = p.stringOrNull("code")
        return if (current.code == code) RoomUiState(error = RoomError.Kicked) else current
    }
    if ("banned" in p) {
        val code = p.stringOrNull("code")
        return if (current.code == code) RoomUiState(error = RoomError.YouBanned) else current
    }

    // Full snapshot — mirror it verbatim (nothing fabricated).
    return try {
        val dto = roomStateJson.decodeFromJsonElement(RoomStateDto.serializer(), p)
        current.copy(
            code = dto.code,
            hostId = dto.hostId,
            host = dto.host,
            guest = dto.guest,
            spectators = dto.spectators,
            settings = dto.settings,
            mode = dto.mode,
            matchId = dto.matchId,
            locked = dto.locked,
            connecting = false,
            error = null
        )
    } catch (_: Exception) {
        current
    }
}
