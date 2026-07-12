package com.filipinodama.app.ui.screens.economy

import com.filipinodama.app.data.economy.StoreItemDto

/**
 * Buy-flow state machine shared by the Store screen's item cards. Mirrors the
 * prototype's Preview -> Confirm -> Purchase Complete flow
 * (mobile-screen-inventory.md §2 "MODAL: Purchase Confirm" /
 * "OVERLAY: Purchase Success") and apps/web StorePage's buy()/buying state,
 * as a single explicit state machine instead of ad-hoc booleans so the
 * transitions are unit-testable without Compose.
 *
 * States: Idle -> Confirming(item) -> Purchasing(item) -> Success(item) | Error(item, message)
 * Both terminal states return to Idle via [BuyFlowState.dismiss].
 */
sealed class BuyFlowState {
    object Idle : BuyFlowState()
    data class Confirming(val item: StoreItemDto) : BuyFlowState()
    data class Purchasing(val item: StoreItemDto) : BuyFlowState()
    data class Success(val item: StoreItemDto) : BuyFlowState()
    data class Error(val item: StoreItemDto, val message: String) : BuyFlowState()
}

/** Pure transition function — no side effects, fully unit-testable. */
object BuyFlow {

    /** User tapped Buy/Preview-Buy on an item -> open the confirm sheet. */
    fun startConfirm(item: StoreItemDto): BuyFlowState = BuyFlowState.Confirming(item)

    /** User cancelled the confirm sheet -> back to idle. */
    fun cancel(): BuyFlowState = BuyFlowState.Idle

    /** User confirmed -> move into the in-flight purchasing state. Only valid from Confirming. */
    fun confirm(state: BuyFlowState): BuyFlowState = when (state) {
        is BuyFlowState.Confirming -> BuyFlowState.Purchasing(state.item)
        else -> state
    }

    /** Server responded success. Only valid from Purchasing. */
    fun succeed(state: BuyFlowState): BuyFlowState = when (state) {
        is BuyFlowState.Purchasing -> BuyFlowState.Success(state.item)
        else -> state
    }

    /** Server responded failure (real message, never fabricated). Only valid from Purchasing. */
    fun fail(state: BuyFlowState, message: String): BuyFlowState = when (state) {
        is BuyFlowState.Purchasing -> BuyFlowState.Error(state.item, message)
        else -> state
    }

    /** Dismiss a terminal (Success/Error) overlay -> back to idle. */
    fun dismiss(): BuyFlowState = BuyFlowState.Idle
}
