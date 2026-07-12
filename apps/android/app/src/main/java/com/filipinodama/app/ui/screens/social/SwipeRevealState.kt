package com.filipinodama.app.ui.screens.social

/**
 * Pure, unit-testable reducer for "which swipeable row is currently open"
 * across a list — the state-machine half of SwipeRevealRow.kt's gesture
 * handling (mobile-screen-inventory.md DATA/BEHAVIOR §3.2: "only one row can
 * be open at a time... auto-closes it when another row starts dragging").
 */
data class SwipeListState(val openRowId: String? = null) {
    fun isOpen(rowId: String): Boolean = openRowId == rowId

    /** A row's drag crossed the open threshold — becomes the sole open row. */
    fun open(rowId: String): SwipeListState = copy(openRowId = rowId)

    /** A row's drag settled back under threshold, or an action was taken — closes it. */
    fun close(rowId: String): SwipeListState = if (openRowId == rowId) copy(openRowId = null) else this

    /** Any explicit close (e.g. tapping elsewhere), regardless of which row. */
    fun closeAll(): SwipeListState = copy(openRowId = null)
}
