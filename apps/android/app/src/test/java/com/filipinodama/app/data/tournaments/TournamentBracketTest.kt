package com.filipinodama.app.data.tournaments

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Unit tests for [TournamentBracket] — the Kotlin port of
 * packages/shared/src/bracket.ts (round naming + the vertical layout math the
 * bracket view draws with).
 *
 * These pin the port against the TypeScript original. A drift here is silent
 * by nature: a wrong round label or a wrong feeder rule still renders a
 * plausible-looking bracket, it just puts matches under the wrong heading or
 * runs a connector to the wrong card. No network/Compose dependency, so this
 * is plain JVM-testable logic.
 */
class TournamentBracketTest {

    private fun match(
        id: String,
        round: Int,
        slot: Int,
        bracket: String = "W",
        redEntryId: String? = null,
        blueEntryId: String? = null,
        winnerEntryId: String? = null,
        matchId: String? = null,
        status: String = "pending"
    ) = TournamentMatchDto(
        id = id,
        round = round,
        slot = slot,
        bracket = bracket,
        redEntryId = redEntryId,
        blueEntryId = blueEntryId,
        matchId = matchId,
        winnerEntryId = winnerEntryId,
        status = status
    )

    // ── round-offset scheme ──

    @Test
    fun `bracketOfRound maps the three sub-bracket number ranges`() {
        assertEquals(TournamentBracket.BracketKey.W, TournamentBracket.bracketOfRound(1))
        assertEquals(TournamentBracket.BracketKey.W, TournamentBracket.bracketOfRound(4))
        assertEquals(TournamentBracket.BracketKey.L, TournamentBracket.bracketOfRound(100))
        assertEquals(TournamentBracket.BracketKey.L, TournamentBracket.bracketOfRound(106))
        assertEquals(TournamentBracket.BracketKey.GF, TournamentBracket.bracketOfRound(201))
        assertEquals(TournamentBracket.BracketKey.GF, TournamentBracket.bracketOfRound(202))
    }

    @Test
    fun `the round-offset constants match the server's`() {
        // Shared with apps/server via packages/shared/src/bracket.ts — a drifted
        // copy would file losers matches under a winners heading.
        assertEquals(100, TournamentBracket.L_ROUND_OFFSET)
        assertEquals(201, TournamentBracket.GF_ROUND)
        assertEquals(202, TournamentBracket.GF_RESET_ROUND)
    }

    // ── roundLabel ──

    @Test
    fun `roundLabel names single-elim rounds by distance from the end`() {
        val rounds = listOf(1, 2, 3, 4) // 16-player Cup
        assertEquals("Final", TournamentBracket.roundLabel(4, rounds, false))
        assertEquals("Semifinals", TournamentBracket.roundLabel(3, rounds, false))
        assertEquals("Quarterfinals", TournamentBracket.roundLabel(2, rounds, false))
        assertEquals("Round 1", TournamentBracket.roundLabel(1, rounds, false))
    }

    @Test
    fun `roundLabel is size-relative, so a 4-player round 2 is the Final`() {
        val rounds = listOf(1, 2)
        assertEquals("Final", TournamentBracket.roundLabel(2, rounds, false))
        assertEquals("Semifinals", TournamentBracket.roundLabel(1, rounds, false))
    }

    @Test
    fun `roundLabel switches to Upper Bracket wording for double elimination`() {
        val rounds = listOf(1, 2, 3, 4)
        assertEquals("Upper Bracket Final", TournamentBracket.roundLabel(4, rounds, true))
        assertEquals("Upper Bracket Semifinals", TournamentBracket.roundLabel(3, rounds, true))
        assertEquals("UB Quarterfinals", TournamentBracket.roundLabel(2, rounds, true))
        assertEquals("Upper Bracket Round 1", TournamentBracket.roundLabel(1, rounds, true))
    }

    @Test
    fun `roundLabel names losers-bracket rounds and strips the round offset`() {
        val rounds = listOf(101, 102, 103, 104)
        assertEquals("Lower Bracket Final", TournamentBracket.roundLabel(104, rounds, true))
        assertEquals("Lower Bracket Semifinal", TournamentBracket.roundLabel(103, rounds, true))
        assertEquals("Lower Bracket Quarterfinal", TournamentBracket.roundLabel(102, rounds, true))
        assertEquals("Lower Bracket Round 1", TournamentBracket.roundLabel(101, rounds, true))
    }

    @Test
    fun `roundLabel names both grand-final games`() {
        val rounds = listOf(201, 202)
        assertEquals("Grand Final", TournamentBracket.roundLabel(201, rounds, true))
        assertEquals("Grand Final (reset)", TournamentBracket.roundLabel(202, rounds, true))
    }

    @Test
    fun `roundLabel takes the round list unsorted`() {
        assertEquals("Final", TournamentBracket.roundLabel(2, listOf(2, 1), false))
    }

    // ── layoutBracket ──

    private val metrics = TournamentBracket.Metrics(cardH = 60f, gap = 20f)

    @Test
    fun `layoutBracket stacks round 1 evenly and centres every parent on its two feeders`() {
        val layout = TournamentBracket.layoutBracket(listOf(4, 2, 1), metrics)

        assertEquals(listOf(0f, 80f, 160f, 240f), layout[0])
        // card 0 of round 2 sits midway between cards 0 and 1 of round 1
        assertEquals(listOf(40f, 200f), layout[1])
        assertEquals(listOf(120f), layout[2])
    }

    @Test
    fun `layoutBracket keeps a losers-bracket drop round aligned one to one`() {
        // A "drop" round has the SAME match count as the round before it (the
        // winners bracket's fresh losers enter there) — the case a naive
        // halving layout gets wrong.
        val layout = TournamentBracket.layoutBracket(listOf(2, 2, 1), metrics)

        assertEquals(listOf(0f, 80f), layout[0])
        assertEquals(listOf(0f, 80f), layout[1])
        assertEquals(listOf(40f), layout[2])
    }

    @Test
    fun `layoutBracket degrades to even spacing on a malformed column ratio`() {
        // Never produced by our brackets; must not throw if data is ever bad.
        val layout = TournamentBracket.layoutBracket(listOf(3, 2), metrics)

        assertEquals(2, layout[1].size)
        assertTrue(layout[1][0] < layout[1][1])
    }

    @Test
    fun `layoutBracket returns nothing for an empty bracket`() {
        assertTrue(TournamentBracket.layoutBracket(emptyList(), metrics).isEmpty())
    }

    @Test
    fun `bracketHeight is the lowest card bottom of any column`() {
        val layout = TournamentBracket.layoutBracket(listOf(4, 2, 1), metrics)
        assertEquals(300f, TournamentBracket.bracketHeight(layout, metrics), 0.001f)
    }

    // ── feedersFor (must agree with the layout rule, or connectors lie) ──

    @Test
    fun `feedersFor derives the feeder pair from adjacent column sizes`() {
        assertEquals(listOf(0, 1), TournamentBracket.feedersFor(index = 0, size = 2, prevSize = 4))
        assertEquals(listOf(2, 3), TournamentBracket.feedersFor(index = 1, size = 2, prevSize = 4))
        assertEquals(listOf(1), TournamentBracket.feedersFor(index = 1, size = 2, prevSize = 2))
        assertEquals(emptyList<Int>(), TournamentBracket.feedersFor(index = 0, size = 2, prevSize = 3))
    }

    // ── per-slot display facts (BYE vs TBD is the regression that bit web) ──

    @Test
    fun `a half-filled pending slot is TBD, not a BYE`() {
        // The empty side is waiting on the match that feeds it. Calling this a
        // bye told half the first round they had a free pass through.
        val pending = match("m", round = 2, slot = 0, redEntryId = "e1", status = "pending")
        val readyToPlay = match("m", round = 2, slot = 0, blueEntryId = "e2", status = "ready")

        assertFalse(TournamentBracket.isBye(pending))
        assertFalse(TournamentBracket.isBye(readyToPlay))
        assertFalse(TournamentBracket.isDecided(pending))
    }

    @Test
    fun `a resolved slot with only one competitor is a real BYE`() {
        // The server seeds byes already done, with the lone entrant as winner.
        val bye = match("m", round = 1, slot = 0, redEntryId = "e1", winnerEntryId = "e1", status = "done")

        assertTrue(TournamentBracket.isBye(bye))
        assertTrue(TournamentBracket.isDecided(bye))
    }

    @Test
    fun `a normally played slot is decided but never a BYE`() {
        val played = match(
            "m", round = 1, slot = 0,
            redEntryId = "e1", blueEntryId = "e2", winnerEntryId = "e2",
            matchId = "match1", status = "done"
        )

        assertTrue(TournamentBracket.isDecided(played))
        assertFalse(TournamentBracket.isBye(played))
        assertFalse("a settled match is history, not live", TournamentBracket.isLive(played))
    }

    @Test
    fun `a slot is live only while it has a match that has not settled`() {
        val live = match("m", round = 1, slot = 0, redEntryId = "e1", blueEntryId = "e2", matchId = "match1", status = "ready")

        assertTrue(TournamentBracket.isLive(live))
        assertFalse(TournamentBracket.isLive(match("m", round = 1, slot = 0, status = "ready")))
    }

    // ── sections ──

    @Test
    fun `sections returns one unlabeled section for a single-elimination bracket`() {
        val matches = listOf(
            match("m2", round = 2, slot = 0),
            match("m1", round = 1, slot = 1),
            match("m0", round = 1, slot = 0)
        )

        val sections = TournamentBracket.sections(matches, doubleElim = false)

        assertEquals(1, sections.size)
        assertEquals(TournamentBracket.BracketKey.W, sections[0].key)
        assertEquals(null, sections[0].title)
        assertEquals(listOf(1, 2), sections[0].rounds)
        // slot order within a round, regardless of the input order
        assertEquals(listOf("m0", "m1"), sections[0].matchesByRound[1]?.map { it.id })
    }

    @Test
    fun `sections splits double elimination into upper, lower and grand final in order`() {
        val matches = listOf(
            match("gf", round = 201, slot = 0, bracket = "GF"),
            match("w1", round = 1, slot = 0, bracket = "W"),
            match("l1", round = 101, slot = 0, bracket = "L")
        )

        val sections = TournamentBracket.sections(matches, doubleElim = true)

        assertEquals(
            listOf(TournamentBracket.BracketKey.W, TournamentBracket.BracketKey.L, TournamentBracket.BracketKey.GF),
            sections.map { it.key }
        )
        assertEquals(listOf("Upper Bracket", "Lower Bracket", "Grand Final"), sections.map { it.title })
    }

    @Test
    fun `sections drops empty sub-brackets rather than drawing an empty column`() {
        val matches = listOf(match("w1", round = 1, slot = 0, bracket = "W"))

        val sections = TournamentBracket.sections(matches, doubleElim = true)

        assertEquals(1, sections.size)
        assertEquals(TournamentBracket.BracketKey.W, sections[0].key)
    }

    @Test
    fun `sections keeps a match with an unknown bracket value visible under W`() {
        val matches = listOf(match("x", round = 1, slot = 0, bracket = "???"))

        val sections = TournamentBracket.sections(matches, doubleElim = false)

        assertEquals(1, sections.size)
        assertEquals(listOf("x"), sections[0].matchesByRound[1]?.map { it.id })
    }
}
