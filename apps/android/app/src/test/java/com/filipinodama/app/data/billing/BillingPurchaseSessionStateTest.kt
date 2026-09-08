package com.filipinodama.app.data.billing

import com.filipinodama.app.data.AuthSessionKey
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Purchase feedback belongs to the account that started the verification. A
 * late callback after logout or account switch must not be shown to the next
 * player using this device.
 */
class BillingPurchaseSessionStateTest {

    private val playerASession = AuthSessionKey(userId = "player-a", generation = 41)
    private val playerBSession = AuthSessionKey(userId = "player-b", generation = 42)

    @Test
    fun `purchase state is idle when its session is no longer current`() {
        val outcomes = listOf(
            PurchaseUiState.Verifying,
            PurchaseUiState.Success(diamonds = 250, consumed = true),
            PurchaseUiState.Error("Purchase could not be verified"),
        )

        outcomes.forEach { staleOutcome ->
            assertEquals(
                PurchaseUiState.Idle,
                purchaseUiStateForSession(
                    requestSession = playerASession,
                    currentSession = playerBSession,
                    desiredState = staleOutcome,
                ),
            )
        }
    }

    @Test
    fun `purchase state remains visible to the session that started it`() {
        val outcomes = listOf(
            PurchaseUiState.Verifying,
            PurchaseUiState.Success(diamonds = 250, consumed = false),
            PurchaseUiState.Error("Purchase could not be verified"),
        )

        outcomes.forEach { currentOutcome ->
            assertEquals(
                currentOutcome,
                purchaseUiStateForSession(
                    requestSession = playerASession,
                    currentSession = playerASession,
                    desiredState = currentOutcome,
                ),
            )
        }
    }

    @Test
    fun `callback from a purchase launched by player A is rejected after switching to player B`() {
        assertNull(
            purchaseSessionForCallback(
                initiatingSession = playerASession,
                currentSession = playerBSession,
                purchaseAccountId = playAccountToken("player-a"),
            )
        )
    }

    @Test
    fun `callback from the initiating session is accepted when Google account binding matches`() {
        assertEquals(
            playerASession,
            purchaseSessionForCallback(
                initiatingSession = playerASession,
                currentSession = playerASession,
                purchaseAccountId = playAccountToken("player-a"),
            )
        )
    }

    @Test
    fun `recovered purchase is accepted only for the current matching account`() {
        assertEquals(
            playerASession,
            purchaseSessionForCallback(
                initiatingSession = null,
                currentSession = playerASession,
                purchaseAccountId = playAccountToken("player-a"),
            )
        )
        assertNull(
            purchaseSessionForCallback(
                initiatingSession = null,
                currentSession = playerASession,
                purchaseAccountId = playAccountToken("player-b"),
            )
        )
        assertNull(
            purchaseSessionForCallback(
                initiatingSession = null,
                currentSession = playerASession,
                purchaseAccountId = null,
            )
        )
    }

    @Test
    fun `launch errors remain tagged to initiator and disappear after account switch`() {
        val launchError = PurchaseUiState.Error("Couldn't open the purchase flow")

        assertEquals(
            launchError,
            purchaseUiStateForSession(playerASession, playerASession, launchError),
        )
        assertEquals(
            PurchaseUiState.Idle,
            purchaseUiStateForSession(playerASession, playerBSession, launchError),
        )
    }
}
