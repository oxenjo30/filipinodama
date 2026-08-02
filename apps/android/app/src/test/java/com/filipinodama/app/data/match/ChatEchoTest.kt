package com.filipinodama.app.data.match

import com.filipinodama.app.data.engine.PieceColors
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Optimistic chat echo (owner report, 2026-08-02: "when I'm sending a message it
 * takes a few secs before my send could be sent and visible in the chat box").
 *
 * ROOT CAUSE: `sendChat` emitted `match:chat` and did NOTHING locally. The
 * message only appeared once the SERVER relayed it back — so you waited a full
 * round trip to see your own text, which on a laggy connection reads as the chat
 * box being broken. Moves were given optimistic application in v51; chat was
 * not.
 *
 * The fix appends immediately with a client-generated nonce, which the server
 * echoes back so we can RECONCILE rather than render the message twice. These
 * tests pin the reconciliation, which is the part that is easy to get wrong:
 * without the nonce, sending the same text twice quickly is indistinguishable.
 */
class ChatEchoTest {

    @After
    fun tearDown() {
        MatchRepository.hardReset()
    }

    private fun inMatch(chat: List<ChatMsg> = emptyList()) = MatchUiState(
        status = MatchStatus.PLAYING,
        matchId = "m1",
        myColor = PieceColors.RED,
        chat = chat,
    )

    private fun pending(nonce: String, body: String) = ChatMsg(
        id = nonce, mine = true, color = PieceColors.RED, body = body,
        emote = null, at = 1L, nonce = nonce, pending = true,
    )

    private fun echo(nonce: String?, body: String, from: String = "me", color: String = PieceColors.RED) =
        MatchChatDto(matchId = "m1", from = from, color = color, body = body, at = 2L, nonce = nonce)

    @Test
    fun `the echo of my own message replaces the pending copy instead of duplicating it`() {
        val before = inMatch(listOf(pending("n1", "good luck")))

        val after = applyMatchChat(before, echo("n1", "good luck"))

        assertEquals("must not render twice", 1, after.chat.size)
        assertFalse("no longer in flight", after.chat[0].pending)
        assertEquals("good luck", after.chat[0].body)
    }

    @Test
    fun `the echo adopts the SERVER's body, so the sender sees what everyone else sees`() {
        // The server masks profanity now. If we kept the optimistic text, the
        // sender would be the only person seeing the unmasked version — and would
        // reasonably assume the filter had not applied to them.
        val before = inMatch(listOf(pending("n1", "you suck")))

        val after = applyMatchChat(before, echo("n1", "you ****"))

        assertEquals(1, after.chat.size)
        assertEquals("you ****", after.chat[0].body)
    }

    @Test
    fun `the pending message keeps its position rather than jumping to the bottom`() {
        val opponent = ChatMsg(
            id = "x", mine = false, color = PieceColors.BLUE, body = "hi",
            emote = null, at = 5L,
        )
        val before = inMatch(listOf(pending("n1", "mine"), opponent))

        val after = applyMatchChat(before, echo("n1", "mine"))

        assertEquals(2, after.chat.size)
        assertEquals("mine", after.chat[0].body)
        assertEquals("hi", after.chat[1].body)
    }

    @Test
    fun `an opponent message with no nonce is appended normally`() {
        val before = inMatch(listOf(pending("n1", "mine")))

        val after = applyMatchChat(before, echo(null, "hello", from = "them", color = PieceColors.BLUE))

        assertEquals(2, after.chat.size)
        assertTrue("my message is still in flight", after.chat[0].pending)
        assertEquals("hello", after.chat[1].body)
    }

    @Test
    fun `identical text sent twice reconciles each copy separately`() {
        // The exact case a body-matching heuristic would get wrong.
        val before = inMatch(listOf(pending("n1", "gg"), pending("n2", "gg")))

        val afterFirst = applyMatchChat(before, echo("n1", "gg"))
        val afterBoth = applyMatchChat(afterFirst, echo("n2", "gg"))

        assertEquals(2, afterBoth.chat.size)
        assertFalse(afterBoth.chat[0].pending)
        assertFalse(afterBoth.chat[1].pending)
    }

    @Test
    fun `a chat echo for a DIFFERENT match is ignored`() {
        val before = inMatch(listOf(pending("n1", "mine")))

        val after = applyMatchChat(before, echo("n1", "mine").copy(matchId = "other-match"))

        assertEquals(1, after.chat.size)
        assertTrue("still pending — that echo was not ours", after.chat[0].pending)
    }

    @Test
    fun `an unmatched nonce is appended rather than dropped`() {
        // e.g. a resync cleared our optimistic copy before the echo arrived.
        // Appending is the safe direction: a duplicate is visible and harmless,
        // a dropped message is not.
        val after = applyMatchChat(inMatch(), echo("unknown", "hi"))

        assertEquals(1, after.chat.size)
        assertFalse(after.chat[0].pending)
    }
}
