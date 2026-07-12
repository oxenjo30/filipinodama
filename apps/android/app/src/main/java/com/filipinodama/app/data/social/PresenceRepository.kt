package com.filipinodama.app.data.social

import com.filipinodama.app.data.ApiClient
import com.filipinodama.app.data.SocketClient
import io.socket.client.Socket
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * PresenceRepository — live online/offline state for the signed-in user's
 * friends, a direct Compose port of apps/web/src/stores/presenceStore.ts.
 *
 * On [start] we connect the shared socket, emit `presence:ping` (the server
 * replies with a snapshot of currently-online friend ids), and subscribe to
 * incremental `presence:update` pushes (one friend coming online/offline).
 * The UI reads [isOnline] or the raw [online] set. Nothing here is fabricated
 * — a friend is "online" only while the server reports them connected
 * (apps/server/src/realtime/presence.ts).
 */
object PresenceRepository {

    private object EV {
        const val presencePing = "presence:ping"
        const val presenceUpdate = "presence:update"
    }

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private val _online = MutableStateFlow<Set<String>>(emptySet())
    val online: StateFlow<Set<String>> = _online.asStateFlow()

    private var started = false
    private var socket: Socket? = null

    fun isOnline(userId: String): Boolean = _online.value.contains(userId)

    fun start() {
        if (started) return
        started = true
        try {
            val s = SocketClient.connect(ApiClient.okHttpClient) ?: run {
                started = false
                return
            }
            socket = s
            s.off(EV.presenceUpdate)
            s.on(EV.presenceUpdate) { args -> onUpdate(args) }
            s.emit(EV.presencePing)
        } catch (_: Exception) {
            // Live presence unavailable — everyone shows offline (honest), no crash.
            started = false
        }
    }

    fun stop() {
        socket?.off(EV.presenceUpdate)
        _online.value = emptySet()
        started = false
    }

    /** Re-request a snapshot (e.g. after reconnect or entering the Friends screen). */
    fun ping() {
        socket?.emit(EV.presencePing)
    }

    private fun onUpdate(args: Array<Any>) {
        val raw = args.firstOrNull()?.toString() ?: return
        val obj = try {
            json.parseToJsonElement(raw) as? JsonObject ?: return
        } catch (_: Exception) {
            return
        }
        applyUpdate(obj)
    }

    /** Pulled out as a pure function so it's unit-testable without a live socket. */
    fun applyUpdate(p: JsonObject) {
        val snapshot = p["snapshot"] as? JsonArray
        if (snapshot != null) {
            _online.value = snapshot.mapNotNull { el ->
                if (el is JsonNull) null else el.jsonPrimitive.content
            }.toSet()
            return
        }
        val userIdEl = p["userId"]
        val statusEl = p["status"]
        if (userIdEl != null && userIdEl !is JsonNull && statusEl != null && statusEl !is JsonNull) {
            val userId = userIdEl.jsonPrimitive.content
            val status = statusEl.jsonPrimitive.content
            _online.update { current ->
                if (status == "online") current + userId else current - userId
            }
        }
    }

    /** Test/teardown hook. */
    fun hardReset() {
        started = false
        socket = null
        _online.value = emptySet()
    }
}
