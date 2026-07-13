package com.filipinodama.app.data.tournaments

/**
 * Pure display-mapping logic for tournaments — ported verbatim from the
 * mockup's own computed fields (FilipinoDama Mobile.dc.html renderVals()):
 *   tourStripLabel / tourStripReady (script ~line 5056-5057, Home hub strip)
 *   _stMapT (script ~line 4057, per-row status pill on the Tournaments list)
 *
 * The server's real TournamentStatus enum (OPEN|RUNNING|COMPLETED|CANCELLED)
 * does not match the mockup's placeholder vocabulary (live|upcoming|finished)
 * — GET /api/tournaments only ever returns OPEN or RUNNING rows (server-side
 * filter), so the mapping here treats RUNNING as the mockup's "live" bucket
 * and OPEN as "upcoming". No fabricated statuses are introduced.
 */
object TournamentDisplay {

    /** Home hub strip label, mirroring tourStripLabel's exact join/fallback logic. */
    fun stripLabel(items: List<TournamentListItemDto>): String {
        if (items.isEmpty()) return "None running · check back soon"
        val live = items.count { it.status == "RUNNING" }
        val upcoming = items.count { it.status == "OPEN" }
        val parts = buildList {
            if (live > 0) add("$live live")
            if (upcoming > 0) add("$upcoming upcoming")
        }
        val joined = parts.joinToString(" · ")
        return (joined.ifEmpty { "Tap to view" }) + " — join a cup"
    }

    /** Home hub strip "Live" badge — mirrors tourStripReady (any RUNNING tournament). */
    fun stripReady(items: List<TournamentListItemDto>): Boolean =
        items.any { it.status == "RUNNING" }

    /** ARGB Long color values (Compose Color(Long) convention: 0xAARRGGBB). */
    data class StatusPill(val label: String, val colorArgb: Long, val backgroundArgb: Long)

    /** Per-row status pill, mirroring _stMapT's live/upcoming entries (finished never appears — list route excludes it). */
    fun statusPill(status: String): StatusPill = when (status) {
        "RUNNING" -> StatusPill("● Live", 0xFF7FE0A3, 0x3D2E784A) // #7fe0a3 text, rgba(46,120,74,.24) bg
        else -> StatusPill("Upcoming", 0xFFF2D493, 0x2EE8B84B) // #f2d493 text, rgba(232,184,75,.18) bg (OPEN + fallback)
    }

    /** Format label, mirroring the row's format+cap+fee composite string. */
    fun formatLabel(item: TournamentListItemDto): String {
        val formatName = when (item.format) {
            "SINGLE_ELIM" -> "Single elimination"
            "DOUBLE_ELIM" -> "Double elimination"
            "SWISS" -> "Swiss"
            "ROUND_ROBIN" -> "Round robin"
            else -> item.format
        }
        val feePart = if (item.entryFeeGold > 0) " · ${item.entryFeeGold} 🪙 entry" else " · Free entry"
        return "$formatName · ${item.maxPlayers} players$feePart"
    }

    /** Players-registered label, mirroring tr.playersLabel. */
    fun playersLabel(item: TournamentListItemDto): String = "${item.registered}/${item.maxPlayers} joined"
}
