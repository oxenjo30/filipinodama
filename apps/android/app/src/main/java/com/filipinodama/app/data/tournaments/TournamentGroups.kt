package com.filipinodama.app.data.tournaments

/**
 * GROUP-STAGE STANDINGS for the GROUP_DOUBLE_ELIM format — a round robin
 * inside each group, then the survivors of every group play a double
 * elimination playoff (the "The International" shape).
 *
 * Pure (no Compose, no I/O) for the same reason [TournamentBracket] is: an
 * off-by-one in the qualification cut renders a perfectly plausible table that
 * simply tells the wrong players they are through, so the rule is pinned by
 * test rather than eyeballed on a screen — see TournamentGroupsTest.
 *
 * WHY THE TALLY IS COMPUTED HERE. The server writes
 * [TournamentEntryDto.groupPlacement] exactly once, when the group stage
 * finishes and the cut is applied. Until that moment there is no server-side
 * standing at all, so a table built only from `groupPlacement` would be blank
 * for the entire time the group stage is actually being played — which is the
 * whole time the table matters. So the order comes from the group's OWN decided
 * matches while it runs, and defers to `groupPlacement` the moment it exists
 * (the server's ordering is the authority; ours is a live projection of it).
 */
object TournamentGroups {

    /** The format string this whole file exists for. */
    const val FORMAT = "GROUP_DOUBLE_ELIM"

    /** TournamentMatch.bracket value carrying group-stage results. */
    const val GROUP_BRACKET = "G"

    /**
     * Where a row sits relative to the qualification cut.
     *
     * The split is NOT configurable: the playoff is an ordinary double
     * elimination whose winners round 1 was decided by the group stage, and a
     * winners round 1 of size B yields B/2 winners and B/2 losers — so the top
     * HALF of each group's qualifiers enters the upper bracket and the bottom
     * half drops straight into the lower one.
     */
    enum class Band { UPPER, LOWER, ELIMINATED, UNKNOWN }

    /** Section headings for the bands, in table order. */
    val BAND_LABEL: Map<Band, String> = mapOf(
        Band.UPPER to "Upper Bracket",
        Band.LOWER to "Lower Bracket",
        Band.ELIMINATED to "Eliminated",
        Band.UNKNOWN to "Standings"
    )

    /** One player's line in a group table. */
    data class Row(
        val entry: TournamentEntryDto,
        /** 1-based position within the group. */
        val rank: Int,
        val wins: Int,
        val losses: Int,
        val band: Band
    ) {
        val played: Int get() = wins + losses
    }

    /**
     * One group's table. [decided] is true once the server has written a
     * placement for every member — i.e. the cut is final rather than projected,
     * which is the difference between "is through" and "would be through".
     */
    data class Group(
        val index: Int,
        val label: String,
        val rows: List<Row>,
        val played: Int,
        val total: Int,
        val decided: Boolean
    )

    /** "Group A", "Group B", … falling back to a number past Z. */
    fun groupLabel(index: Int): String =
        if (index in 0..25) "Group ${'A' + index}" else "Group ${index + 1}"

    /**
     * Which band a 1-based [rank] falls in, given the group's qualifier count.
     * [Band.UNKNOWN] when the server did not send a usable qualifier count —
     * an unbanded table is honest, a guessed cut is not.
     */
    fun bandFor(rank: Int, qualifiersPerGroup: Int?): Band {
        val q = qualifiersPerGroup ?: return Band.UNKNOWN
        if (q < 2) return Band.UNKNOWN
        return when {
            rank <= q / 2 -> Band.UPPER
            rank <= q -> Band.LOWER
            else -> Band.ELIMINATED
        }
    }

    /**
     * One sentence explaining the cut, or null when there is nothing reliable
     * to say. This is the point of a group stage and it is invisible from the
     * table alone, so it is stated in words above it.
     */
    fun cutSummary(qualifiersPerGroup: Int?): String? {
        val q = qualifiersPerGroup ?: return null
        if (q < 2) return null
        val half = q / 2
        return "Top $half of each group start in the Upper Bracket, the next $half drop to the " +
            "Lower Bracket. Everyone below is out."
    }

    /**
     * Build every group's table from the detail payload's entries and matches.
     *
     * Returns an empty list when no entry carries a [TournamentEntryDto.groupIndex]
     * — the case for every other format, and for a GROUP_DOUBLE_ELIM Cup that
     * has not started yet (groups are drawn at Start).
     */
    fun standings(
        entries: List<TournamentEntryDto>,
        matches: List<TournamentMatchDto>,
        qualifiersPerGroup: Int?
    ): List<Group> {
        val membersByGroup = entries.filter { it.groupIndex != null }.groupBy { it.groupIndex!! }
        if (membersByGroup.isEmpty()) return emptyList()

        val groupMatches = matches.filter { it.bracket == GROUP_BRACKET }

        // W/L from the group stage's own decided slots. A slot with an empty
        // side still credits its winner but charges nobody a loss — a round
        // robin should never produce one, and inventing a loser would be worse
        // than a blank.
        val wins = HashMap<String, Int>()
        val losses = HashMap<String, Int>()
        for (m in groupMatches) {
            if (!TournamentBracket.isDecided(m)) continue
            val winner = m.winnerEntryId ?: continue
            val loser = if (m.redEntryId == winner) m.blueEntryId else m.redEntryId
            wins[winner] = (wins[winner] ?: 0) + 1
            if (loser != null) losses[loser] = (losses[loser] ?: 0) + 1
        }

        // Progress per group, so a table can say how much of it is still to play.
        val groupOfEntry = HashMap<String, Int>()
        for ((gi, members) in membersByGroup) for (e in members) groupOfEntry[e.id] = gi
        val playedByGroup = HashMap<Int, Int>()
        val totalByGroup = HashMap<Int, Int>()
        for (m in groupMatches) {
            val gi = m.redEntryId?.let { groupOfEntry[it] }
                ?: m.blueEntryId?.let { groupOfEntry[it] }
                ?: continue
            totalByGroup[gi] = (totalByGroup[gi] ?: 0) + 1
            if (TournamentBracket.isDecided(m)) playedByGroup[gi] = (playedByGroup[gi] ?: 0) + 1
        }

        // groupPlacement leads: once the server has cut the group its order is
        // the RESULT, not an opinion. The live tally only breaks the tie while
        // every placement is still null (so the comparator's first key is a
        // constant and the remaining keys do all the work).
        //
        // wins-then-seed, matching the web table's ordering exactly (see
        // apps/web/src/features/tournaments/TournamentDetailPage.tsx) — both
        // clients render the same rows, and a player checking one against the
        // other should not find them in different orders. Neither can reproduce
        // the server's head-to-head tiebreak, so players level on wins may swap
        // when the cut lands; that is also the moment the bands stop being a
        // projection. sortedWith is stable, so anyone still level keeps the
        // payload's join order.
        val order = compareBy<TournamentEntryDto> { it.groupPlacement ?: Int.MAX_VALUE }
            .thenByDescending { wins[it.id] ?: 0 }
            .thenBy { it.seed ?: Int.MAX_VALUE }

        return membersByGroup.keys.sorted().map { gi ->
            val members = membersByGroup.getValue(gi)
            val rows = members.sortedWith(order).mapIndexed { i, e ->
                val rank = e.groupPlacement ?: (i + 1)
                Row(
                    entry = e,
                    rank = rank,
                    wins = wins[e.id] ?: 0,
                    losses = losses[e.id] ?: 0,
                    band = bandFor(rank, qualifiersPerGroup)
                )
            }
            Group(
                index = gi,
                label = groupLabel(gi),
                rows = rows,
                played = playedByGroup[gi] ?: 0,
                total = totalByGroup[gi] ?: 0,
                decided = members.all { it.groupPlacement != null }
            )
        }
    }
}
