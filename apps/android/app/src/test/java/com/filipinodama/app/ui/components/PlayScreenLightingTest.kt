package com.filipinodama.app.ui.components

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The Play screen's lighting is mostly drawing, which is not usefully
 * unit-testable. Its *policy* is, and that is where the bugs would be: a wrong
 * motion budget means the light animates on a device the player asked to keep
 * still, and a falloff that leaves the far end of the shaft above zero paints a
 * visible hard edge across the floor.
 */
class PlayScreenLightingTest {

    // ── motion budget ────────────────────────────────────────────────────────

    @Test
    fun `animations disabled wins over everything`() {
        // Accessibility "remove animations" is the strongest signal there is; it
        // must not be downgraded to REDUCED by any other input.
        assertEquals(
            MotionBudget.OFF,
            resolveMotionBudget(powerSaveMode = false, animatorScale = 0f, lowRamDevice = false)
        )
        assertEquals(
            MotionBudget.OFF,
            resolveMotionBudget(powerSaveMode = true, animatorScale = 0f, lowRamDevice = true)
        )
    }

    @Test
    fun `battery saver and low ram reduce but do not stop`() {
        assertEquals(
            MotionBudget.REDUCED,
            resolveMotionBudget(powerSaveMode = true, animatorScale = 1f, lowRamDevice = false)
        )
        assertEquals(
            MotionBudget.REDUCED,
            resolveMotionBudget(powerSaveMode = false, animatorScale = 1f, lowRamDevice = true)
        )
    }

    @Test
    fun `a healthy device gets the full budget`() {
        assertEquals(
            MotionBudget.FULL,
            resolveMotionBudget(powerSaveMode = false, animatorScale = 1f, lowRamDevice = false)
        )
    }

    @Test
    fun `a slowed animator scale is not treated as disabled`() {
        // 0.5x means "slower", not "off" — only exactly 0 disables.
        assertEquals(
            MotionBudget.FULL,
            resolveMotionBudget(powerSaveMode = false, animatorScale = 0.5f, lowRamDevice = false)
        )
    }

    // ── mote pool ────────────────────────────────────────────────────────────

    @Test
    fun `mote cap falls with the budget and reaches zero when off`() {
        val full = moteCapFor(MotionBudget.FULL)
        val reduced = moteCapFor(MotionBudget.REDUCED)
        assertTrue("FULL should allow more motes than REDUCED", full > reduced)
        assertTrue("REDUCED should still allow some motes", reduced > 0)
        assertEquals(0, moteCapFor(MotionBudget.OFF))
    }

    // ── breathe curve ────────────────────────────────────────────────────────

    @Test
    fun `breathe stays positive and bounded across a long run`() {
        // The curve multiplies an alpha. Below zero would invert the light and
        // above ~1.1 would blow the shaft out to a white slab.
        var min = Float.MAX_VALUE
        var max = -Float.MAX_VALUE
        var t = 0f
        while (t < 600f) {
            val b = breatheAt(t)
            if (b < min) min = b
            if (b > max) max = b
            t += 0.05f
        }
        assertTrue("breathe dipped to $min", min > 0.3f)
        assertTrue("breathe peaked at $max", max < 1.1f)
    }

    @Test
    fun `breathe is not a single sine`() {
        // Two out-of-phase terms are what stop the loop being spottable. If the
        // second term is ever dropped, the curve becomes exactly periodic at
        // 2pi/0.42 and this catches it.
        val period = (2.0 * Math.PI / 0.42).toFloat()
        val a = breatheAt(1f)
        val b = breatheAt(1f + period)
        assertTrue("curve repeated exactly after one period", Math.abs(a - b) > 1e-3f)
    }

    // ── shaft falloff ────────────────────────────────────────────────────────

    @Test
    fun `shaft falloff starts soft peaks early and ends at zero`() {
        assertTrue(shaftFalloff(0f) in 0.5f..0.6f)
        assertEquals(1f, shaftFalloff(0.16f), 1e-3f)
        // Must reach exactly zero at the far end or the shaft paints a hard
        // horizontal edge where it stops.
        assertEquals(0f, shaftFalloff(1f), 1e-4f)
    }

    @Test
    fun `shaft falloff is clamped outside its domain`() {
        assertEquals(0f, shaftFalloff(1.5f), 1e-4f)
        assertTrue(shaftFalloff(-0.2f) >= 0f)
    }

    @Test
    fun `shaft falloff decreases monotonically after the peak`() {
        var previous = Float.MAX_VALUE
        var f = 0.16f
        while (f <= 1f) {
            val v = shaftFalloff(f)
            assertTrue("falloff rose at f=$f", v <= previous + 1e-4f)
            previous = v
            f += 0.01f
        }
    }

    // ── icon brightness ──────────────────────────────────────────────────────

    @Test
    fun `bright icon matrix preserves alpha and lifts luminance`() {
        val m = brightIconMatrix()
        val v = m.values
        // Alpha row must be untouched, or icons change opacity as well as
        // brightness and the tab bar's dim/active distinction stops working.
        assertEquals(0f, v[15], 1e-6f)
        assertEquals(0f, v[16], 1e-6f)
        assertEquals(0f, v[17], 1e-6f)
        assertEquals(1f, v[18], 1e-6f)
        assertEquals(0f, v[19], 1e-6f)

        // A neutral grey must come out brighter than it went in.
        val g = 0.5f
        val outR = v[0] * g + v[1] * g + v[2] * g
        assertTrue("grey was not brightened: $outR", outR > g)
    }

    @Test
    fun `bright icon matrix at unit settings is close to identity`() {
        val v = brightIconMatrix(brightness = 1f, saturation = 1f).values
        assertEquals(1f, v[0], 1e-5f)
        assertEquals(0f, v[1], 1e-5f)
        assertEquals(1f, v[6], 1e-5f)
        assertEquals(1f, v[12], 1e-5f)
    }
}
