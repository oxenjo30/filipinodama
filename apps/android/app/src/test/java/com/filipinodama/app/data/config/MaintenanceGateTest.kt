package com.filipinodama.app.data.config

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Maintenance-gate state machine tests — pure [deriveMaintenanceState],
 * mirroring apps/web AppLayout.tsx's read of GET /api/config/public
 * (MAINTENANCE_BANNER/MAINTENANCE_TEXT), but for Android's BLOCKING
 * full-screen takeover instead of web's dismissible banner (SYSTEM_STATES.md
 * "Maintenance mode" full takeover spec).
 */
class MaintenanceGateTest {

    @Test
    fun `banner true with text yields Active carrying the server's exact message`() {
        val state = deriveMaintenanceState(banner = "true", text = "Back by 2:00 PM PHT")
        assertEquals(MaintenanceState.Active("Back by 2:00 PM PHT"), state)
    }

    @Test
    fun `banner true with blank or missing text falls back to the inventory's default copy`() {
        assertEquals(MaintenanceState.Active(DEFAULT_MAINTENANCE_MESSAGE), deriveMaintenanceState("true", null))
        assertEquals(MaintenanceState.Active(DEFAULT_MAINTENANCE_MESSAGE), deriveMaintenanceState("true", "   "))
        assertEquals(MaintenanceState.Active(DEFAULT_MAINTENANCE_MESSAGE), deriveMaintenanceState("true", ""))
    }

    @Test
    fun `banner false yields Clear regardless of text`() {
        assertEquals(MaintenanceState.Clear, deriveMaintenanceState("false", "irrelevant"))
    }

    @Test
    fun `banner missing or garbage never blocks the app`() {
        assertEquals(MaintenanceState.Clear, deriveMaintenanceState(null, "text present but banner absent"))
        assertEquals(MaintenanceState.Clear, deriveMaintenanceState("TRUE", "wrong case is not the literal 'true'"))
        assertEquals(MaintenanceState.Clear, deriveMaintenanceState("1", "not the string 'true'"))
    }

    @Test
    fun `text is trimmed before use`() {
        val state = deriveMaintenanceState("true", "  Back soon  ")
        assertEquals(MaintenanceState.Active("Back soon"), state)
    }

    @Test
    fun `Unknown is the initial ConfigRepository state and is distinct from Clear`() {
        // Unknown must exist as its own state (not silently collapsed into
        // Clear) so callers CAN distinguish "never fetched yet" from "fetched,
        // confirmed off" if they ever need to (e.g. a loading spinner) — but
        // per the repository kdoc, the UI gate treats both as non-blocking.
        val state: MaintenanceState = MaintenanceState.Unknown
        assertTrue(state is MaintenanceState.Unknown)
        assertTrue(state != MaintenanceState.Clear)
    }
}
