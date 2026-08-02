package com.filipinodama.app.data

import com.filipinodama.app.data.match.ActiveMatchStore
import com.filipinodama.app.data.match.MatchRepository
import com.filipinodama.app.data.rooms.RoomRepository
import com.filipinodama.app.data.social.BlockRepository
import com.filipinodama.app.data.social.DmRepository
import com.filipinodama.app.data.social.GuildChatRepository
import com.filipinodama.app.data.social.NotificationsRepository
import com.filipinodama.app.data.social.PresenceRepository

/**
 * Session teardown — the ONE place a sign-out is performed.
 *
 * WHY THIS EXISTS (and why it isn't just inlined into AuthRepository.logout):
 *
 *  1. Clearing the cookie jar does NOT end the realtime session. The server
 *     authenticates a socket ONCE, at handshake, from the `fd_access` cookie
 *     (apps/server/src/realtime/index.ts). An already-established connection
 *     stays bound to the user it handshook as, for its entire life. So on a
 *     shared device, user A logging out and user B logging in left B driving
 *     A's socket: B's matchmaking joins, moves and chat emitted AS A (trophies
 *     and gold landing on A's account), while A's inbound DMs and notifications
 *     rendered on B's screen.
 *
 *  2. Every repository here is a process-wide `object` holding a StateFlow.
 *     Without an explicit reset, B saw A's cached DM threads, notification feed
 *     and match state before any refetch completed.
 *
 *  3. It lives in its own file rather than inside [AuthRepository] to avoid an
 *     import cycle: EconomyRepository already imports AuthRepository, so having
 *     AuthRepository reach back into the feature repositories would close a
 *     loop. Inverting the dependency — teardown wraps logout, logout knows
 *     nothing about teardown — keeps the graph acyclic.
 *
 * Call this instead of [AuthRepository.logout] from every sign-out entry point.
 */
suspend fun signOutAndResetSession() {
    // Best-effort server call + local credential clear first, so the user is
    // signed out even if the teardown below throws.
    AuthRepository.logout()

    // Kill the authenticated realtime connection. Must come before the repo
    // resets: each repo caches the Socket instance, and disconnect() nulls the
    // shared field so the next connect() mints a fresh, re-authenticated one.
    SocketClient.disconnect()

    resetSessionState()
}

/**
 * Reset every process-wide singleton that caches user-scoped state or socket
 * wiring. Split out from [signOutAndResetSession] so tests can exercise the
 * fan-out without a network call.
 *
 * Keep this list in sync when adding a new socket-backed or user-scoped
 * repository — a missed entry is a cross-account data leak, not a cosmetic bug.
 */
fun resetSessionState() {
    MatchRepository.hardReset()
    RoomRepository.hardReset()
    DmRepository.hardReset()
    NotificationsRepository.hardReset()
    PresenceRepository.hardReset()
    GuildChatRepository.hardReset()
    BlockRepository.hardReset()
    ActiveMatchStore.clear()
}
