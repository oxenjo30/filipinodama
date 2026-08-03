package com.filipinodama.app.navigation

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Pins the post-auth resume slot used by the App Links room-invite flow
 * (see [DeepLinks]).
 *
 * Joining a private room needs a real account, and an invite is how a new
 * player usually meets the app — so "tap invite → sign in → land back in the
 * room" is the commonest path through App Links, and the one most worth
 * protecting. These are plain state transitions with no android.net.Uri in
 * sight, so unlike the URL parsing they run on the JVM without Robolectric.
 *
 * DeepLinks is a process-scoped object, so each test clears it on the way out.
 */
class DeepLinksAfterAuthTest {

    @After
    fun tearDown() {
        DeepLinks.clearAfterAuth()
        DeepLinks.consume()
    }

    @Test
    fun `nothing parked yields null`() {
        assertNull(DeepLinks.takeAfterAuth())
    }

    @Test
    fun `parked route is returned after auth`() {
        val room = AppDestinations.privateRoom("ABC123", spectate = false)
        DeepLinks.parkForAuth(room)

        assertEquals(room, DeepLinks.takeAfterAuth())
    }

    @Test
    fun `taking the route consumes it so a later sign-in is not hijacked`() {
        // The whole point of one-shot semantics: signing in again later, from
        // somewhere unrelated, must not teleport the player into a stale room.
        DeepLinks.parkForAuth(AppDestinations.privateRoom("ABC123", spectate = false))

        assertEquals(AppDestinations.privateRoom("ABC123", spectate = false), DeepLinks.takeAfterAuth())
        assertNull(DeepLinks.takeAfterAuth())
    }

    @Test
    fun `backing out of the auth flow drops the invite`() {
        DeepLinks.parkForAuth(AppDestinations.privateRoom("ABC123", spectate = false))

        DeepLinks.clearAfterAuth()

        assertNull(DeepLinks.takeAfterAuth())
    }

    @Test
    fun `spectate intent survives the auth round trip`() {
        // A spectate invite that came back as a plain join would silently drop
        // the recipient into the game as a PLAYER.
        val spectating = AppDestinations.privateRoom("ABC123", spectate = true)
        DeepLinks.parkForAuth(spectating)

        val resumed = DeepLinks.takeAfterAuth()

        assertEquals(spectating, resumed)
        assertEquals(true, resumed?.contains("spectate=1"))
    }

    @Test
    fun `the post-auth slot is independent of the pending slot`() {
        // They must not share storage: AppNavHost drains `pending` as soon as
        // the app is off Splash, so a room parked there while the player is on
        // the Login form would bounce them straight back out of it, forever.
        DeepLinks.parkForAuth(AppDestinations.privateRoom("ABC123", spectate = false))

        assertNull(DeepLinks.pending.value)

        DeepLinks.consume()
        assertEquals(AppDestinations.privateRoom("ABC123", spectate = false), DeepLinks.takeAfterAuth())
    }
}
