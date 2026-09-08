package com.filipinodama.app.data.social

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GuildChatOpenGateTest {

    @Test
    fun `closing the panel invalidates an in-flight guild chat open`() {
        val gate = GuildChatOpenGate()
        val request = gate.begin("guild-a")

        gate.invalidate()

        assertFalse(gate.isCurrent(request, activeGuildId = "guild-a"))
    }

    @Test
    fun `a newer guild open supersedes the older request before socket join`() {
        val gate = GuildChatOpenGate()
        val stale = gate.begin("guild-a")
        val current = gate.begin("guild-b")

        assertFalse(gate.isCurrent(stale, activeGuildId = "guild-a"))
        assertTrue(gate.isCurrent(current, activeGuildId = "guild-b"))
    }
}
