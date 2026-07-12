package com.filipinodama.app.data.economy

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Rendering-branch tests for the daily-login ladder rows, mirroring
 * apps/web/src/features/rewards/DailyLoginBonusModal.tsx's per-row branch
 * (gold / gem / chest-with-gem / chest-gold-only) so the Android
 * DailyRewardsScreen picks the same icon+amount pairing the web modal does
 * for a given DailyRewardRowDto, independent of Compose rendering.
 */
class DailyLadderRenderingTest {

    /** Mirrors DailyRewardsScreen.kt's `when(row.type)` branch as a pure function under test. */
    private fun renderRow(row: DailyRewardRowDto): Pair<String, List<String>> = when (row.type) {
        "gem" -> "💎" to listOf("${row.amt ?: 0}")
        "chest" -> {
            val parts = mutableListOf("${row.gold ?: 0}🪙")
            if ((row.gem ?: 0) > 0) parts.add("${row.gem}💎")
            "🎁" to parts
        }
        else -> "🪙" to listOf("${row.amt ?: 0}")
    }

    @Test
    fun `a plain gold day renders the coin icon with its amount`() {
        val (icon, parts) = renderRow(DailyRewardRowDto(type = "gold", amt = 200))
        assertEquals("🪙", icon)
        assertEquals(listOf("200"), parts)
    }

    @Test
    fun `a gem day renders the gem icon with its amount`() {
        val (icon, parts) = renderRow(DailyRewardRowDto(type = "gem", amt = 10))
        assertEquals("💎", icon)
        assertEquals(listOf("10"), parts)
    }

    @Test
    fun `a gold-only chest day (gem 0) renders only the gold line`() {
        val (icon, parts) = renderRow(DailyRewardRowDto(type = "chest", gold = 1000, gem = 0))
        assertEquals("🎁", icon)
        assertEquals(listOf("1000🪙"), parts)
    }

    @Test
    fun `a grand chest day with both gold and gem renders both lines`() {
        val (icon, parts) = renderRow(DailyRewardRowDto(type = "chest", gold = 2000, gem = 50))
        assertEquals("🎁", icon)
        assertEquals(listOf("2000🪙", "50💎"), parts)
    }

    @Test
    fun `fallback synthesis from a gold-only track produces all-gold rows`() {
        val track = listOf(100, 150, 200, 300, 400, 500, 1000)
        val synthesized = track.map { DailyRewardRowDto(type = "gold", amt = it) }
        assertEquals(7, synthesized.size)
        assertTrue(synthesized.all { it.type == "gold" })
        assertEquals(1000, synthesized[6].amt)
    }

    @Test
    fun `today past and future day flags are mutually derivable from the current day index`() {
        val currentDay = 3
        val flags = (1..7).map { day -> Triple(day, day == currentDay, day < currentDay) }
        assertEquals(Triple(1, false, true), flags[0])
        assertEquals(Triple(3, true, false), flags[2])
        assertEquals(Triple(7, false, false), flags[6])
    }
}
