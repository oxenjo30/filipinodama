package com.filipinodama.app.data.social

import com.filipinodama.app.data.apiErrorFrom

import com.filipinodama.app.data.ApiClient
import com.filipinodama.app.data.SocketClient
import io.socket.client.Socket
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonPrimitive

/**
 * NotificationsRepository — server-authoritative client for Notifications
 * (Phase 6b), a Compose port of apps/web NotificationsMenu.tsx: optimistic
 * read/dismiss/mark-all with a real POST underneath, and honest rollback to
 * server truth (reload) on failure.
 */
object NotificationsRepository {

    private val api: NotificationsApi by lazy { ApiClient.create<NotificationsApi>() }

    private val _state = MutableStateFlow(NotificationsUiState())
    val state: StateFlow<NotificationsUiState> = _state.asStateFlow()

    // A monotonically-increasing "something needing your attention changed"
    // signal. Bumped whenever a live notif:new arrives. Screens that show an
    // "action needed" bubble derived from a SEPARATE source (e.g. the Profile
    // Friends pill reads FriendsRepository.requests()) observe this to re-fetch
    // their own count live, without each needing its own socket subscription.
    private val _actionsTick = MutableStateFlow(0)
    val actionsTick: StateFlow<Int> = _actionsTick.asStateFlow()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    /**
     * The socket our notif listener is attached to — identity, not a boolean.
     * A sticky `subscribed` flag suppressed re-subscription when [SocketClient]
     * handed back a different instance, so the realtime bell badge went dead.
     */
    private var wiredSocket: Socket? = null
    private var socket: Socket? = null

    private object EV {
        const val notifNew = "notif:new"
    }

    /**
     * Subscribe ONCE to the shared socket's `notif:new` so the bell badge (and
     * any action-bubble observing [actionsTick]) updates the INSTANT a
     * notification arrives — no refresh. The server emits { unreadCount } to
     * presence:<userId> after creating a notification (e.g. a friend request).
     * Call once the user is signed in (idempotent). Mirrors DmRepository.
     */
    fun ensureLive() {
        try {
            val s = SocketClient.connect(ApiClient.okHttpClient) ?: return
            if (wiredSocket === s) return
            socket = s
            wiredSocket = s
            s.off(EV.notifNew)
            s.on(EV.notifNew) {
                // Re-load the full feed (updates the bell's unreadCount) and nudge
                // action-bubble observers to re-fetch. Cheap + always correct.
                scope.launch { load() }
                _actionsTick.update { it + 1 }
            }
        } catch (_: Exception) {
            wiredSocket = null
        }
    }

    suspend fun load() {
        _state.update { it.copy(loading = true, error = false) }
        try {
            val envelope = api.list()
            if (envelope.ok && envelope.data != null) {
                _state.update { it.copy(data = envelope.data, error = false) }
            } else {
                _state.update { it.copy(error = true) }
            }
        } catch (_: Exception) {
            _state.update { it.copy(error = true) }
        } finally {
            _state.update { it.copy(loading = false) }
        }
    }

    suspend fun markRead(id: String) {
        val current = _state.value.data ?: return
        val target = current.notifications.find { it.id == id }
        if (target == null || target.readAt != null) return
        // Optimistic flip.
        _state.update { it.copy(data = flipRead(current, id)) }
        try {
            val envelope = api.markRead(id)
            if (!envelope.ok) load()
        } catch (_: Exception) {
            load()
        }
    }

    suspend fun markAll() {
        val current = _state.value.data ?: return
        _state.update { it.copy(data = flipAllRead(current)) }
        try {
            val envelope = api.readAll()
            if (!envelope.ok) load()
        } catch (_: Exception) {
            load()
        }
    }

    suspend fun dismiss(id: String) {
        val current = _state.value.data ?: return
        val target = current.notifications.find { it.id == id } ?: return
        _state.update { it.copy(data = dropNotif(current, id, target.readAt != null)) }
        try {
            val envelope = api.dismiss(id)
            if (!envelope.ok) load()
        } catch (_: Exception) {
            load()
        }
    }

    suspend fun resolveFriendRequest(notif: NotificationDto, accept: Boolean): SocialResult<Unit> {
        val requestId = notifRequestId(notif) ?: return SocialResult.Failure("NO_REQUEST_ID", "No request to act on.")
        val status = if (accept) "accepted" else "declined"
        return try {
            val action = if (accept) FriendsRepository.acceptRequest(requestId) else FriendsRepository.declineRequest(requestId)
            when (action) {
                is SocialResult.Success -> {
                    runCatching { api.resolve(notif.id, NotificationResolveBody(status)) }
                    load()
                    SocialResult.Success(Unit)
                }
                is SocialResult.Failure -> {
                    load()
                    action
                }
            }
        } catch (e: Exception) {
            load()
            val apiError = apiErrorFrom(e)
            if (apiError != null) SocialResult.Failure(apiError.code, apiError.message)
            else SocialResult.Failure("NETWORK_ERROR", "Couldn't reach the server.")
        }
    }

    /** Drop wiring and the cached feed (logout / account deletion / tests). */
    fun hardReset() {
        wiredSocket = null
        socket = null
        _state.value = NotificationsUiState()
    }
}

data class NotificationsUiState(
    val data: NotificationsResponse? = null,
    val loading: Boolean = false,
    val error: Boolean = false
)

/** requestId out of notification.data, defensive per NotificationsMenu.tsx notifData(). */
fun notifRequestId(n: NotificationDto): String? {
    val obj = n.data as? JsonObject ?: return null
    val el = obj["requestId"] ?: return null
    if (el is JsonNull) return null
    return (el as? JsonPrimitive)?.content
}

/** avatarUrl out of notification.data, for a friend-request row's avatar. */
fun notifAvatarUrl(n: NotificationDto): String? {
    val obj = n.data as? JsonObject ?: return null
    val el = obj["avatarUrl"] ?: return null
    if (el is JsonNull) return null
    return (el as? JsonPrimitive)?.content
}

/** status ("accepted"|"declined") out of notification.data, once resolved. */
fun notifStatus(n: NotificationDto): String? {
    val obj = n.data as? JsonObject ?: return null
    val el = obj["status"] ?: return null
    if (el is JsonNull) return null
    return (el as? JsonPrimitive)?.content
}

/** A friend-request notif is actionable only while unresolved. Mirrors isFriendType/isPending. */
fun notifIsFriendType(type: String): Boolean = type.contains("friend")

fun notifIsPending(n: NotificationDto): Boolean =
    notifIsFriendType(n.type) && notifRequestId(n) != null && notifStatus(n) == null

// ── pure state-transition helpers (unit-testable without a live repository) ──

private fun flipList(list: List<NotificationDto>, id: String, now: String): List<NotificationDto> =
    list.map { if (it.id == id && it.readAt == null) it.copy(readAt = now) else it }

fun flipRead(current: NotificationsResponse, id: String, now: String = java.time.Instant.now().toString()): NotificationsResponse {
    val target = current.notifications.find { it.id == id }
    if (target == null || target.readAt != null) return current
    return current.copy(
        notifications = flipList(current.notifications, id, now),
        groups = current.groups.copy(
            today = flipList(current.groups.today, id, now),
            yesterday = flipList(current.groups.yesterday, id, now),
            earlier = flipList(current.groups.earlier, id, now)
        ),
        unreadCount = (current.unreadCount - 1).coerceAtLeast(0)
    )
}

private fun flipAllList(list: List<NotificationDto>, now: String): List<NotificationDto> =
    list.map { if (it.readAt == null) it.copy(readAt = now) else it }

fun flipAllRead(current: NotificationsResponse, now: String = java.time.Instant.now().toString()): NotificationsResponse =
    current.copy(
        notifications = flipAllList(current.notifications, now),
        groups = current.groups.copy(
            today = flipAllList(current.groups.today, now),
            yesterday = flipAllList(current.groups.yesterday, now),
            earlier = flipAllList(current.groups.earlier, now)
        ),
        unreadCount = 0
    )

private fun dropList(list: List<NotificationDto>, id: String): List<NotificationDto> = list.filter { it.id != id }

fun dropNotif(current: NotificationsResponse, id: String, wasRead: Boolean): NotificationsResponse =
    current.copy(
        notifications = dropList(current.notifications, id),
        groups = current.groups.copy(
            today = dropList(current.groups.today, id),
            yesterday = dropList(current.groups.yesterday, id),
            earlier = dropList(current.groups.earlier, id)
        ),
        unreadCount = if (wasRead) current.unreadCount else (current.unreadCount - 1).coerceAtLeast(0)
    )
