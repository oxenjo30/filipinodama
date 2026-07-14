package com.filipinodama.app.navigation

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Verifies the tablet width-cap route policy (see [TabletWidthCap.kt]).
 *
 * The cap centres and constrains page content on large screens for every screen
 * EXCEPT the game/board routes, whose fillMaxSize checkerboard must use the whole
 * width. A regression here would either squash the board (board route wrongly
 * capped) or leave a form stretched edge-to-edge (content route wrongly excluded),
 * so the exact membership of the full-width set is worth pinning down.
 */
class TabletWidthCapTest {

    @Test
    fun `board and pre-board routes are full-width (never capped)`() {
        // The checkerboard square + the loader/matchmaking flows that transition
        // straight into it must fill the screen on tablets, not sit in a 640dp column.
        assertTrue(isFullWidthRoute(AppDestinations.AI_GAME))
        assertTrue(isFullWidthRoute(AppDestinations.ONLINE_MATCH))
        assertTrue(isFullWidthRoute(AppDestinations.MATCHMAKING))
        assertTrue(isFullWidthRoute(AppDestinations.PRIVATE_ROOM))
        assertTrue(isFullWidthRoute(AppDestinations.SPECTATE_MATCH))
    }

    @Test
    fun `content routes are capped (not full-width)`() {
        // A representative spread of the 33 non-board screens — forms, lists, and
        // detail pages that read badly when stretched across a tablet.
        val capped = listOf(
            AppDestinations.LOGIN,
            AppDestinations.CREATE_ACCOUNT,
            AppDestinations.HOME,
            AppDestinations.STORE,
            AppDestinations.PROFILE,
            AppDestinations.SETTINGS,
            AppDestinations.WALLET,
            AppDestinations.LEADERBOARD,
            AppDestinations.GUILD,
            AppDestinations.MODE_SELECT,   // mode PICKER (cards) — not the board itself
            AppDestinations.AI_DIFFICULTY, // difficulty PICKER — not the board itself
            AppDestinations.TOURNAMENTS,
            AppDestinations.ACHIEVEMENTS
        )
        capped.forEach { route ->
            assertFalse("expected $route to be width-capped", isFullWidthRoute(route))
        }
    }

    @Test
    fun `null route is treated as capped (safe default)`() {
        // A transient null current-route (mid-navigation) must not accidentally
        // drop the cap — default to the safe, capped path.
        assertFalse(isFullWidthRoute(null))
    }
}
