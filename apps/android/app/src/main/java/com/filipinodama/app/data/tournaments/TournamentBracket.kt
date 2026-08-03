package com.filipinodama.app.data.tournaments

/**
 * Bracket DISPLAY helpers — a Kotlin port of packages/shared/src/bracket.ts,
 * function-for-function, so the Android bracket and the web bracket draw the
 * SAME shape from the same rows. Pure (no Compose, no I/O), so all of it is
 * plain-JVM testable — see TournamentBracketTest.
 *
 * The bracket MATH (seeding, drops, advancement) is the server's; only these
 * three round-offset constants are shared, and the TS file is their single
 * source of truth. A drifted copy would put losers-bracket matches under the
 * wrong heading without failing anything, so the values are pinned by test.
 *
 * ROUND-OFFSET SCHEME: a match's sub-bracket is encoded in its round number so
 * that (tournamentId, round, slot) stays unique across all sub-brackets.
 * Winners rounds are 1..log2(B); losers rounds are 100 + localRound; the grand
 * final is 201 (game 1) and 202 (the bracket-reset game 2); group-stage rounds
 * are 300 + localRound.
 */
object TournamentBracket {

    const val L_ROUND_OFFSET = 100
    const val GF_ROUND = 201
    const val GF_RESET_ROUND = 202

    /**
     * Group-stage band, for GROUP_DOUBLE_ELIM. Sits ABOVE the grand-final band so
     * the existing W/L/GF numbering is untouched.
     */
    const val G_ROUND_OFFSET = 300

    /** Which sub-bracket a stored round number belongs to. */
    enum class BracketKey { W, L, GF, G }

    fun bracketOfRound(round: Int): BracketKey = when {
        // ORDER MATTERS: the group band is numerically ABOVE the grand-final
        // band, so it has to be tested FIRST. Swapped, every group match reads
        // as a grand final — silently, since both are valid keys.
        round >= G_ROUND_OFFSET -> BracketKey.G
        round >= 200 -> BracketKey.GF
        round >= L_ROUND_OFFSET -> BracketKey.L
        else -> BracketKey.W
    }

    /** Section headings for the sub-brackets an event can present. */
    val BRACKET_SECTION_LABEL: Map<BracketKey, String> = mapOf(
        BracketKey.G to "Group Stage",
        BracketKey.W to "Upper Bracket",
        BracketKey.L to "Lower Bracket",
        BracketKey.GF to "Grand Final"
    )

    /**
     * The human name of one round column.
     *
     * [roundsInSection] is every round number present in this sub-bracket — the
     * label is derived from the round's DISTANCE FROM THE END, so it stays
     * correct for any bracket size (a 4-player Cup's round 2 is the Final; a
     * 16-player Cup's round 2 is the Quarterfinals) with no per-Cup config.
     *
     * [doubleElim] switches the winners-bracket wording to the "Upper Bracket …"
     * form used when a losers bracket is also on screen.
     */
    fun roundLabel(round: Int, roundsInSection: List<Int>, doubleElim: Boolean): String {
        val bracket = bracketOfRound(round)

        if (bracket == BracketKey.GF) {
            return if (round == GF_RESET_ROUND) "Grand Final (reset)" else "Grand Final"
        }

        val ordered = roundsInSection.sorted()
        val idx = ordered.indexOf(round)
        // fromEnd 0 = the last round of this section, 1 = the one before it, …
        val fromEnd = if (idx == -1) ordered.size - 1 else ordered.size - 1 - idx

        if (bracket == BracketKey.G) {
            // Group rounds are plain sequence numbers — a round robin has no
            // "final" round, every round is the same kind of thing.
            return "Group Stage — Round ${round - G_ROUND_OFFSET}"
        }

        if (bracket == BracketKey.L) {
            return when (fromEnd) {
                0 -> "Lower Bracket Final"
                1 -> "Lower Bracket Semifinal"
                2 -> "Lower Bracket Quarterfinal"
                else -> "Lower Bracket Round ${round - L_ROUND_OFFSET}"
            }
        }

        // Number by POSITION in the section, not by the raw round number. They
        // agree for an ordinary bracket (rounds 1..k), but GROUP_DOUBLE_ELIM
        // never materialises winners round 1 — the group stage decides it — so
        // its winners rounds start at 2 and the raw number would name the first
        // playoff column "Round 2". Only reachable at S >= 32.
        val displayRound = if (idx == -1) round else idx + 1
        return when (fromEnd) {
            0 -> if (doubleElim) "Upper Bracket Final" else "Final"
            1 -> if (doubleElim) "Upper Bracket Semifinals" else "Semifinals"
            2 -> if (doubleElim) "UB Quarterfinals" else "Quarterfinals"
            else -> if (doubleElim) "Upper Bracket Round $displayRound" else "Round $displayRound"
        }
    }

    /** Geometry inputs for [layoutBracket], in dp-as-Float (the math is unitless). */
    data class Metrics(
        /** Height of one match card (both competitor rows plus its border). */
        val cardH: Float,
        /** Vertical gap between two adjacent round-1 cards. */
        val gap: Float
    )

    /**
     * Vertical positions for every match in a bracket section.
     *
     * [roundSizes] is the number of matches per round column, in display order.
     * Returns `y[roundIndex][matchIndex]` — the TOP edge of each card.
     *
     * Positions are computed rather than left to the layout engine because the
     * losers bracket's column sizes do NOT simply halve: a "drop" round (where
     * the winners bracket's fresh losers enter) has the SAME number of matches
     * as the round before it, while a "consolidation" round halves it. So the
     * feeder relationship is derived from the ratio of adjacent column sizes:
     *
     *   prev == 2 * current  → this match is fed by matches 2i and 2i+1
     *   prev == current      → this match is fed by match i (1:1 drop)
     *
     * and a match is centred on its feeders. That one rule covers every column
     * shape the server can produce, so one function lays out all three sections.
     *
     * A column whose size matches neither case (never produced by our brackets,
     * but possible if data were ever malformed) falls back to even spacing so
     * the view degrades instead of throwing.
     */
    fun layoutBracket(roundSizes: List<Int>, metrics: Metrics): List<List<Float>> {
        val out = mutableListOf<List<Float>>()
        if (roundSizes.isEmpty()) return out
        val cardH = metrics.cardH
        val gap = metrics.gap

        // Round 1: evenly stacked.
        out.add(List(roundSizes[0].coerceAtLeast(0)) { i -> i * (cardH + gap) })

        fun centre(top: Float) = top + cardH / 2f

        for (r in 1 until roundSizes.size) {
            val size = roundSizes[r]
            val prevSize = roundSizes[r - 1]
            val prev = out[r - 1]
            val col = ArrayList<Float>(size.coerceAtLeast(0))

            for (i in 0 until size) {
                val centreY: Float = when {
                    prevSize == size * 2 -> {
                        val a = prev.getOrNull(i * 2)
                        val b = prev.getOrNull(i * 2 + 1)
                        if (a != null && b != null) (centre(a) + centre(b)) / 2f
                        else centre(a ?: b ?: 0f)
                    }
                    prevSize == size -> centre(prev.getOrNull(i) ?: 0f)
                    else -> {
                        // Malformed column ratio — space evenly instead of throwing.
                        val totalH = maxOf(1, prev.size) * (cardH + gap)
                        (totalH / size) * (i + 0.5f)
                    }
                }
                col.add(centreY - cardH / 2f)
            }
            out.add(col)
        }

        return out
    }

    /** Total height a laid-out section needs (lowest card bottom of any column). */
    fun bracketHeight(layout: List<List<Float>>, metrics: Metrics): Float {
        var max = 0f
        for (col in layout) for (y in col) max = maxOf(max, y + metrics.cardH)
        return max
    }

    /**
     * Which matches of the previous column feed match [index] of this one —
     * the same adjacent-column-size rule [layoutBracket] positions by, exposed
     * so the connector lines are drawn from exactly the cards a match is
     * centred on (an independently-derived rule would be a silent drift risk).
     */
    fun feedersFor(index: Int, size: Int, prevSize: Int): List<Int> = when {
        prevSize == size * 2 -> listOf(index * 2, index * 2 + 1)
        prevSize == size -> listOf(index)
        else -> emptyList()
    }

    // ── Per-slot display facts (pure, so the "BYE vs TBD" rule is pinned) ──

    /** A slot with a reported winner. Until then both rows read neutral. */
    fun isDecided(m: TournamentMatchDto): Boolean = m.status == "done" && m.winnerEntryId != null

    /**
     * True when an EMPTY side of this slot means "nobody was ever seated here",
     * i.e. a bye — as opposed to "the match that feeds this side hasn't
     * finished yet", which is a TBD.
     *
     * The distinction is only visible in the slot's status: the server seeds a
     * real bye already `done` with its winner set, so a still-`pending`/`ready`
     * slot with one empty side is always waiting on a feeder, never a bye.
     * (Calling that a bye was a real defect on the web bracket — it told
     * half the first round they had a free pass through.)
     */
    fun isBye(m: TournamentMatchDto): Boolean =
        isDecided(m) && (m.redEntryId == null || m.blueEntryId == null)

    /** A slot being played right now (ready-check auto-start). */
    fun isLive(m: TournamentMatchDto): Boolean = m.matchId != null && m.status != "done"

    /**
     * One drawable sub-bracket: its rounds in display order and the matches of
     * each, slot-ordered. [title] is null for a single-section bracket — there
     * is nothing to tell it apart from.
     */
    data class Section(
        val key: BracketKey,
        val title: String?,
        val rounds: List<Int>,
        val matchesByRound: Map<Int, List<TournamentMatchDto>>
    )

    /**
     * Group a flat match list into the sections the view draws, in G → W → L →
     * GF order, dropping empty ones. Matches carry their own `bracket` field; an
     * unrecognised value falls back to "W" rather than vanishing from the view.
     *
     * The group stage leads because it is played first. [doubleElim] is no longer
     * what decides whether sections are titled — the SECTION COUNT is. Keying off
     * the format string meant a format the client didn't recognise silently
     * un-titled every section, leaving several unlabelled bracket blobs stacked
     * on screen; "more than one section" is the condition that actually matters.
     */
    fun sections(matches: List<TournamentMatchDto>, doubleElim: Boolean): List<Section> {
        val byBracket = LinkedHashMap<BracketKey, MutableList<TournamentMatchDto>>()
        for (m in matches) {
            val key = when (m.bracket) {
                "L" -> BracketKey.L
                "GF" -> BracketKey.GF
                "G" -> BracketKey.G
                else -> BracketKey.W
            }
            byBracket.getOrPut(key) { mutableListOf() }.add(m)
        }

        val present = listOf(BracketKey.G, BracketKey.W, BracketKey.L, BracketKey.GF)
            .filter { !byBracket[it].isNullOrEmpty() }
        val titled = present.size > 1 || doubleElim

        return present.map { key ->
            val list = byBracket.getValue(key)
            val matchesByRound = list.groupBy { it.round }
                .mapValues { (_, arr) -> arr.sortedBy { it.slot } }
            val rounds = matchesByRound.keys.sorted()
            Section(
                key = key,
                // Only label sections when there is more than one to tell apart.
                title = if (titled) BRACKET_SECTION_LABEL[key] else null,
                rounds = rounds,
                matchesByRound = matchesByRound
            )
        }
    }
}
