package com.filipinodama.app.data.engine

/**
 * Kotlin mirror of packages/shared/src/ranks.ts RANK_TIERS + rankTierFor() —
 * verbatim field-for-field port (names, floors, colors, art keys) so Android
 * derives the exact same tier for a given trophy count that the server's
 * rankTierFor() (used in users.ts/leaderboard.ts publicProfile()/toRow()) and
 * apps/web ProfilePage/LeaderboardPage compute client-side.
 *
 * `img` keys resolve to remote art at {WEB_ORIGIN}/assets/<img>.png, matching
 * apps/web/src/lib/assets.ts tierArt().
 */
data class RankTier(
    val key: String,
    val label: String,
    val sub: String,
    val min: Int,
    val accent: String,
    val img: String
)

object RankTiers {
    val TIERS: List<RankTier> = listOf(
        RankTier("squire", "Squire", "Recruit", 0, "#9aa6bf", "tier-squire"),
        RankTier("mandirigma", "Mandirigma", "Warrior", 300, "#cd7f4a", "tier-mandirigma"),
        RankTier("kabalyero", "Kabalyero", "Knight", 600, "#c3c7d6", "tier-kabalyero"),
        RankTier("bayani", "Bayani", "Champion", 900, "#e8b84b", "tier-bayani"),
        RankTier("datu", "Datu", "Warlord", 1100, "#3fbf6f", "tier-datu"),
        RankTier("star-guardian", "Star Guardian", "Ascendant", 1200, "#a06bff", "tier-star-guardian"),
        RankTier("alamat", "Alamat", "Legend", 1800, "#ff5d73", "tier-alamat")
    )

    /** Mirrors ranks.ts rankTierFor(): the highest tier whose `min` is <= trophies. */
    fun forTrophies(trophies: Int): RankTier {
        var tier = TIERS.first()
        for (t in TIERS) if (trophies >= t.min) tier = t
        return tier
    }

    fun indexOf(key: String): Int = TIERS.indexOfFirst { it.key == key }

    /** Next tier above [current], or null if already at the top tier. */
    fun next(current: RankTier): RankTier? {
        val idx = indexOf(current.key)
        return if (idx in TIERS.indices && idx + 1 < TIERS.size) TIERS[idx + 1] else null
    }
}
