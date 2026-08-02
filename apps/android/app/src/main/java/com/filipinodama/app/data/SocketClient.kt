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
     * Connects (or returns the existing connection) using an explicit
     * [okHttpClient] — exposed for tests that need to inject a fake client.
     * [token] is an optional `auth.token` courtesy fallback for a future flow
     * where an explicit token becomes available; the server tries the cookie
     * first regardless.
     *
     * IDENTITY CONTRACT: the returned socket is stable for the whole session.
     * Only [disconnect] ever replaces it. Consumers may therefore cache the
     * instance and key their listener registration on it (see the repositories'
     * `wiredSocket` pattern).
     */
    @Synchronized
    fun connect(okHttpClient: OkHttpClient, token: String? = null): Socket? {
        // Return ANY existing instance — connected or not. socket.io-client
        // reconnects itself (unlimited attempts, exponential backoff), so a
        // socket reporting !connected() is mid-backoff, NOT dead.
        //
        // Handing back a NEW socket in that window was a real defect: consumers
        // cache the instance and guard listener registration, so the replacement
        // arrived with NO listeners and every inbound event (mm:found,
        // match:moved, notif:new, ...) was dropped for the rest of the process.
        // Tapping Quick Match after a brief network blip therefore hung on
        // "Finding opponent..." forever while the server paired the player into
        // a match they never entered — a disconnect-forfeit, losing trophies in
        // RANKED.
        //
        // @Synchronized additionally closes the cold-start race where two
        // sibling LaunchedEffects (Notifications + Presence on Home) both saw an
        // unconnected socket and opened TWO authenticated connections per user.
        socket?.let { return it }

        // SocketOptionBuilder only exposes the primitive fields declared directly
        // on IO.Options/Manager.Options; callFactory/webSocketFactory/extraHeaders
        // live further up the hierarchy on engine.io-client's Transport.Options and
        // are plain public fields (no builder setters exist for them), so IO.Options
        // is constructed directly here instead of via the fluent builder.
        val options = IO.Options().apply {
            path = SOCKET_PATH
            // Polling-first, then upgrade to websocket — MATCHES THE WEB CLIENT
            // (apps/web/src/lib/socket.ts). websocket-ONLY was the bug behind
            // "matchmaking never finds a match / the 8-20s AI fallback never
            // fires": a raw websocket upgrade could fail to carry the fd_access
            // cookie, so the socket never authenticated and the server never
            // received mm:join. The HTTP long-polling handshake is a normal XHR
            // through OkHttp's cookie jar, so it reliably carries fd_access,
            // authenticates, THEN upgrades to websocket (server has upgrades on).
            // Matchmaking is the only realtime feature with no REST fallback, so
            // it was the one that visibly broke; presence/chat/rooms/DM degraded
            // silently under the same failure.
            transports = arrayOf("polling", "websocket")
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

    /**
     * Tears the shared socket down completely — call on LOGOUT / account
     * deletion so the next sign-in gets a fresh, re-authenticated handshake.
     * The server authenticates a socket ONCE, at handshake, from the fd_access
     * cookie; clearing the cookie jar does NOT drop an already-established
     * connection, so without this the live socket stays bound to the previous
     * user's identity.
     *
     * The bare [Socket.off] here strips EVERY repository's listeners, which is
     * exactly right for a total teardown (and is the one place it's allowed —
     * partial teardown must always name its event, see GuildChatRepository).
     * Callers MUST pair this with a reset of the repositories that cache the
     * instance, or they will keep emitting into a dead socket: use
     * [resetSessionState], which does both.
     */
    @Synchronized
    fun disconnect() {
        socket?.disconnect()
        socket?.off()
        socket = null
    }
}
