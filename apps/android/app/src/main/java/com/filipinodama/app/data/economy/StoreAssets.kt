package com.filipinodama.app.data.economy

import com.filipinodama.app.BuildConfig

/**
 * Store item art resolution — ASSET APPROACH: Coil loads art REMOTELY from
 * BuildConfig.WEB_ORIGIN + "/assets/<file>" (the exact same static path the
 * web client (apps/web/src/features/store/StorePage.tsx `A()`) serves its own
 * art from), rather than bundling the store catalog's PNGs into
 * res/drawable-nodpi.
 *
 * WHY REMOTE > BUNDLED for this catalog:
 *   - The catalog is server-driven and can grow (new StoreItems seeded any
 *     time) — a bundled APK would need a new release for every new skin/board/
 *     avatar/frame the admin adds, silently going stale otherwise.
 *   - The art set (boards, multiple skin folders each with red/blue x man/king
 *     coin renders, avatar portraits, frames, banners) is meaningfully large;
 *     bundling it duplicates apps/web/public/assets inside the APK for no
 *     correctness benefit and inflates APK size.
 *   - BuildConfig.WEB_ORIGIN already exists (Phase 4, for room share links)
 *     and already points at the real static asset host in both debug
 *     (10.0.2.2:5173 dev server) and release (https://filipinodama.com), so
 *     this reuses infra instead of inventing a second one.
 *   - Coil is already a project dependency (libs.coil.compose) — no new
 *     runtime dependency needed.
 * TRADEOFF accepted: art requires network the first time (Coil's in-memory +
 * disk cache handles repeat visits) and won't render fully offline on a first
 * cold launch — acceptable since the rest of the economy surface is already
 * fully server-authoritative and requires connectivity.
 *
 * Mirrors apps/web/src/features/store/StorePage.tsx `thumbFor()` field-for-
 * field so Android shows the SAME art per item type + assetKey.
 */

sealed class StoreThumb {
    data class Image(val url: String) : StoreThumb()
    data class Portrait(val url: String) : StoreThumb()
    object Disc : StoreThumb()
    data class Emoji(val glyph: String) : StoreThumb()
}

private fun assetUrl(file: String): String = "${BuildConfig.WEB_ORIGIN}/assets/$file"

private val EMOTE_EMOJI: Map<String, String> = mapOf(
    "victory" to "👑",
    "focused" to "🎯",
    "emote-resolve" to "💪"
)

private fun emoteGlyph(item: StoreItemDto): String {
    val preview = item.previewKey
    if (preview != null && preview.startsWith("emote:")) return preview.substring("emote:".length)
    return EMOTE_EMOJI[item.id] ?: "👑"
}

/** Resolve an item's thumbnail — mirrors StorePage.tsx thumbFor() exactly. */
fun storeThumbFor(item: StoreItemDto): StoreThumb {
    val a = item.assetKey
    return when (item.type) {
        "BOARD" -> StoreThumb.Image(assetUrl(if (a.endsWith(".png")) a else "board-$a.png"))
        "SKIN" -> {
            if (a == "classic") StoreThumb.Disc
            else StoreThumb.Image(assetUrl("pieces/skins/$a/red-king.png"))
        }
        "AVATAR" -> StoreThumb.Portrait(assetUrl(if (a.startsWith("avatars/")) a else "avatars/$a"))
        "FRAME" -> StoreThumb.Image(assetUrl(a))
        "EMOTE" -> StoreThumb.Emoji(emoteGlyph(item))
        "BUNDLE" -> StoreThumb.Image(assetUrl(if (a.endsWith(".png")) a else "me-banner.png"))
        "SEASON_PASS" -> StoreThumb.Image(assetUrl("me-crown.png"))
        else -> StoreThumb.Image(assetUrl("ic-chest.png"))
    }
}

/** Store badge color per tag (hex string), mirrors StorePage.tsx tagColor(). */
fun storeTagColor(tag: String): String = when {
    tag == "NEW" -> "#2F8F5B"
    tag == "PREMIUM" -> "#7A4FBF"
    tag == "VALUE" || tag == "SEASON" -> "#C99A2E"
    tag.startsWith("-") -> "#A83744"
    else -> "#7A4FBF"
}

/** Per-type display metadata, mirrors StorePage.tsx TYPE_META. */
data class StoreTypeMeta(val label: String, val sub: String)

val STORE_TYPE_META: Map<String, StoreTypeMeta> = mapOf(
    "BOARD" to StoreTypeMeta("Board Themes", "Board Theme"),
    "SKIN" to StoreTypeMeta("Piece Skins", "Piece Skin"),
    "AVATAR" to StoreTypeMeta("Avatars", "Avatar"),
    "FRAME" to StoreTypeMeta("Profile Frames", "Profile Frame"),
    "EMOTE" to StoreTypeMeta("Emotes", "Emote"),
    "BUNDLE" to StoreTypeMeta("Bundles", "Bundle"),
    "SEASON_PASS" to StoreTypeMeta("Season Pass", "Season Pass")
)

val STORE_TYPE_ORDER = listOf("BOARD", "SKIN", "AVATAR", "FRAME", "EMOTE", "BUNDLE", "SEASON_PASS")

/** Currency an item is priced in — diamonds only when priceDiamonds is set (mirrors StorePage.tsx `resolve`). */
fun storeItemCurrency(item: StoreItemDto): String = if (item.priceDiamonds != null) "DIAMONDS" else "GOLD"

/** Effective price (sale price when a valid deal is active, else the base price). */
fun storeItemPrice(item: StoreItemDto): Int {
    val base = item.priceDiamonds ?: item.priceGold ?: 0
    val deal = item.onSale && item.salePrice != null && item.salePrice > 0 && item.salePrice < base
    return if (deal) item.salePrice!! else base
}

fun storeItemBasePrice(item: StoreItemDto): Int = item.priceDiamonds ?: item.priceGold ?: 0

fun storeItemIsDeal(item: StoreItemDto): Boolean {
    val base = storeItemBasePrice(item)
    return item.onSale && item.salePrice != null && item.salePrice > 0 && item.salePrice < base
}

fun storeItemDiscountPct(item: StoreItemDto): Int {
    if (!storeItemIsDeal(item)) return 0
    val base = storeItemBasePrice(item)
    val price = storeItemPrice(item)
    if (base <= 0) return 0
    return ((1.0 - price.toDouble() / base.toDouble()) * 100).toInt()
}
