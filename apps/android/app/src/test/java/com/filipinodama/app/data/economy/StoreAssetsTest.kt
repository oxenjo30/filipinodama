package com.filipinodama.app.data.economy

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Unit tests for the pure store-catalog helpers in StoreAssets.kt — thumbnail
 * resolution, currency/price/deal derivation — mirroring
 * apps/web/src/features/store/StorePage.tsx's thumbFor()/resolve() logic
 * field-for-field so Android renders the same art + prices the web client
 * does for the same catalog row.
 */
class StoreAssetsTest {

    private fun item(
        type: String,
        assetKey: String,
        priceGold: Int? = null,
        priceDiamonds: Int? = null,
        salePrice: Int? = null,
        onSale: Boolean = false,
        previewKey: String? = null,
        id: String = "x"
    ) = StoreItemDto(
        id = id,
        type = type,
        name = "Item",
        description = null,
        priceGold = priceGold,
        priceDiamonds = priceDiamonds,
        salePrice = salePrice,
        onSale = onSale,
        featured = false,
        assetKey = assetKey,
        previewKey = previewKey,
        tag = null,
        isPremium = false,
        sortOrder = 0
    )

    @Test
    fun `board thumb resolves to board- prefixed file when assetKey has no extension`() {
        val thumb = storeThumbFor(item(type = "BOARD", assetKey = "ebony")) as StoreThumb.Image
        assertTrue(thumb.url.endsWith("/assets/board-ebony.png"))
    }

    @Test
    fun `board thumb keeps assetKey verbatim when it already ends in png`() {
        val thumb = storeThumbFor(item(type = "BOARD", assetKey = "ebony.png")) as StoreThumb.Image
        assertTrue(thumb.url.endsWith("/assets/ebony.png"))
    }

    @Test
    fun `classic skin resolves to the procedural disc not an image`() {
        val thumb = storeThumbFor(item(type = "SKIN", assetKey = "classic"))
        assertTrue(thumb is StoreThumb.Disc)
    }

    @Test
    fun `premium skin resolves to its red-king coin art path`() {
        val thumb = storeThumbFor(item(type = "SKIN", assetKey = "crimson")) as StoreThumb.Image
        assertTrue(thumb.url.endsWith("/assets/pieces/skins/crimson/red-king.png"))
    }

    @Test
    fun `avatar thumb is a portrait and prefixes avatars slash when missing`() {
        val thumb = storeThumbFor(item(type = "AVATAR", assetKey = "sovereign.png")) as StoreThumb.Portrait
        assertTrue(thumb.url.endsWith("/assets/avatars/sovereign.png"))
    }

    // EMOTE thumbnail tests removed 2026-07-18 — EMOTE store items and the
    // StoreThumb.Emoji type were removed (owner: no Emote store/inventory
    // category, no emoji glyphs on Store/Inventory). storeThumbFor() no longer
    // has an EMOTE/emoji branch.

    @Test
    fun `currency is diamonds only when priceDiamonds is set`() {
        assertEquals("DIAMONDS", storeItemCurrency(item(type = "BOARD", assetKey = "a", priceDiamonds = 500)))
        assertEquals("GOLD", storeItemCurrency(item(type = "BOARD", assetKey = "a", priceGold = 500)))
    }

    @Test
    fun `a real onSale item with a lower salePrice is a deal with a positive discount`() {
        val deal = item(type = "BOARD", assetKey = "a", priceGold = 1000, salePrice = 650, onSale = true)
        assertTrue(storeItemIsDeal(deal))
        assertEquals(650, storeItemPrice(deal))
        assertEquals(35, storeItemDiscountPct(deal))
    }

    @Test
    fun `onSale true but salePrice not lower than base is NOT a deal`() {
        val notADeal = item(type = "BOARD", assetKey = "a", priceGold = 1000, salePrice = 1000, onSale = true)
        assertFalse(storeItemIsDeal(notADeal))
        assertEquals(1000, storeItemPrice(notADeal))
    }

    @Test
    fun `onSale false ignores any salePrice value`() {
        val ignored = item(type = "BOARD", assetKey = "a", priceGold = 1000, salePrice = 100, onSale = false)
        assertFalse(storeItemIsDeal(ignored))
        assertEquals(1000, storeItemPrice(ignored))
    }
}
