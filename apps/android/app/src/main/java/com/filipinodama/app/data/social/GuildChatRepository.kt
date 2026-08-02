package com.filipinodama.app.data.social

import com.filipinodama.app.data.ApiClient
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.SocketClient
import io.socket.client.Socket
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.serialization.json.Json

/**
 * GuildChatRepository — the slide-in guild chat drawer's live data source, a
 * Compose port of apps/web/src/features/guilds/GuildChatPanel.tsx.
 *
 * On [open] we load history (GET /api/guilds/:id/chat), join the guild's
 * socket room (`guild:chat:join`), and subscribe to live `guild:chat:message`
 * broadcasts. [close] leaves the room and drops our listener (never
 * `socket.off()` with no event name — the socket is shared with online play).
 *
 * Sending POSTs (the server persists + broadcasts), but is rendered
 * OPTIMISTICALLY — see [send]. This is a deliberate DIVERGENCE from
 * GuildChatPanel.tsx's "server echo de-dupes, no optimistic append": on mobile
 * that meant waiting a full round trip to see your own message, which reads as
 * the chat box being broken on a slow connection.
 */
object GuildChatRepository {

    private object EV {
        const val guildChatJoin = "guild:chat:join"
        const val guildChatLeave = "guild:chat:leave"
        const val guildChatMessage = "guild:chat:message"
    }

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }
    private val api: GuildsApi by lazy { ApiClient.create<GuildsApi>() }

    private val _state = MutableStateFlow(GuildChatUiState())
    val state: StateFlow<GuildChatUiState> = _state.asStateFlow()

    private var socket: Socket? = null
    private var joinedGuildId: String? = null

    suspend fun open(guildId: String) {
        _state.value = GuildChatUiState(guildId = guildId, loading = true)
        try {
            val envelope = api.chatHistory(guildId)
            if (_state.value.guildId != guildId) return
            if (envelope.ok && envelope.data != null) {
                _state.update { it.copy(messages = envelope.data.messages) }
            } else {
                _state.update { it.copy(error = "Couldn't load chat.") }
            }
        } catch (_: Exception) {
            if (_state.value.guildId == guildId) _state.update { it.copy(error = "Couldn't load chat.") }
        } finally {
            if (_state.value.guildId == guildId) _state.update { it.copy(loading = false) }
        }

        try {
            val s = SocketClient.connect(ApiClient.okHttpClient) ?: return
            socket = s
            s.off(EV.guildChatMessage)
            s.on(EV.guildChatMessage) { args -> onMessage(args) }
            s.emit(EV.guildChatJoin, org.json.JSONObject().put("guildId", guildId))
            joinedGuildId = guildId
        } catch (_: Exception) {
            // live updates unavailable; history + send-refresh still work
        }
    }

    fun close() {
        val gid = joinedGuildId
        val s = socket
        if (gid != null && s != null) {
            runCatching { s.emit(EV.guildChatLeave, org.json.JSONObject().put("guildId", gid)) }
        }
        s?.off(EV.guildChatMessage)
        joinedGuildId = null
        _state.value = GuildChatUiState()
    }

    private fun onMessage(args: Array<Any>) {
        val raw = args.firstOrNull()?.toString() ?: return
        val msg = try {
            json.decodeFromString(GuildChatMessageDto.serializer(), raw)
        } catch (_: Exception) {
            return
        }
        if (msg.guildId != _state.value.guildId) return
        _state.update { s ->
            if (s.messages.any { it.id == msg.id }) s else s.copy(messages = s.messages + msg)
        }
    }

    /**
     * Send a guild message, rendering it IMMEDIATELY.
     *
     * The old flow awaited the POST and only then appended the server's row, so
     * your own message did not appear until a full round trip completed. This
     * file's kdoc described that as matching the web's "server echo de-dupes, no
     * optimistic append" — faithful, but also exactly why chat felt seconds slow.
     * We now append a PENDING copy first and swap in the authoritative row when
     * the POST returns (adopting the server's body, which matters because it
     * masks profanity), or drop it and surface the error.
     *
     * The optimistic row carries a local `pending-…` id, so the live
     * `guild:chat:message` broadcast still de-dupes on the REAL id as before.
     */
    suspend fun send(guildId: String, body: String) {
        val trimmed = body.trim()
        if (trimmed.isEmpty() || _state.value.sending) return

        val me = AuthRepository.state.value.user
        val localId = "pending-${java.util.UUID.randomUUID()}"
        val optimistic = me?.let {
            GuildChatMessageDto(
                id = localId,
                guildId = guildId,
                body = trimmed,
                createdAt = java.time.Instant.now().toString(),
                author = GuildChatAuthorDto(
                    id = it.id,
                    displayName = it.displayName,
                    avatarUrl = it.avatarUrl,
                    frameId = it.frameId,
                ),
            )
        }

        _state.update { s ->
            s.copy(
                sending = true,
                error = null,
                messages = if (optimistic != null && s.guildId == guildId) s.messages + optimistic else s.messages,
            )
        }
        try {
            val envelope = api.sendChat(guildId, GuildChatSendBody(trimmed))
            if (envelope.ok && envelope.data != null) {
                val msg = envelope.data.message
                _state.update { s ->
                    val idx = s.messages.indexOfFirst { it.id == localId }
                    when {
                        // Swap the pending row IN PLACE so it keeps its position
                        // instead of jumping to the bottom when the POST lands.
                        idx >= 0 -> s.copy(messages = s.messages.toMutableList().apply { this[idx] = msg })
                        // The socket broadcast beat the POST response here.
                        s.messages.any { it.id == msg.id } -> s
                        else -> s.copy(messages = s.messages + msg)
                    }
                }
            } else {
                _state.update { s ->
                    s.copy(messages = s.messages.filterNot { it.id == localId }, error = "Message failed to send.")
                }
            }
        } catch (_: Exception) {
            _state.update { s ->
                s.copy(messages = s.messages.filterNot { it.id == localId }, error = "Message failed to send.")
            }
        } finally {
            _state.update { it.copy(sending = false) }
        }
    }

    /** Test/teardown hook. */
    fun hardReset() {
        socket = null
        joinedGuildId = null
        _state.value = GuildChatUiState()
    }
}

data class GuildChatUiState(
    val guildId: String? = null,
    val messages: List<GuildChatMessageDto> = emptyList(),
    val loading: Boolean = false,
    val sending: Boolean = false,
    val error: String? = null
)
