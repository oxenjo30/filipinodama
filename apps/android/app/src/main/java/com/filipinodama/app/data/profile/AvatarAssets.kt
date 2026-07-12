package com.filipinodama.app.data.profile

import com.filipinodama.app.BuildConfig

/**
 * Avatar / frame art resolution — a Kotlin port of apps/web/src/lib/assets.ts
 * `avatar()` / `frameArt()`, ported field-for-field (including the "ambiguous
 * -> champion fallback" safety rule) rather than re-derived, so a given
 * me.avatarUrl / frameId value resolves to the exact same art file on Android
 * that it does on web. Art loads remotely via Coil from
 * BuildConfig.WEB_ORIGIN + "/assets/..." — the same remote-art approach
 * StoreAssets.kt already established for the Store/Inventory screens (see
 * that file's kdoc for the bundling-vs-remote rationale, which applies
 * identically here).
 */

private fun assetUrl(path: String): String = "${BuildConfig.WEB_ORIGIN}/assets/$path"

/** Named hero avatars — mirrors assets.ts AVATARS keys exactly. */
private val NAMED_AVATARS: Set<String> = setOf(
    "champion", "sovereign", "strategist", "babaylan", "bagani", "diwata",
    "mandirigma", "ermitanyo", "dayang", "priestess", "sultan",
    "lakan", "binukot", "datu", "magwayen", "panday"
)

private val CHAMPION_FALLBACK = assetUrl("avatars/champion.png")

/**
 * Resolve a Me/PublicUser.avatarUrl (bare key | "/assets/…" path | uploaded
 * full URL | legacy assetKey form) to a renderable remote URL. Mirrors
 * assets.ts avatar() branch-for-branch:
 *   1. blank/non-string -> champion fallback (every player must render an avatar)
 *   2. known named avatar key -> its fixed file
 *   3. absolute path ("/...") or full URL ("http...") -> passed straight through
 *   4. "assets/..." -> resolved directly under the web origin (no double /assets)
 *   5. "avatars/..." -> resolved under BASE (no double avatars/ segment)
 *   6. any other value carrying an image extension or a "/" -> AMBIGUOUS,
 *      champion fallback (never guess at a broken URL)
 *   7. bare key with no folder/extension -> "avatars/<key>.png"
 */
fun resolveAvatarUrl(avatarUrl: String?): String {
    val key = avatarUrl
    if (key.isNullOrBlank()) return CHAMPION_FALLBACK
    if (key in NAMED_AVATARS) return assetUrl("avatars/$key.png")
    if (key.startsWith("/") || key.startsWith("http")) {
        // A leading "/assets/..." path is already web-root-relative; prefix the
        // origin so it resolves on Android (which has no same-origin web root).
        return if (key.startsWith("/")) "${BuildConfig.WEB_ORIGIN}$key" else key
    }
    if (key.startsWith("assets/")) return "${BuildConfig.WEB_ORIGIN}/$key"
    if (key.startsWith("avatars/")) return assetUrl(key)
    if (Regex("\\.\\w+$").containsMatchIn(key) || key.contains("/")) return CHAMPION_FALLBACK
    return assetUrl("avatars/$key.png")
}

/** Cosmetic profile frames — mirrors assets.ts FRAMES keys exactly. */
private val NAMED_FRAMES: Map<String, String> = mapOf(
    "laurel" to "laurel.png",
    "silver" to "silver.png",
    "obsidian" to "obsidian.png",
    "filigree" to "filigree.webp",
    "sunburst" to "sunburst.png",
    "jade-dragon" to "jade-dragon.png",
    "kalasag" to "kalasag.png",
    "sampaguita" to "sampaguita.png",
    "capiz" to "capiz.png"
)

/**
 * Resolve a frameId (a FRAME ITEM ID, e.g. "jadedragonf", OR a legacy art key
 * like "laurel") to a renderable remote URL, or null when there is no frame
 * to render. Mirrors assets.ts frameArt(), with the same "frames/" prefix
 * de-duplication. NOTE: unlike avatar(), an item id that isn't a known frame
 * key still resolves (frames/<id> best-effort) — mirrors frameArt()'s
 * permissive fallback branch, since a real equipped frameId always maps to a
 * real StoreItem.assetKey server-side.
 */
fun resolveFrameUrl(frameId: String?): String? {
    if (frameId.isNullOrBlank()) return null
    val known = NAMED_FRAMES[frameId]
    if (known != null) return assetUrl("frames/$known")
    if (frameId.startsWith("/") || frameId.startsWith("http")) {
        return if (frameId.startsWith("/")) "${BuildConfig.WEB_ORIGIN}$frameId" else frameId
    }
    if (frameId.startsWith("assets/")) return "${BuildConfig.WEB_ORIGIN}/$frameId"
    val rel = frameId.removePrefix("frames/")
    return assetUrl("frames/$rel")
}

fun tierArtUrl(img: String): String = assetUrl("$img.png")
