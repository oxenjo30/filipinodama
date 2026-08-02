package com.filipinodama.app.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import com.filipinodama.app.data.social.PresenceRepository

/**
 * Subscribes the calling screen to live friend presence for as long as it is in
 * the composition, and tears the subscription down once the LAST presence screen
 * leaves.
 *
 * [PresenceRepository.start] attaches a `presence:update` listener to the
 * process-wide socket. Nothing ever called [PresenceRepository.stop], so once any
 * social screen had been opened the app kept decoding presence pushes — and
 * recomposing off them — for the rest of the process, on every screen, forever.
 *
 * The ref-count is the whole point, not incidental bookkeeping.
 * [PresenceRepository] is a singleton with no notion of "how many screens still
 * want presence", and NavHost cross-fades: during a transition the DESTINATION
 * composes (and subscribes) BEFORE the source is disposed. A plain
 * `onDispose { PresenceRepository.stop() }` on each screen would therefore fire
 * *after* the screen the user just opened had subscribed, and `stop()` clears the
 * online set + detaches the shared listener — leaving that screen showing every
 * genuinely-online friend as "Offline" with no way to recover. That is the exact
 * wrong-data failure PublicProfileScreen's status pill already goes out of its
 * way to avoid, so it must not be reintroduced here. Friends -> chat,
 * Friends -> public profile and Messages -> thread all hit that overlap.
 *
 * Counting is main-thread-only (composition + effects), so a plain Int is safe.
 *
 * @param enabled pass false while signed out: presence is friends-only server
 *   side, so subscribing would open an authenticated socket to learn nothing.
 */
@Composable
fun PresenceSubscription(enabled: Boolean = true) {
    DisposableEffect(enabled) {
        if (!enabled) return@DisposableEffect onDispose { }
        subscribers++
        // Re-entering a presence screen also re-pings for a fresh snapshot, which
        // is what the per-screen start() calls used to do on every entry.
        PresenceRepository.start()
        onDispose {
            subscribers--
            if (subscribers <= 0) {
                subscribers = 0
                PresenceRepository.stop()
            }
        }
    }
}

private var subscribers = 0
