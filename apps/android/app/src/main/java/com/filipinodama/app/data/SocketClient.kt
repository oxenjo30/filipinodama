package com.filipinodama.app.data

import com.filipinodama.app.BuildConfig
import io.socket.client.IO
import io.socket.client.Socket
import java.net.URISyntaxException

/**
 * Stub wrapper around the Socket.IO v4 client, matching API_SPEC.md's
 * WebSocket contract: single authenticated namespace at path `/rt`, auth
 * handshake carries the access token, Redis adapter is server-side only
 * (irrelevant to the client), presence heartbeat ~20s (irrelevant to
 * Phase 1).
 *
 * Nothing here actually connects yet — .connect() is never called from
 * anywhere in Phase 1. This just proves the plumbing point exists for
 * Phase 2+ to wire up matchmaking / match / presence / chat events.
 */
object SocketClient {

    private const val SOCKET_PATH = "/rt"

    @Volatile
    private var socket: Socket? = null

    /**
     * TODO(Phase 2+): call this once the user is authenticated. [token] is
     * passed via the `auth.token` handshake field per API_SPEC.md ("Auth
     * handshake carries the access token"). If the server instead accepts
     * the httpOnly cookie automatically (since OkHttp/PersistentCookieJar
     * already attaches it on same-origin requests), [token] may be left
     * null and the server should fall back to reading the cookie header —
     * confirm which path the server actually expects before wiring this
     * for real.
     */
    fun connect(token: String? = null): Socket? {
        val existing = socket
        if (existing != null && existing.connected()) return existing

        val optionsBuilder = IO.Options.builder()
            .setPath(SOCKET_PATH)
            .setTransports(arrayOf("websocket"))

        if (token != null) {
            optionsBuilder.setAuth(mapOf("token" to token))
        }

        val newSocket = try {
            IO.socket(BuildConfig.BASE_URL, optionsBuilder.build())
        } catch (e: URISyntaxException) {
            return null
        }
        socket = newSocket

        // TODO(Phase 2+): newSocket.connect() — intentionally NOT called in
        // Phase 1. Also wire on(Socket.EVENT_CONNECT_ERROR, ...) and the
        // presence:ping heartbeat (~20s) once real screens consume this.
        return newSocket
    }

    fun disconnect() {
        socket?.disconnect()
        socket?.off()
        socket = null
    }
}
