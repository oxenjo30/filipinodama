package com.filipinodama.app.ui.screens

import org.junit.Assert.assertEquals
import org.junit.Test

class StoreOwnershipStateTest {
    @Test fun `switching accounts clears prior ownership and rejects late results`() {
        val playerB = StoreOwnershipState("player-a", setOf("board")).forAccount("player-b")
        assertEquals(StoreOwnershipState("player-b"), playerB)
        assertEquals(playerB, playerB.withInventory("player-a", setOf("board")))
        assertEquals(playerB, playerB.withPurchasedItems("player-a", setOf("board")))
    }
}
