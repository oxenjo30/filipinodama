package com.filipinodama.app.data.match

import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The join-failure message used to be a single fixed string that blamed the
 * player's connection for every failure shape, including ones where the device
 * was demonstrably online. That is a real defect: it misdirects the player, and
 * it erases the only signal anyone has for telling a server fault apart from an
 * outage. These pin the three states apart.
 */
class JoinFailedMessageTest {

    private fun msg(online: Boolean, connected: Boolean) =
        MatchRepository.joinFailedMessage(online = online, socketConnected = connected)

    @Test
    fun `only a genuine outage tells the player to check their connection`() {
        val offline = msg(online = false, connected = false)
        assertTrue("offline should mention being offline", offline.contains("offline", ignoreCase = true))

        // The two online states must NOT tell a connected player to go and check
        // their connection — that is the exact misdirection being fixed.
        for (m in listOf(msg(true, false), msg(true, true))) {
            assertTrue(
                "an online player was told to check their connection: \"$m\"",
                !m.contains("Check your connection", ignoreCase = true)
            )
        }
    }

    @Test
    fun `an unacknowledged join on a live socket is reported as a server fault`() {
        val m = msg(online = true, connected = true)
        assertTrue(
            "should name the game server as the thing that failed: \"$m\"",
            m.contains("server", ignoreCase = true)
        )
        assertTrue(
            "should not blame the player's connection: \"$m\"",
            !m.contains("your connection", ignoreCase = true)
        )
    }

    @Test
    fun `still-connecting is distinguishable from an outright server failure`() {
        assertNotEquals(msg(online = true, connected = false), msg(online = true, connected = true))
    }

    @Test
    fun `every state produces a non-empty, actionable message`() {
        for (online in listOf(true, false)) {
            for (connected in listOf(true, false)) {
                val m = msg(online, connected)
                assertTrue("empty message for online=$online connected=$connected", m.isNotBlank())
                assertTrue("message should end as a sentence: \"$m\"", m.trimEnd().endsWith("."))
            }
        }
    }

    @Test
    fun `offline wins even if a stale socket still reports connected`() {
        // Sockets can report connected() for a while after the network drops.
        // The device's own connectivity is the stronger signal and must win, or
        // a genuinely offline player gets told the server is at fault.
        val m = msg(online = false, connected = true)
        assertTrue("offline should dominate a stale socket: \"$m\"", m.contains("offline", ignoreCase = true))
    }
}
