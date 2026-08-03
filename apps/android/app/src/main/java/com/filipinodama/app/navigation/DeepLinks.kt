package com.filipinodama.app.navigation

import android.content.Intent
import android.net.Uri
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Android App Links entry point — turns an incoming https://filipinodama.com
 * URL into an in-app route.
 *
 * Only the paths declared in AndroidManifest's autoVerify intent-filter can
 * ever reach here, and this maps a deliberately SMALL allow-list of them.
 * Anything unrecognised returns null and is ignored rather than guessed at:
 * silently dumping someone on Home after they tapped a specific link is worse
 * than letting the browser handle it.
 *
 * Why a holding object rather than Navigation's own `deepLink =` support: the
 * nav graph's start destination is SPLASH, which resolves the session and then
 * redirects to LOGIN or HOME. A route navigated at graph-construction time is
 * clobbered by that redirect, so the pending route is parked here and consumed
 * by AppNavHost once the session has settled (see its LaunchedEffect).
 */
object DeepLinks {

    private const val HOST = "filipinodama.com"

    private val _pending = MutableStateFlow<String?>(null)

    /** In-app route awaiting navigation, or null. Consumed by AppNavHost. */
    val pending: StateFlow<String?> = _pending

    /** Records the route for [intent] if it is a link we handle. */
    fun offer(intent: Intent?) {
        routeFor(intent)?.let { _pending.value = it }
    }

    /** Clears the pending route once it has been navigated to. */
    fun consume() {
        _pending.value = null
    }

    private val _afterAuth = MutableStateFlow<String?>(null)

    /**
     * Route to return to once the player finishes signing in.
     *
     * Deliberately SEPARATE from [pending]: AppNavHost consumes `pending` as
     * soon as the app is off Splash, so parking a room there while the player
     * is sitting on the Login form would bounce them straight back out of it,
     * and round and round.
     *
     * Joining a room needs a real account, and an invite is how a NEW player
     * usually meets the app — so "tap invite, sign up, get dumped on Home with
     * the code gone" is the single most likely path through this feature.
     */
    fun parkForAuth(route: String) {
        _afterAuth.value = route
    }

    /** Returns the parked post-auth route, clearing it. Null if none. */
    fun takeAfterAuth(): String? = _afterAuth.value.also { _afterAuth.value = null }

    /**
     * Drops the parked route when the player backs out of the auth flow.
     * Without this it would linger and silently teleport them into a stale
     * room the next time they signed in from somewhere else entirely.
     */
    fun clearAfterAuth() {
        _afterAuth.value = null
    }

    /** Route for an ACTION_VIEW intent, or null when it is not ours. */
    fun routeFor(intent: Intent?): String? {
        if (intent?.action != Intent.ACTION_VIEW) return null
        return intent.data?.let(::routeFor)
    }

    /**
     * Route for [uri], or null if unhandled.
     *
     * Host and scheme are re-checked even though the intent-filter already
     * constrains them: this is also reachable from a plain ACTION_VIEW another
     * app fires, and the room code is fed straight into a navigation route.
     */
    fun routeFor(uri: Uri): String? {
        if (!uri.scheme.equals("https", ignoreCase = true)) return null
        if (!uri.host.equals(HOST, ignoreCase = true)) return null

        // getQueryParameter throws on opaque URIs; https + a host is hierarchical,
        // but a malformed link should be ignored rather than crash the launch.
        return runCatching {
            when (uri.path?.trimEnd('/')?.ifEmpty { "/" }) {
                // Mirrors apps/web /rooms?code=X&spectate=1, the exact shape
                // PrivateRoomScreen hands out when a host shares a room.
                "/rooms" -> {
                    val code = uri.getQueryParameter("code")
                        ?.trim()
                        ?.takeIf { it.isNotEmpty() }
                    val spectate = uri.getQueryParameter("spectate") == "1"
                    // Encoded because it lands inside a route query string —
                    // an unescaped & or / would silently split the route.
                    AppDestinations.privateRoom(code?.let(Uri::encode), spectate)
                }

                else -> null
            }
        }.getOrNull()
    }
}
