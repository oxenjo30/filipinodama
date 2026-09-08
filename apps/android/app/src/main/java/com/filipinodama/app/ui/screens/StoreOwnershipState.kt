package com.filipinodama.app.ui.screens

/** Account-keyed ownership prevents late inventory/purchase results crossing sessions. */
data class StoreOwnershipState(val accountId: String? = null, val itemIds: Set<String> = emptySet()) {
    fun forAccount(accountId: String?) = if (this.accountId == accountId) this else StoreOwnershipState(accountId)
    fun withInventory(accountId: String, itemIds: Set<String>) = if (this.accountId == accountId) copy(itemIds = itemIds) else this
    fun withInventoryFailure(accountId: String) = if (this.accountId == accountId) copy(itemIds = emptySet()) else this
    fun withPurchasedItems(accountId: String?, itemIds: Set<String>) = if (this.accountId == accountId) copy(itemIds = this.itemIds + itemIds) else this
}
