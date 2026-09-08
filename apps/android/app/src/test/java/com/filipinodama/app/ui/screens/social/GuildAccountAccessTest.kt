package com.filipinodama.app.ui.screens.social

import com.filipinodama.app.data.AuthUser
import org.junit.Assert.*
import org.junit.Test

class GuildAccountAccessTest {
    @Test fun `only real accounts can mutate guilds and stale membership loads are rejected`() {
        assertFalse(isRealGuildAccount(null))
        assertFalse(isRealGuildAccount(AuthUser(id = "id", username = "name", displayName = "Name", tag = "#1", isGuest = true)))
        assertTrue(isRealGuildAccount(AuthUser(id = "id", username = "name", displayName = "Name", tag = "#1", isGuest = false)))
        val gate = GuildMembershipLoadGate(); val stale = gate.begin(); val current = gate.begin()
        assertFalse(gate.isCurrent(stale)); assertTrue(gate.isCurrent(current))
    }
}
