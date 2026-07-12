package com.filipinodama.app.data.economy

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Ownership + equip derivation tests, mirroring apps/web StorePage.tsx /
 * InventoryPage.tsx exactly:
 *   - owned = Set(export.inventory[].itemId) — the ONLY correct source; an
 *     order-history/name derivation misses granted starter items (inventory
 *     rows created with no Order rows) and is asserted against here.
 *   - equip PATCH slots carry ITEM IDS (server checks InventoryItem.itemId;
 *     sending an assetKey 403s NOT_OWNED).
 *   - equipped state derives from the account's equippedBoard/equippedSkin/
 *     frameId/avatarUrl fields (avatar comparing the assetKey, since the
 *     server persists an avatar equip as its assetKey to User.avatarUrl).
 */
class OwnershipTest {

    private fun item(id: String, type: String, name: String, assetKey: String = "$id.png") = StoreItemDto(
        id = id,
        type = type,
        name = name,
        description = null,
        priceGold = 500,
        priceDiamonds = null,
        salePrice = null,
        onSale = false,
        featured = false,
        assetKey = assetKey,
        previewKey = null,
        tag = null,
        isPremium = false,
        sortOrder = 0
    )

    private fun invRow(itemId: String) = InventoryItemDto(
        id = "inv-$itemId",
        userId = "u1",
        itemId = itemId,
        equipped = false,
        acquiredAt = "2026-07-01T00:00:00.000Z"
    )

    // ── owned derivation ──

    @Test
    fun `a granted starter item with an inventory row but NO order rows is owned`() {
        val catalog = listOf(
            item("classic", "SKIN", "Classic", assetKey = "classic"), // granted at signup, never ordered
            item("board-ebony", "BOARD", "Imperial Ebony Board")
        )
        // Export inventory has BOTH rows; order history only ever named the board.
        val inventory = listOf(invRow("classic"), invRow("board-ebony"))
        val orderedNames = setOf("Imperial Ebony Board")

        val owned = inventory.map { it.itemId }.toSet()

        // itemId-keyed ownership sees the starter…
        assertTrue("classic" in owned)
        assertTrue(catalog.filter { it.id in owned }.map { it.id }.containsAll(listOf("classic", "board-ebony")))
        // …which the old order-NAME derivation provably missed (the bug under test).
        val ownedByNameBug = catalog.filter { it.name in orderedNames }.map { it.id }.toSet()
        assertFalse("classic" in ownedByNameBug)
    }

    @Test
    fun `an item absent from the export inventory is not owned even if it exists in the catalog`() {
        val inventory = listOf(invRow("classic"))
        val owned = inventory.map { it.itemId }.toSet()
        assertFalse("board-ebony" in owned)
    }

    // ── equip request mapping ──

    @Test
    fun `equip request carries the ITEM ID for each slot, never the assetKey`() {
        assertEquals("board-ebony", equipRequestFor(item("board-ebony", "BOARD", "Board", assetKey = "ebony.png"))?.board)
        assertEquals("skin-crimson", equipRequestFor(item("skin-crimson", "SKIN", "Skin", assetKey = "crimson"))?.skin)
        assertEquals("frame-laurel", equipRequestFor(item("frame-laurel", "FRAME", "Frame", assetKey = "laurel.png"))?.frame)
        assertEquals("avatar-sovereign", equipRequestFor(item("avatar-sovereign", "AVATAR", "Avatar", assetKey = "avatars/sovereign.png"))?.avatar)
    }

    @Test
    fun `only the matching slot is set on the equip request`() {
        val req = equipRequestFor(item("board-ebony", "BOARD", "Board"))!!
        assertNull(req.skin)
        assertNull(req.frame)
        assertNull(req.avatar)
    }

    @Test
    fun `emotes bundles and season pass are not equippable via this route`() {
        assertNull(equipRequestFor(item("victory", "EMOTE", "Victory")))
        assertNull(equipRequestFor(item("heritage", "BUNDLE", "Heritage Pack")))
        assertNull(equipRequestFor(item("seasonpass", "SEASON_PASS", "Season Pass")))
    }

    // ── equipped-state derivation (mirrors web InventoryPage isEquipped) ──

    @Test
    fun `board and skin equipped compare the account's equipped item ids`() {
        val board = item("board-ebony", "BOARD", "Board")
        val skin = item("skin-crimson", "SKIN", "Skin")
        assertTrue(isItemEquipped(board, "board-ebony", null, null, null))
        assertFalse(isItemEquipped(board, "board-marble", null, null, null))
        assertTrue(isItemEquipped(skin, null, "skin-crimson", null, null))
        assertFalse(isItemEquipped(skin, "skin-crimson", null, null, null)) // wrong slot
    }

    @Test
    fun `frame equipped compares the account frameId`() {
        val frame = item("frame-laurel", "FRAME", "Frame")
        assertTrue(isItemEquipped(frame, null, null, "frame-laurel", null))
        assertFalse(isItemEquipped(frame, null, null, null, null))
    }

    @Test
    fun `avatar equipped compares the assetKey persisted to avatarUrl`() {
        val avatar = item("avatar-sovereign", "AVATAR", "Avatar", assetKey = "avatars/sovereign.png")
        // Server persists the AVATAR item's assetKey to User.avatarUrl.
        assertTrue(isItemEquipped(avatar, null, null, null, "avatars/sovereign.png"))
        // Tolerates the /assets/-prefixed path form updateProfileSchema also accepts.
        assertTrue(isItemEquipped(avatar, null, null, null, "/assets/avatars/sovereign.png"))
        assertFalse(isItemEquipped(avatar, null, null, null, "avatars/champion.png"))
        assertFalse(isItemEquipped(avatar, null, null, null, null))
    }

    @Test
    fun `non-equippable types are never reported equipped`() {
        val emote = item("victory", "EMOTE", "Victory")
        assertFalse(isItemEquipped(emote, "victory", "victory", "victory", "victory"))
    }
}
