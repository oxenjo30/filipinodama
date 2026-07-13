package com.filipinodama.app.data.config

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Watch Live PAGE gate tests — pure [deriveWatchLiveEnabled], the config-parse
 * + gating reducer for the WATCH_LIVE_ENABLED key of GET /api/config/public
 * (owner directive 2026-07-12: hide the Watch Live page, spectate untouched).
 *
 * Fail-direction is the OPPOSITE of [deriveMaintenanceState]: maintenance
 * fails OPEN (broken fetch never blocks the app), this fails CLOSED (broken/
 * missing config never un-hides a page the owner turned off). Only the
 * literal "true" shows the Live Match Browser entry + route.
 */
class WatchLiveGateTest {

    @Test
    fun `missing key hides the page - safe-off default`() {
        // A deployment whose Config table has no WATCH_LIVE_ENABLED row omits
        // the key entirely from /api/config/public — clients MUST treat that
        // as hidden, not fall back to the pre-directive always-shown behavior.
        assertFalse(deriveWatchLiveEnabled(null))
    }

    @Test
    fun `explicit false hides the page`() {
        assertFalse(deriveWatchLiveEnabled("false"))
    }

    @Test
    fun `explicit true shows the page`() {
        assertTrue(deriveWatchLiveEnabled("true"))
    }

    @Test
    fun `garbage or wrong-case values never un-hide the page`() {
        assertFalse(deriveWatchLiveEnabled("TRUE"))
        assertFalse(deriveWatchLiveEnabled("1"))
        assertFalse(deriveWatchLiveEnabled(""))
        assertFalse(deriveWatchLiveEnabled(" true "))
    }
}
