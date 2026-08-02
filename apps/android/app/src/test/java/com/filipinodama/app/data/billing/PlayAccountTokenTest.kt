package com.filipinodama.app.data.billing

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The account token bound to a Google Play purchase.
 *
 * WHY THIS MATTERS: without account binding a Play purchase token is a BEARER
 * credential. Whoever redeems it first gets the diamonds, and the real buyer's
 * client is then told `alreadyProcessed`, reads that as success, CONSUMES the
 * purchase — destroying the entitlement and Play's 3-day refund window — and
 * shows "+N diamonds credited" to someone who received nothing. Real money,
 * silently lost, behind a false success UI.
 *
 * The server derives the SAME token from the authenticated caller's id and
 * rejects any purchase whose echoed value doesn't match, so a token lifted from
 * another account is worthless.
 *
 * THE VECTOR BELOW IS THE CONTRACT. It is plain SHA-256 of the user id, hex,
 * and it must stay byte-for-byte identical to `playAccountToken` in
 * apps/server/src/modules/payments.ts. If this test and the server's
 * `play-account-binding.test.ts` ever disagree, every real purchase is rejected
 * as "not yours" — so both suites assert the same known vector rather than
 * merely asserting internal consistency.
 */
class PlayAccountTokenTest {

    @Test
    fun `matches the server's derivation for a known user id`() {
        // THE CROSS-LANGUAGE CONTRACT. The server's play-account-binding test
        // asserts this exact string for this exact input. Both sides pin the
        // literal rather than re-deriving it, so a change to either
        // implementation breaks a test instead of silently rejecting every
        // real purchase in production as "not yours".
        assertEquals(
            "5a2e084061eae2209d14bb47650ce453f9b053745e55d0475bb9c3d695193b38",
            playAccountToken("user_abc123"),
        )
    }

    @Test
    fun `is 64 hex characters — Google caps obfuscatedAccountId at 64`() {
        val token = playAccountToken("user_abc123")!!
        assertEquals(64, token.length)
        assertEquals(true, token.all { it in "0123456789abcdef" })
    }

    @Test
    fun `is deterministic — the same id always yields the same token`() {
        assertEquals(playAccountToken("u1"), playAccountToken("u1"))
    }

    @Test
    fun `different accounts get different tokens`() {
        assertNotEquals(playAccountToken("u1"), playAccountToken("u2"))
    }

    @Test
    fun `does not leak the raw user id`() {
        // Google's guidance: obfuscatedAccountId must not identify the user.
        val token = playAccountToken("player@example.com")!!
        assertEquals(false, token.contains("player"))
        assertEquals(false, token.contains("example"))
    }

    @Test
    fun `is null when signed out, so the purchase is blocked rather than unbound`() {
        // launchPurchase refuses rather than starting an unbindable flow — the
        // server would reject it anyway (PLAY_PURCHASE_UNBOUND), and failing here
        // avoids taking the user's money for a purchase we cannot credit.
        assertNull(playAccountToken(null))
        assertNull(playAccountToken(""))
        assertNull(playAccountToken("   "))
    }
}
