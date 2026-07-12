package com.filipinodama.app.data.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * RankTiers tests — verifies this Kotlin port of packages/shared/src/ranks.ts
 * RANK_TIERS / rankTierFor() matches the TS source's floors and "highest
 * tier whose min <= trophies" selection rule exactly.
 */
class RankTiersTest {

    @Test
    fun `there are exactly 7 tiers matching ranks-ts verbatim`() {
        assertEquals(7, RankTiers.TIERS.size)
        assertEquals(listOf("squire", "mandirigma", "kabalyero", "bayani", "datu", "star-guardian", "alamat"), RankTiers.TIERS.map { it.key })
    }

    @Test
    fun `zero trophies is Squire`() {
        assertEquals("squire", RankTiers.forTrophies(0).key)
    }

    @Test
    fun `trophies exactly at a tier floor selects that tier`() {
        assertEquals("mandirigma", RankTiers.forTrophies(300).key)
        assertEquals("datu", RankTiers.forTrophies(1100).key)
        assertEquals("alamat", RankTiers.forTrophies(1800).key)
    }

    @Test
    fun `trophies one below a tier floor stays on the previous tier`() {
        assertEquals("squire", RankTiers.forTrophies(299).key)
        assertEquals("bayani", RankTiers.forTrophies(1099).key)
    }

    @Test
    fun `trophies far above the top tier still resolves to the top tier`() {
        assertEquals("alamat", RankTiers.forTrophies(99999).key)
    }

    @Test
    fun `negative trophies (defensive) still resolves to the floor tier, never crashes`() {
        assertEquals("squire", RankTiers.forTrophies(-50).key)
    }

    @Test
    fun `next returns the tier immediately above, or null at the top`() {
        val squire = RankTiers.forTrophies(0)
        assertEquals("mandirigma", RankTiers.next(squire)?.key)

        val alamat = RankTiers.forTrophies(1800)
        assertNull(RankTiers.next(alamat))
    }

    @Test
    fun `tiers are ordered by ascending min`() {
        val mins = RankTiers.TIERS.map { it.min }
        assertEquals(mins.sorted(), mins)
        assertTrue(mins.zipWithNext().all { (a, b) -> a < b })
    }
}
