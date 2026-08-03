package com.filipinodama.app.data.tournaments

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Unit tests for [TournamentDisplay] — the pure mapping from the server's
 * real TournamentStatus values (OPEN/RUNNING) to the mockup's computed
 * display copy (tourStripLabel/tourStripReady/_stMapT), ported verbatim from
 * FilipinoDama Mobile.dc.html's renderVals(). No network/Compose dependency,
 * so this is plain JVM-testable logic per the task's "add tests for any new
 * pure logic" instruction.
 */
class TournamentDisplayTest {

    private fun item(
        status: String,
        id: String = "t1",
        name: String = "Cup",
        format: String = "SINGLE_ELIM",
        entryFeeGold: Int = 0,
        prizePoolGold: Int = 1000,
        maxPlayers: Int = 16,
        registered: Int = 4
    ) = TournamentListItemDto(
        id = id,
        name = name,
        format = format,
        status = status,
        entryFeeGold = entryFeeGold,
        prizePoolGold = prizePoolGold,
        maxPlayers = maxPlayers,
        registered = registered
    )

    // ── stripLabel / stripReady (Home hub strip) ──

    @Test
    fun `stripLabel is the empty-state copy when no tournaments`() {
        assertEquals("None running · check back soon", TournamentDisplay.stripLabel(emptyList()))
    }

    @Test
    fun `stripLabel counts only RUNNING as live`() {
        val items = listOf(item(status = "RUNNING"), item(status = "OPEN"), item(status = "OPEN"))
        assertEquals("1 live · 2 upcoming — join a cup", TournamentDisplay.stripLabel(items))
    }

    @Test
    fun `stripLabel with only upcoming omits the live segment`() {
        val items = listOf(item(status = "OPEN"))
        assertEquals("1 upcoming — join a cup", TournamentDisplay.stripLabel(items))
    }

    @Test
    fun `stripLabel with only live omits the upcoming segment`() {
        val items = listOf(item(status = "RUNNING"), item(status = "RUNNING"))
        assertEquals("2 live — join a cup", TournamentDisplay.stripLabel(items))
    }

    @Test
    fun `stripReady is true only when a RUNNING tournament exists`() {
        assertTrue(TournamentDisplay.stripReady(listOf(item(status = "RUNNING"))))
        assertFalse(TournamentDisplay.stripReady(listOf(item(status = "OPEN"))))
        assertFalse(TournamentDisplay.stripReady(emptyList()))
    }

    // ── statusPill (per-row list badge) ──

    @Test
    fun `statusPill maps RUNNING to the Live badge`() {
        val pill = TournamentDisplay.statusPill("RUNNING")
        assertEquals("● Live", pill.label)
    }

    @Test
    fun `statusPill maps OPEN to the Upcoming badge`() {
        val pill = TournamentDisplay.statusPill("OPEN")
        assertEquals("Upcoming", pill.label)
    }

    @Test
    fun `statusPill falls back to Upcoming for any other status rather than crashing`() {
        val pill = TournamentDisplay.statusPill("COMPLETED")
        assertEquals("Upcoming", pill.label)
    }

    // ── formatLabel ──

    @Test
    fun `formatLabel shows free entry when entryFeeGold is zero`() {
        val label = TournamentDisplay.formatLabel(item(status = "OPEN", format = "SINGLE_ELIM", entryFeeGold = 0, maxPlayers = 32))
        assertEquals("Single elimination · 32 players · Free entry", label)
    }

    @Test
    fun `formatLabel shows the gold fee when entryFeeGold is positive`() {
        val label = TournamentDisplay.formatLabel(item(status = "OPEN", format = "SWISS", entryFeeGold = 250, maxPlayers = 8))
        assertEquals("Swiss · 8 players · 250 🪙 entry", label)
    }

    @Test
    fun `formatLabel maps every real TournamentFormat enum value to display copy`() {
        assertEquals(
            "Double elimination · 16 players · Free entry",
            TournamentDisplay.formatLabel(item(status = "OPEN", format = "DOUBLE_ELIM"))
        )
        assertEquals(
            "Round robin · 16 players · Free entry",
            TournamentDisplay.formatLabel(item(status = "OPEN", format = "ROUND_ROBIN"))
        )
        // An unmapped format falls through to the raw enum string, so every new
        // one has to be named here or the row shows players a SCREAMING_CASE id.
        assertEquals(
            "Groups + Double Elim · 16 players · Free entry",
            TournamentDisplay.formatLabel(item(status = "OPEN", format = TournamentGroups.FORMAT))
        )
    }

    // ── playersLabel ──

    @Test
    fun `playersLabel joins registered over maxPlayers`() {
        val label = TournamentDisplay.playersLabel(item(status = "OPEN", registered = 5, maxPlayers = 16))
        assertEquals("5/16 joined", label)
    }
}
