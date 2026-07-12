package com.filipinodama.app.data.social

import com.filipinodama.app.BuildConfig

/**
 * Guild crest art resolution — a direct Kotlin port of apps/web/src/lib/
 * assets.ts CRESTS / CREST_KEYS / guildCrest(), served remotely from
 * BuildConfig.WEB_ORIGIN + "/assets/<file>" (same convention as
 * economy/StoreAssets.kt — server-driven static art, no bundled duplicate).
 */
data class GuildCrest(val key: String, val src: String, val name: String)

val GUILD_CRESTS: LinkedHashMap<String, GuildCrest> = linkedMapOf(
    "vanguard" to GuildCrest("vanguard", assetUrl("me-guild.png"), "Vanguard Star"),
    "crown" to GuildCrest("crown", assetUrl("me-crown.png"), "Sovereign Crown"),
    "swords" to GuildCrest("swords", assetUrl("me-swords.png"), "Crossed Blades"),
    "citadel" to GuildCrest("citadel", assetUrl("me-castle.png"), "Iron Citadel"),
    "marksman" to GuildCrest("marksman", assetUrl("me-target.png"), "Marksman"),
    "banner" to GuildCrest("banner", assetUrl("me-banner.png"), "Royal Banner")
)

val GUILD_CREST_KEYS: List<String> = GUILD_CRESTS.keys.toList()

private fun assetUrl(file: String): String = "${BuildConfig.WEB_ORIGIN}/assets/$file"

/**
 * Resolve a guild's crest art. If [crestKey] names a known crest, use it;
 * otherwise deterministically pick one from [seed] (the guild id) so every
 * guild gets a stable crest before one is chosen — mirrors assets.ts
 * guildCrest()'s hash exactly: `h = (h * 31 + charCode) >>> 0`, unsigned
 * 32-bit, then `h % CREST_KEYS.length`.
 */
fun resolveGuildCrest(crestKey: String?, seed: String = ""): GuildCrest {
    if (crestKey != null) {
        GUILD_CRESTS[crestKey]?.let { return it }
    }
    var h = 0L
    for (ch in seed) {
        h = (h * 31 + ch.code) and 0xFFFFFFFFL
    }
    val idx = (h % GUILD_CREST_KEYS.size).toInt()
    val key = GUILD_CREST_KEYS[idx]
    return GUILD_CRESTS.getValue(key)
}
