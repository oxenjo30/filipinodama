package com.filipinodama.app.ui.screens.settings

/**
 * Pure state machine for the Delete Account confirmation flow, following the
 * same convention as [com.filipinodama.app.ui.screens.economy.BuyFlow] (a
 * pure idle -> confirm -> pending -> success/error object driving a purchase
 * overlay) — extracted here so [DeleteAccountDialog]'s gating logic is
 * independently unit-testable without an Android Context or a real network
 * call.
 *
 * Mirrors apps/web SettingsPage.tsx's confirmDelete() gate exactly:
 * the "Delete Forever" action is only reachable once the typed confirmation
 * text equals "DELETE" (case-insensitive, trimmed — matches
 * `deleteConfirm.trim().toUpperCase() === "DELETE"` in the web source).
 */
sealed class DeleteAccountState {
    data object Idle : DeleteAccountState()
    data object Deleting : DeleteAccountState()
    data object Deleted : DeleteAccountState()
    data class Error(val message: String) : DeleteAccountState()
}

object DeleteAccountFlow {

    /** Same confirmation rule as web's SettingsPage.tsx `deleteReady`. */
    fun isReady(confirmText: String): Boolean = confirmText.trim().uppercase() == "DELETE"

    /** Only starts deleting from Idle or a prior Error (retry); a no-op while
     * already Deleting or after Deleted, so a double-tap can't fire two
     * requests. */
    fun startDelete(confirmText: String, current: DeleteAccountState): DeleteAccountState {
        if (!isReady(confirmText)) return current
        if (current is DeleteAccountState.Deleting || current is DeleteAccountState.Deleted) return current
        return DeleteAccountState.Deleting
    }

    fun succeed(current: DeleteAccountState): DeleteAccountState =
        if (current is DeleteAccountState.Deleting) DeleteAccountState.Deleted else current

    fun fail(current: DeleteAccountState, message: String): DeleteAccountState =
        if (current is DeleteAccountState.Deleting) DeleteAccountState.Error(message) else current
}
