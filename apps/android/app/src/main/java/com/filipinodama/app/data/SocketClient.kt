package com.filipinodama.app.data

import com.filipinodama.app.BuildConfig
import io.socket.client.IO
import io.socket.client.Socket
import java.net.URISyntaxException
import okhttp3.OkHttpClient

/**
 * Wrapper around the Socket.IO v4 client, matching the server contract
 * verified in apps/server/src/realtime/index.ts:
 *  - single namespace at path `/rt` (not a Socket.IO custom namespace — the
 *    Engine.IO/Socket.IO HTTP path).
 *  - `io.use` authenticate() reads EITHER the `fd_access` httpOnly cookie OR
 *    `handshake.auth.token`, cookie taking priority. Since the app's JWT is
 *    httpOnly (never readable from app code, same as the web client can't
 *    read it from JS), we authenticate via the COOKIE path: the socket's
 *    underlying OkHttp client reuses [ApiClient]'s shared OkHttpClient
 *    (same [PersistentCookieJar]), so the polling/handshake requests carry
 *    `fd_access` automatically, exactly like a same-origin browser request.
 *  - device classification (classifyDevice, index.ts) is pure User-Agent
 *    sniffing: `/mobi|android|iphone/i` -> "mobile". We set a custom
 *    User-Agent extraHeader containing "Android" so mmFound's opponent
 *    device badge (and our own reported device) reads "mobile" server-side.
 *
 * Reconnection: left at socket.io-client's library defaults (reconnection
 * enabled, unlimited attempts, exponential backoff via
 * reconnectionDelay/reconnectionDelayMax + randomizationFactor) — mirrors
 * the web client, which also relies on socket.io's built-in reconnection
 * rather than any custom backoff.
 */
object SocketClient {

    private const val SOCKET_PATH = "/rt"
    private const val MOBILE_USER_AGENT = "FilipinoDama-Android/1.0 (Android)"

    @Volatile
    private var socket: Socket? = null

    /**
     * Connects using [ApiClient]'s shared OkHttpClient (same cookie jar as REST
     * calls — [ApiClient.init] must have already run, same precondition as
     * [ApiClient.create]).
     */
    fun connect(token: String? = null): Socket? = connect(ApiClient.okHttpClient, token)

    /**
     * Connects (or returns the existing live connection) using an explicit
     * [okHttpClient] — exposed for tests that need to inject a fake client.
     * [token] is an optional `auth.token` courtesy fallback for a future flow
     * where an explicit token becomes available; the server tries the cookie
     * first regardless.
     */
    fun connect(okHttpClient: OkHttpClient, token: String? = null): Socket? {
        val existing = socket
        if (existing != null && existing.connected()) return existing

        // SocketOptionBuilder only exposes the primitive fields declared directly
        // on IO.Options/Manager.Options; callFactory/webSocketFactory/extraHeaders
        // live further up the hierarchy on engine.io-client's Transport.Options and
        // are plain public fields (no builder setters exist for them), so IO.Options
        // is constructed directly here instead of via the fluent builder.
        val options = IO.Options().apply {
            path = SOCKET_PATH
            transports = arrayOf("websocket")
            extraHeaders = mapOf("User-Agent" to listOf(MOBILE_USER_AGENT))
            callFactory = okHttpClient
            webSocketFactory = okHttpClient
            if (token != null) auth = mapOf("token" to token)
        }

        val newSocket = try {
            IO.socket(BuildConfig.BASE_URL, options)
        } catch (e: URISyntaxException) {
            return null
        }
        socket = newSocket
        newSocket.connect()
        return newSocket
    }

    /** The current socket, if one has ever been created (may or may not be connected). */
    fun current(): Socket? = socket

    fun disconnect() {
        socket?.disconnect()
        socket?.off()
        socket = null
    }
}
