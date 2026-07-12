package com.filipinodama.app.data.economy

import com.filipinodama.app.ui.screens.economy.BuyFlow
import com.filipinodama.app.ui.screens.economy.BuyFlowState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure state-transition tests for [BuyFlow] — the idle -> confirm -> pending
 * -> success/error machine driving StoreScreen's purchase overlays.
 */
class BuyFlowTest {

    private val item = StoreItemDto(
        id = "board-ebony",
        type = "BOARD",
        name = "Imperial Ebony Board",
        description = null,
        priceGold = 1200,
        priceDiamonds = null,
        salePrice = null,
        onSale = false,
        featured = true,
        assetKey = "ebony.png",
        previewKey = null,
        tag = "NEW",
        isPremium = false,
        sortOrder = 0
    )

    @Test
    fun `tapping buy from idle opens the confirm sheet`() {
        val state = BuyFlow.startConfirm(item)
        assertTrue(state is BuyFlowState.Confirming)
        assertEquals(item.id, (state as BuyFlowState.Confirming).item.id)
    }

    @Test
    fun `cancelling the confirm sheet returns to idle`() {
        val confirming = BuyFlow.startConfirm(item)
        val cancelled = BuyFlow.cancel()
        assertEquals(BuyFlowState.Idle, cancelled)
        // startConfirm's result is discarded once cancel() is called — sanity that
        // cancel() is a pure reset regardless of the prior state.
        assertTrue(confirming is BuyFlowState.Confirming)
    }

    @Test
    fun `confirming moves from Confirming to Purchasing carrying the same item`() {
        val confirming = BuyFlow.startConfirm(item)
        val purchasing = BuyFlow.confirm(confirming)
        assertTrue(purchasing is BuyFlowState.Purchasing)
        assertEquals(item.id, (purchasing as BuyFlowState.Purchasing).item.id)
    }

    @Test
    fun `confirm is a no-op from any non-Confirming state`() {
        assertEquals(BuyFlowState.Idle, BuyFlow.confirm(BuyFlowState.Idle))
        val success = BuyFlowState.Success(item)
        assertEquals(success, BuyFlow.confirm(success))
    }

    @Test
    fun `server success moves Purchasing to Success`() {
        val purchasing = BuyFlow.confirm(BuyFlow.startConfirm(item))
        val succeeded = BuyFlow.succeed(purchasing)
        assertTrue(succeeded is BuyFlowState.Success)
        assertEquals(item.id, (succeeded as BuyFlowState.Success).item.id)
    }

    @Test
    fun `server failure moves Purchasing to Error carrying the real server message`() {
        val purchasing = BuyFlow.confirm(BuyFlow.startConfirm(item))
        val failed = BuyFlow.fail(purchasing, "Not enough gold")
        assertTrue(failed is BuyFlowState.Error)
        assertEquals("Not enough gold", (failed as BuyFlowState.Error).message)
        assertEquals(item.id, failed.item.id)
    }

    @Test
    fun `succeed and fail are no-ops from non-Purchasing states`() {
        assertEquals(BuyFlowState.Idle, BuyFlow.succeed(BuyFlowState.Idle))
        val confirming = BuyFlow.startConfirm(item)
        assertEquals(confirming, BuyFlow.succeed(confirming))
        assertEquals(confirming, BuyFlow.fail(confirming, "ignored"))
    }

    @Test
    fun `dismiss always returns to idle from a terminal state`() {
        assertEquals(BuyFlowState.Idle, BuyFlow.dismiss())
    }

    @Test
    fun `full happy path idle to confirm to purchasing to success`() {
        var state: BuyFlowState = BuyFlowState.Idle
        state = BuyFlow.startConfirm(item)
        assertTrue(state is BuyFlowState.Confirming)
        state = BuyFlow.confirm(state)
        assertTrue(state is BuyFlowState.Purchasing)
        state = BuyFlow.succeed(state)
        assertTrue(state is BuyFlowState.Success)
        state = BuyFlow.dismiss()
        assertEquals(BuyFlowState.Idle, state)
    }

    @Test
    fun `full unhappy path idle to confirm to purchasing to error to idle`() {
        var state: BuyFlowState = BuyFlowState.Idle
        state = BuyFlow.startConfirm(item)
        state = BuyFlow.confirm(state)
        state = BuyFlow.fail(state, "You already own this item")
        assertTrue(state is BuyFlowState.Error)
        assertEquals("You already own this item", (state as BuyFlowState.Error).message)
        state = BuyFlow.dismiss()
        assertEquals(BuyFlowState.Idle, state)
    }
}
