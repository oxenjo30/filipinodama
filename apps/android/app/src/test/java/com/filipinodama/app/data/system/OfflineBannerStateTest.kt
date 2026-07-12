package com.filipinodama.app.data.system

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Offline-banner reducer tests — [offlineBannerVisible], the pure decision
 * behind SYSTEM_STATES.md's `isOffline` top strip. Kept separate from
 * [ConnectivityObserver] (which needs a real Android ConnectivityManager and
 * so isn't exercised by plain JVM tests, matching this project's established
 * "extract the pure decision" convention) so the actual show/hide RULE is
 * covered directly.
 */
class OfflineBannerStateTest {

    @Test
    fun `banner is hidden while online`() {
        assertFalse(offlineBannerVisible(isOnline = true))
    }

    @Test
    fun `banner shows the instant connectivity is lost`() {
        assertTrue(offlineBannerVisible(isOnline = false))
    }

    @Test
    fun `banner clears again on reconnect — a transition back to online yields hidden`() {
        var visible = offlineBannerVisible(isOnline = false)
        assertTrue(visible)

        visible = offlineBannerVisible(isOnline = true)
        assertFalse(visible)
    }
}
