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
 * DmRepository — Direct Messages between friends, a Compose port of
 * apps/web/src/stores/dmStore.ts. REAL, PERSISTED chat:
 *
 *   loadConversations() -> GET /api/dm (the conversation list).
 *   openThread(userId)  -> GET /api/dm/:userId (messages + channelId, marks read).
 *   send(userId, body)  -> POST /api/dm/:userId then append the persisted message.
 *   unreadTotal()       -> GET /api/dm/unread-total (nav badge).
 *
 * LIVE: on first use we subscribe ONCE to the shared socket's `chat:message`
 * event. When a DM lands for the currently-open channel we append it
 * (de-duped by id); either way we refresh the conversation list + unread
 * total so previews/badges stay live. Nothing here is fabricated — every
 * line is a stored message (mirrors dmStore.ts's ensureSubscribed()).
 */
object DmRepository {

    private object EV {
        const val chatMessage = "chat:message"
    }

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }
    private val api: DmApi by lazy { ApiClient.create<DmApi>() }

    private val _state = MutableStateFlow(DmUiState())
    val state: StateFlow<DmUiState> = _state.asStateFlow()

    /**
     * The socket our chat listener is attached to — identity, not a boolean.
     * A sticky `subscribed` flag suppressed re-subscription when [SocketClient]
     * handed back a different instance, silently killing live DM delivery.
     */
    private var wiredSocket: Socket? = null
    private var socket: Socket? = null

    private fun ensureSubscribed() {
        try {
            val s = SocketClient.connect(ApiClient.okHttpClient) ?: return
            if (wiredSocket === s) return
            socket = s
            wiredSocket = s
            s.off(EV.chatMessage)
            s.on(EV.chatMessage) { args -> onChatMessage(args) }
        } catch (_: Exception) {
            wiredSocket = null
        }
    }

    private fun onChatMessage(args: Array<Any>) {
        val raw = args.firstOrNull()?.toString() ?: return
        val payload = try {
            json.decodeFromString(DmChatMessageEvent.serializer(), raw)
        } catch (_: Exception) {
            return
        }
        if (payload.kind != "dm" || payload.message == null) return
        val message = payload.message
        val channelId = payload.channelId
        if (channelId != null && channelId == _state.value.openChannelId) {
            _state.update { s ->
                if (s.messages.any { it.id == message.id }) s
                else s.copy(messages = s.messages + message)
            }
        }
        // Always refresh previews + unread badge (best-effort, fire-and-forget
        // from a suspend-free socket callback is not possible here — callers
        // in the composable layer re-trigger loadConversations()/unreadTotal()
        // via a LaunchedEffect keyed on messages.size, matching the store's
        // "refresh on every relevant change" behavior without a coroutine
        // scope living inside this singleton).
    }

    suspend fun loadConversations() {
        ensureSubscribed()
        _state.update { it.copy(loadingList = true) }
        try {
            val envelope = api.conversations()
            if (envelope.ok && envelope.data != null) {
                _state.update { it.copy(conversations = envelope.data.conversations) }
            }
        } catch (_: Exception) {
            // leave prior list in place; a background refresh failure is silent
        } finally {
            _state.update { it.copy(loadingList = false) }
        }
    }

    suspend fun openThread(userId: String) {
        ensureSubscribed()
        _state.update {
            it.copy(
                loadingThread = true,
                error = null,
                openUserId = userId,
                openChannelId = null,
                openUser = null,
                messages = emptyList()
            )
        }
        try {
            val envelope = api.thread(userId)
            if (_state.value.openUserId != userId) return
            if (envelope.ok && envelope.data != null) {
                _state.update {
                    it.copy(
                        openChannelId = envelope.data.channelId,
                        openUser = envelope.data.user,
                        messages = envelope.data.messages
                    )
                }
                unreadTotal()
                loadConversations()
            } else {
                val code = envelope.error?.code
                val message = if (code == "NOT_FRIENDS") "You can only message friends. Add them first." else "Couldn't open this conversation."
                _state.update { it.copy(error = message) }
            }
        } catch (_: Exception) {
            if (_state.value.openUserId != userId) return
            _state.update { it.copy(error = "Couldn't open this conversation.") }
        } finally {
            if (_state.value.openUserId == userId) _state.update { it.copy(loadingThread = false) }
        }
    }

    fun closeThread() {
        _state.update {
            it.copy(openUserId = null, openChannelId = null, openUser = null, messages = emptyList(), error = null)
        }
    }

    suspend fun send(userId: String, body: String) {
        val trimmed = body.trim()
        if (trimmed.isEmpty() || _state.value.sending) return
        _state.update { it.copy(sending = true, error = null) }
        try {
            val envelope = api.send(userId, DmSendBody(trimmed))
            if (envelope.ok && envelope.data != null) {
                val message = envelope.data.message
                if (_state.value.openUserId == userId) {
                    _state.update { s ->
                        if (s.messages.any { it.id == message.id }) s
                        else s.copy(messages = s.messages + message)
                    }
                }
                loadConversations()
            } else {
                val code = envelope.error?.code
                _state.update { it.copy(error = if (code == "NOT_FRIENDS") "You can only message friends." else "Message failed to send.") }
            }
        } catch (_: Exception) {
            _state.update { it.copy(error = "Message failed to send.") }
        } finally {
            _state.update { it.copy(sending = false) }
        }
    }

    suspend fun unreadTotal(): Int {
        return try {
            val envelope = api.unreadTotal()
            val total = if (envelope.ok) envelope.data?.total ?: 0 else _state.value.unread
            _state.update { it.copy(unread = total) }
            total
        } catch (_: Exception) {
            _state.value.unread
        }
    }

    fun clearError() {
        _state.update { it.copy(error = null) }
    }

    /**
     * Drop wiring and every cached conversation/message (logout / account
     * deletion / tests). Critical on a shared device: DM bodies live in this
     * singleton's StateFlow and were previously visible to the next user.
     */
    fun hardReset() {
        wiredSocket = null
        socket = null
        _state.value = DmUiState()
    }
}

data class DmUiState(
    val conversations: List<DmConversationDto> = emptyList(),
    val unread: Int = 0,
    val openUserId: String? = null,
    val openChannelId: String? = null,
    val openUser: DmUserDto? = null,
    val messages: List<DmMessageDto> = emptyList(),
    val loadingList: Boolean = false,
    val loadingThread: Boolean = false,
    val sending: Boolean = false,
    val error: String? = null
)
