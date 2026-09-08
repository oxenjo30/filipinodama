package com.filipinodama.app.ui.screens.auth

import org.junit.Assert.*
import org.junit.Test

class AuthInputRegressionTest {
    @Test fun `native watcher dispatches deletion to empty against current model`() {
        val calls = mutableListOf<String>()
        assertTrue(dispatchAuthFieldTextChange("typed", "") { calls += it })
        assertEquals(listOf(""), calls)
    }
    @Test fun `native watcher skips only current model value`() {
        assertFalse(dispatchAuthFieldTextChange("synced", "synced") { error("must not dispatch") })
    }
    @Test fun `password update preserves bounded selection and skips unchanged type`() {
        val unchanged = passwordInputTypeUpdate(129, 129, 2, 4, 8)
        assertFalse(unchanged.shouldAssignInputType)
        assertEquals(2, unchanged.selectionStart)
        assertEquals(4, unchanged.selectionEnd)
        val changed = passwordInputTypeUpdate(129, 145, -1, 99, 8)
        assertTrue(changed.shouldAssignInputType)
        assertEquals(0, changed.selectionStart)
        assertEquals(8, changed.selectionEnd)
    }
}
