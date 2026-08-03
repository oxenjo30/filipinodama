package com.filipinodama.app.data.tournaments

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Unit tests for [TournamentGroups] — the GROUP_DOUBLE_ELIM standings table.
 *
 * The qualification cut is the thing worth pinning: an off-by-one renders a
 * table that looks entirely reasonable and simply tells the wrong players they
 * are through, which no screenshot review would catch.
 */
class TournamentGroupsTest {

    private fun entry(
        id: String,
        username: String = id,
        seed: Int? = null,
        groupIndex: Int? = 0,
        groupPlacement: Int? = null
    ) = TournamentEntryDto(
        id = id,
        seed = seed,
        groupIndex = groupIndex,
        groupPlacement = groupPlacement,
        user = TournamentEntryUserDto(id = "u-$id", username = username)
    )

    /** A settled group-stage slot: red beat blue. */
    private fun played(id: String, winner: String, loser: String, round: Int = 301) =
        TournamentMatchDto(
            id = id,
            round = round,
            slot = 0,
            bracket = "G",
            redEntryId = winner,
            blueEntryId = loser,
            matchId = "match-$id",
            winnerEntryId = winner,
            status = "done"
        )

    private fun scheduled(id: String, a: String, b: String, round: Int = 301) =
        TournamentMatchDto(
            id = id,
            round = round,
            slot = 0,
            bracket = "G",
            redEntryId = a,
            blueEntryId = b,
            status = "pending"
        )

    // ── bandFor: the qualification cut ──

    @Test
    fun `bandFor splits the qualifiers in half and eliminates the rest`() {
        // 4 qualifiers of a group of 6: 1-2 upper, 3-4 lower, 5-6 out.
        assertEquals(TournamentGroups.Band.UPPER, TournamentGroups.bandFor(1, 4))
        assertEquals(TournamentGroups.Band.UPPER, TournamentGroups.bandFor(2, 4))
        assertEquals(TournamentGroups.Band.LOWER, TournamentGroups.bandFor(3, 4))
        assertEquals(TournamentGroups.Band.LOWER, TournamentGroups.bandFor(4, 4))
        assertEquals(TournamentGroups.Band.ELIMINATED, TournamentGroups.bandFor(5, 4))
    }

    @Test
    fun `bandFor matches The International's 8-qualifier shape`() {
        assertEquals(TournamentGroups.Band.UPPER, TournamentGroups.bandFor(4, 8))
        assertEquals(TournamentGroups.Band.LOWER, TournamentGroups.bandFor(5, 8))
        assertEquals(TournamentGroups.Band.LOWER, TournamentGroups.bandFor(8, 8))
        assertEquals(TournamentGroups.Band.ELIMINATED, TournamentGroups.bandFor(9, 8))
    }

    @Test
    fun `bandFor refuses to guess a cut it was not told`() {
        // An unbanded table is honest; a guessed cut tells players a lie.
        assertEquals(TournamentGroups.Band.UNKNOWN, TournamentGroups.bandFor(1, null))
        assertEquals(TournamentGroups.Band.UNKNOWN, TournamentGroups.bandFor(1, 0))
        assertNull(TournamentGroups.cutSummary(null))
    }

    @Test
    fun `cutSummary states both halves of the split`() {
        assertEquals(
            "Top 4 of each group start in the Upper Bracket, the next 4 drop to the " +
                "Lower Bracket. Everyone below is out.",
            TournamentGroups.cutSummary(8)
        )
    }

    // ── groupLabel ──

    @Test
    fun `groupLabel letters the groups and falls back past Z`() {
        assertEquals("Group A", TournamentGroups.groupLabel(0))
        assertEquals("Group B", TournamentGroups.groupLabel(1))
        assertEquals("Group Z", TournamentGroups.groupLabel(25))
        assertEquals("Group 27", TournamentGroups.groupLabel(26))
    }

    // ── standings ──

    @Test
    fun `standings returns nothing for a format that has no groups`() {
        val entries = listOf(entry("e1", groupIndex = null), entry("e2", groupIndex = null))

        assertTrue(TournamentGroups.standings(entries, emptyList(), null).isEmpty())
    }

    @Test
    fun `standings tallies wins and losses from the groups own decided matches`() {
        val entries = listOf(entry("a"), entry("b"), entry("c"), entry("d"))
        val matches = listOf(
            played("m1", winner = "a", loser = "b"),
            played("m2", winner = "a", loser = "c"),
            played("m3", winner = "b", loser = "c"),
            scheduled("m4", "d", "a")
        )

        val group = TournamentGroups.standings(entries, matches, qualifiersPerGroup = 2).single()

        // c and d are level on wins and both unseeded here, so the stable sort
        // leaves them in payload (join) order — the web table resolves the same
        // tie the same way.
        assertEquals(listOf("a", "b", "c", "d"), group.rows.map { it.entry.id })
        assertEquals(listOf(1, 2, 3, 4), group.rows.map { it.rank })
        assertEquals(2 to 0, group.rows[0].wins to group.rows[0].losses)
        assertEquals(1 to 1, group.rows[1].wins to group.rows[1].losses)
        assertEquals(0 to 2, group.rows[2].wins to group.rows[2].losses)
        assertEquals(0 to 0, group.rows[3].wins to group.rows[3].losses)
        // Progress counts every slot the group owns, played or not.
        assertEquals(3, group.played)
        assertEquals(4, group.total)
    }

    @Test
    fun `standings ignores matches outside the group stage`() {
        // A playoff win must not pad a group record.
        val entries = listOf(entry("a"), entry("b"))
        val matches = listOf(
            TournamentMatchDto(
                id = "w", round = 2, slot = 0, bracket = "W",
                redEntryId = "a", blueEntryId = "b",
                matchId = "match-w", winnerEntryId = "a", status = "done"
            )
        )

        val group = TournamentGroups.standings(entries, matches, qualifiersPerGroup = 2).single()

        assertEquals(0, group.rows.sumOf { it.wins })
        assertEquals(0, group.total)
    }

    @Test
    fun `standings bands the live table before the server has cut it`() {
        val entries = listOf(entry("a"), entry("b"), entry("c"), entry("d"))
        val matches = listOf(
            played("m1", winner = "a", loser = "d"),
            played("m2", winner = "b", loser = "c"),
            played("m3", winner = "b", loser = "d")
        )

        val group = TournamentGroups.standings(entries, matches, qualifiersPerGroup = 2).single()

        assertFalse("no placement written yet — this is a projection", group.decided)
        assertEquals(
            listOf(
                TournamentGroups.Band.UPPER,      // b, 2-0
                TournamentGroups.Band.LOWER,      // a, 1-0
                TournamentGroups.Band.ELIMINATED, // c, 0-1
                TournamentGroups.Band.ELIMINATED  // d, 0-2
            ),
            group.rows.map { it.band }
        )
    }

    @Test
    fun `standings defers to the servers groupPlacement once it is written`() {
        // The cut is the server's call. Here it disagrees with a plain
        // win-count sort (a head-to-head or tiebreak we don't model), and the
        // server must win — otherwise the table contradicts the bracket.
        val entries = listOf(
            entry("a", groupPlacement = 2),
            entry("b", groupPlacement = 1),
            entry("c", groupPlacement = 3)
        )
        val matches = listOf(
            played("m1", winner = "a", loser = "b"),
            played("m2", winner = "a", loser = "c")
        )

        val group = TournamentGroups.standings(entries, matches, qualifiersPerGroup = 2).single()

        assertTrue(group.decided)
        assertEquals(listOf("b", "a", "c"), group.rows.map { it.entry.id })
        assertEquals(listOf(1, 2, 3), group.rows.map { it.rank })
    }

    @Test
    fun `standings splits entries by group and orders the groups`() {
        val entries = listOf(
            entry("b1", groupIndex = 1),
            entry("a1", groupIndex = 0),
            entry("b2", groupIndex = 1),
            entry("a2", groupIndex = 0)
        )
        val matches = listOf(
            played("m1", winner = "a2", loser = "a1"),
            played("m2", winner = "b1", loser = "b2")
        )

        val groups = TournamentGroups.standings(entries, matches, qualifiersPerGroup = 2)

        assertEquals(listOf("Group A", "Group B"), groups.map { it.label })
        assertEquals(listOf("a2", "a1"), groups[0].rows.map { it.entry.id })
        assertEquals(listOf("b1", "b2"), groups[1].rows.map { it.entry.id })
        // Each group's progress is its own, not the whole stage's.
        assertEquals(1, groups[0].total)
        assertEquals(1, groups[1].total)
    }

    @Test
    fun `standings breaks an equal record by seed, matching the web table`() {
        val entries = listOf(entry("late", seed = 4), entry("early", seed = 1))

        val group = TournamentGroups.standings(entries, emptyList(), qualifiersPerGroup = 2).single()

        assertEquals(listOf("early", "late"), group.rows.map { it.entry.id })
    }
}
