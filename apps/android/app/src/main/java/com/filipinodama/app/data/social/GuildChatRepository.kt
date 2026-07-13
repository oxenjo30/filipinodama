package com.filipinodama.app.data.social

import com.filipinodama.app.data.ApiClient
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
 * Sending POSTs (server persists + broadcasts), matching GuildChatPanel.tsx's
 * "server echo de-dupes, no optimistic append" behavior.
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

    suspend fun send(guildId: String, body: String) {
        val trimmed = body.trim()
        if (trimmed.isEmpty() || _state.value.sending) return
        _state.update { it.copy(sending = true, error = null) }
        try {
            val envelope = api.sendChat(guildId, GuildChatSendBody(trimmed))
            if (envelope.ok && envelope.data != null) {
                val msg = envelope.data.message
                _state.update { s ->
                    if (s.messages.any { it.id == msg.id }) s else s.copy(messages = s.messages + msg)
                }
            } else {
                _state.update { it.copy(error = "Message failed to send.") }
            }
        } catch (_: Exception) {
            _state.update { it.copy(error = "Message failed to send.") }
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
