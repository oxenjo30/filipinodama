package com.filipinodama.app.ui.screens.economy

import com.filipinodama.app.data.AuthSessionKey
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CheckoutSessionGuardTest {
    @Test fun `a batch captured for one session cannot continue after a same user relogin`() {
        val captured = AuthSessionKey(userId = "player", generation = 7)
        assertTrue(checkoutSessionIsCurrent(captured, AuthSessionKey(userId = "player", generation = 7)))
        assertFalse(checkoutSessionIsCurrent(captured, AuthSessionKey(userId = "player", generation = 8)))
        assertFalse(checkoutSessionIsCurrent(captured, AuthSessionKey(userId = "other", generation = 7)))
    }
}
