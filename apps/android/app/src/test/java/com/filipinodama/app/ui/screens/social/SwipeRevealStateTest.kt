package com.filipinodama.app.ui.screens.social

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Tests for [SwipeListState] — the pure reducer behind the Friends/
 * Notifications swipe-to-reveal gesture (mobile-screen-inventory.md
 * DATA/BEHAVIOR §3.2): only one row open at a time, opening a new row
 * auto-closes whichever was open.
 */
class SwipeRevealStateTest {

    @Test
    fun `no row is open initially`() {
        val state = SwipeListState()
        assertFalse(state.isOpen("row1"))
    }

    @Test
    fun `opening a row makes it the sole open row`() {
        val state = SwipeListState().open("row1")
        assertTrue(state.isOpen("row1"))
        assertFalse(state.isOpen("row2"))
    }

    @Test
    fun `opening a second row closes the first automatically`() {
        val state = SwipeListState().open("row1").open("row2")
        assertFalse(state.isOpen("row1"))
        assertTrue(state.isOpen("row2"))
    }

    @Test
    fun `closing the open row clears it`() {
        val state = SwipeListState().open("row1").close("row1")
        assertFalse(state.isOpen("row1"))
        assertEquals(null, state.openRowId)
    }

    @Test
    fun `closing a row that is not open is a no-op`() {
        val state = SwipeListState().open("row1")
        val next = state.close("row2")
        assertTrue(next.isOpen("row1")) // row1 stays open
    }

    @Test
    fun `closeAll clears any open row`() {
        val state = SwipeListState().open("row1")
        val next = state.closeAll()
        assertFalse(next.isOpen("row1"))
        assertEquals(null, next.openRowId)
    }
}
