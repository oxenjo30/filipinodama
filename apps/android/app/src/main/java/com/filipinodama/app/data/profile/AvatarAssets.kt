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

/**
 * Hosts an absolute avatar/frame URL is allowed to point at (security review
 * M-1). `avatarUrl`/`frameId` are SERVER-STORED, OTHER-USER-controlled fields;
 * without this guard a malicious value like `https://attacker/x.png` would make
 * every viewer's device fetch that host when rendering the profile/match. We
 * restrict absolute-URL passthrough to our own origins (derived from BuildConfig
 * so it's correct for debug and release); any other host falls back to the
 * champion avatar — the same "ambiguous → champion" rule this file already uses.
 */
private val ALLOWED_ASSET_HOSTS: Set<String> = buildSet {
    fun hostOf(origin: String): String? =
        runCatching { java.net.URI(origin).host }.getOrNull()?.lowercase()
    hostOf(BuildConfig.WEB_ORIGIN)?.let { add(it) }
    hostOf(BuildConfig.BASE_URL)?.let { add(it) }
}

/**
 * OAuth provider avatar hosts. On Google/Facebook signup the server stores the
 * provider's profile-picture URL as `avatarUrl` (oauth.ts: `avatar: info.picture`),
 * so these MUST pass the allowlist or those users' avatars would fall back to the
 * champion. Matched as a suffix (`endsWith`) because Google shards its photo CDN
 * across `lh3/lh4/lh5/lh6.googleusercontent.com` and regional Facebook CDN hosts.
 */
private val ALLOWED_ASSET_HOST_SUFFIXES: List<String> = listOf(
    ".googleusercontent.com",  // Google account photos (lh3-lh6.googleusercontent.com)
    ".fbcdn.net",              // Facebook graph/CDN profile photos
    "graph.facebook.com"
)

/** True if an absolute http(s) URL points at one of our own or a trusted
 *  OAuth-provider avatar host. */
private fun isAllowedAssetUrl(url: String): Boolean {
    val host = runCatching { java.net.URI(url).host }.getOrNull()?.lowercase() ?: return false
    if (host in ALLOWED_ASSET_HOSTS) return true
    return ALLOWED_ASSET_HOST_SUFFIXES.any { host == it.trimStart('.') || host.endsWith(it) }
}

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
    if (key.startsWith("/")) {
        // A leading "/assets/..." path is already web-root-relative; prefix the
        // origin so it resolves on Android (which has no same-origin web root).
        return "${BuildConfig.WEB_ORIGIN}$key"
    }
    if (key.startsWith("http")) {
        // Absolute URL — only pass through if it's one of OUR hosts (M-1); a
        // server-stored URL pointing anywhere else is treated as ambiguous.
        return if (isAllowedAssetUrl(key)) key else CHAMPION_FALLBACK
    }
    if (key.startsWith("assets/")) return "${BuildConfig.WEB_ORIGIN}/$key"
    if (key.startsWith("avatars/")) return assetUrl(key)
    if (Regex("\\.\\w+$").containsMatchIn(key) || key.contains("/")) return CHAMPION_FALLBACK
    return assetUrl("avatars/$key.png")
}

/** Cosmetic profile frames — mirrors assets.ts FRAMES keys exactly (art keys). */
private val NAMED_FRAMES: Map<String, String> = mapOf(
    "laurel" to "laurel.png",
    "silver" to "silver.png",
    "obsidian" to "obsidian.png",
    "filigree" to "filigree.webp",
    "sunburst" to "sunburst.png",
    "jade-dragon" to "jade-dragon.png",
    "kalasag" to "kalasag.png",
    "sampaguita" to "sampaguita.png",
    "capiz" to "capiz.png",
    // Batch 2 premium frames (Meshy-generated; transparent-center rings).
    "bakunawa-ring" to "bakunawa-ring.png",
    "sarimanok" to "sarimanok.png",
    "sampaguita-vine" to "sampaguita-vine.png",
    "sunstars-frame" to "sunstars-frame.png",
    "tribal-weave" to "tribal-weave.png",
    "volcanic-frame" to "volcanic-frame.png"
)

/**
 * FRAME STORE-ITEM ID → art key (from seed.ts). The equipped `frameId` stored on
 * the user is the STORE ITEM ID (e.g. "sunburstf") — the inventory/store use
 * `frameId == item.id` for the equipped checkmark, so it can't be the assetKey.
 * But most item ids DON'T equal their art key ("sunburstf" ≠ "sunburst",
 * "jadedragonf" ≠ "jade-dragon"), so resolving `frames/<id>` 404s. This table
 * maps the id to its real art key so a purchased frame actually renders.
 * (Ids whose id already equals the art key — laurel, silver — resolve via
 * NAMED_FRAMES and don't need an entry, but are included for clarity.)
 */
private val FRAME_ID_TO_KEY: Map<String, String> = mapOf(
    "laurel" to "laurel",
    "silver" to "silver",
    "obsidianf" to "obsidian",
    "sunburstf" to "sunburst",
    "jadedragonf" to "jade-dragon",
    "kalasagf" to "kalasag",
    "sampaguitaf" to "sampaguita",
    "capizf" to "capiz",
    // Batch 2 frames (item id → art key).
    "bakunawaf" to "bakunawa-ring",
    "sarimanokf" to "sarimanok",
    "sampaguitavf" to "sampaguita-vine",
    "sunstarsf" to "sunstars-frame",
    "tribalweavef" to "tribal-weave",
    "volcanicf" to "volcanic-frame"
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
    // Store item id → art key first (e.g. "sunburstf" → "sunburst"), so a
    // PURCHASED frame (frameId == item id) actually resolves to its real art.
    FRAME_ID_TO_KEY[frameId]?.let { artKey ->
        NAMED_FRAMES[artKey]?.let { return assetUrl("frames/$it") }
        return assetUrl("frames/$artKey.png")
    }
    val known = NAMED_FRAMES[frameId]
    if (known != null) return assetUrl("frames/$known")
    if (frameId.startsWith("/")) return "${BuildConfig.WEB_ORIGIN}$frameId"
    if (frameId.startsWith("http")) {
        // Absolute URL — pass through only for our own hosts (M-1); otherwise no
        // frame renders rather than fetching an attacker-controlled host.
        return if (isAllowedAssetUrl(frameId)) frameId else null
    }
    if (frameId.startsWith("assets/")) return "${BuildConfig.WEB_ORIGIN}/$frameId"
    val rel = frameId.removePrefix("frames/")
    return assetUrl("frames/$rel")
}

fun tierArtUrl(img: String): String = assetUrl("$img.png")
