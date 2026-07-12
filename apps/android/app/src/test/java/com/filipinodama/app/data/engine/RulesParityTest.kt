package com.filipinodama.app.data.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Parity tests ported 1:1 from packages/game-engine/test/engine.test.ts —
 * each test below cites its TS source line range and reproduces the exact
 * board/turn/expectation so this Kotlin [Rules] port is provably faithful to
 * the authoritative TS engine, not a reinterpretation. 20 vectors (task asked
 * for >=15).
 */
class RulesParityTest {

    private fun man(id: String, color: PieceColor, r: Int, c: Int) = Piece(id, color, king = false, square = Square(r, c))
    private fun king(id: String, color: PieceColor, r: Int, c: Int) = Piece(id, color, king = true, square = Square(r, c))

    private fun board(
        pieces: List<Piece>,
        turn: PieceColor = PieceColors.RED,
        settings: GameSettings = DEFAULT_SETTINGS
    ) = GameState(id = "t", pieces = pieces, turn = turn, moveNumber = 1, history = emptyList(), settings = settings)

    private fun dest(m: Move): String = "${m.landing.r},${m.landing.c}"

    // ===== SETUP & MOVEMENT (engine.test.ts:74-148) =====

    @Test
    fun `initial state has 12 red + 12 blue men, red to move`() {
        // engine.test.ts:75-89
        val s = Rules.initialState()
        val reds = s.pieces.filter { it.color == PieceColors.RED }
        val blues = s.pieces.filter { it.color == PieceColors.BLUE }
        assertEquals(12, reds.size)
        assertEquals(12, blues.size)
        assertTrue(reds.all { it.square.r >= 5 && isDark(it.square.r, it.square.c) && !it.king })
        assertTrue(blues.all { it.square.r <= 2 && isDark(it.square.r, it.square.c) && !it.king })
        assertFalse(s.pieces.any { it.square.r == 3 || it.square.r == 4 })
        assertEquals(PieceColors.RED, s.turn)
        assertEquals(1, s.moveNumber)
        assertTrue(s.history.isEmpty())
    }

    @Test
    fun `vector 1 - a man moves exactly one diagonal step forward to empty squares`() {
        // engine.test.ts:99-106
        val s = board(listOf(man("a", PieceColors.RED, 5, 2)))
        val moves = Rules.legalMoves(s)
        assertEquals(2, moves.size)
        assertEquals(listOf("4,1", "4,3"), moves.map(::dest).sorted())
        assertTrue(moves.all { it.path.size == 1 })
    }

    @Test
    fun `vector 2 - a red man cannot move backward or onto occupied`() {
        // engine.test.ts:108-115
        val s = board(listOf(man("a", PieceColors.RED, 5, 2), man("b", PieceColors.RED, 4, 1)))
        val aMoves = Rules.legalMoves(s).filter { it.from.r == 5 && it.from.c == 2 }
        assertEquals(listOf("4,3"), aMoves.map(::dest))
        assertTrue(aMoves.all { it.landing.r < 5 })
    }

    @Test
    fun `vector 3 - a blue man moves forward = downward`() {
        // engine.test.ts:117-121
        val s = board(listOf(man("a", PieceColors.BLUE, 2, 3)), PieceColors.BLUE)
        val moves = Rules.legalMoves(s)
        assertTrue(moves.all { it.landing.r == 3 })
    }

    @Test
    fun `vector 4 - a man on the edge has only one forward square`() {
        // engine.test.ts:123-126
        val s = board(listOf(man("a", PieceColors.RED, 5, 0)))
        assertEquals(listOf("4,1"), Rules.legalMoves(s).map(::dest))
    }

    @Test
    fun `vector 5 - a king slides multiple empty squares along all four diagonals`() {
        // engine.test.ts:128-136
        val s = board(listOf(king("k", PieceColors.RED, 4, 3)))
        val dests = Rules.legalMoves(s).map(::dest)
        assertTrue(dests.contains("7,0"))
        assertTrue(dests.contains("7,6"))
        assertTrue(dests.contains("1,0"))
        assertTrue(dests.contains("0,7"))
    }

    @Test
    fun `vector 6 - a king is blocked by the first occupied square in a direction`() {
        // engine.test.ts:138-147
        val s = board(listOf(king("k", PieceColors.RED, 3, 4), man("blk", PieceColors.RED, 5, 2)))
        val downLeft = Rules.legalMoves(s)
            .filter { it.from.r == 3 && it.from.c == 4 && it.landing.c < 4 && it.landing.r > 3 }
            .map(::dest)
        assertTrue(downLeft.contains("4,3"))
        assertFalse(downLeft.contains("5,2"))
        assertFalse(downLeft.contains("6,1"))
    }

    // ===== CAPTURES (engine.test.ts:153-253) =====

    @Test
    fun `vector 7 - a man captures forward`() {
        // engine.test.ts:154-160
        val s = board(listOf(man("a", PieceColors.RED, 5, 2), man("b", PieceColors.BLUE, 4, 3)))
        val caps = Rules.legalMoves(s)
        assertEquals(1, caps.size)
        assertEquals(1, caps[0].captures.size)
        assertEquals(Square(3, 4), caps[0].landing)
    }

    @Test
    fun `vector 8 - a man captures BACKWARD (Filipino Dama allows it)`() {
        // engine.test.ts:162-169
        val s = board(listOf(man("a", PieceColors.RED, 3, 4), man("b", PieceColors.BLUE, 4, 3)))
        val caps = Rules.legalMoves(s)
        assertEquals(1, caps.size)
        assertEquals(Square(5, 2), caps[0].landing)
        assertEquals(Square(4, 3), caps[0].captures[0])
    }

    @Test
    fun `vector 9 - mandatory capture excludes quiet moves`() {
        // engine.test.ts:171-174
        val s = board(listOf(man("a", PieceColors.RED, 5, 2), man("b", PieceColors.BLUE, 4, 3)))
        assertTrue(Rules.legalMoves(s).all { it.captures.isNotEmpty() })
    }

    @Test
    fun `vector 10 - a 2-capture chain is generated and forced to the end`() {
        // engine.test.ts:176-183
        val s = board(listOf(man("a", PieceColors.RED, 5, 2), man("b", PieceColors.BLUE, 4, 3), man("c", PieceColors.BLUE, 2, 5)))
        val moves = Rules.legalMoves(s)
        assertEquals(1, moves.size)
        assertEquals(2, moves[0].captures.size)
        assertEquals(Square(1, 6), moves[0].landing)
    }

    @Test
    fun `vector 11 - a 3-capture zig-zag chain is generated and forced to the end`() {
        // engine.test.ts:185-198
        val s = board(
            listOf(
                man("a", PieceColors.RED, 5, 2),
                man("v1", PieceColors.BLUE, 4, 3),
                man("v2", PieceColors.BLUE, 2, 3),
                man("v3", PieceColors.BLUE, 2, 1)
            )
        )
        val moves = Rules.legalMoves(s)
        assertTrue(moves.all { it.captures.size == 3 })
        val chain = moves[0]
        assertEquals(3, chain.captures.size)
        assertEquals(3, chain.path.size)
    }

    @Test
    fun `vector 12 - king flying capture lands on any empty square beyond the victim`() {
        // engine.test.ts:200-206
        val s = board(listOf(king("k", PieceColors.RED, 7, 0), man("b", PieceColors.BLUE, 4, 3)))
        val landings = Rules.legalMoves(s).map(::dest).sorted()
        assertEquals(listOf("0,7", "1,6", "2,5", "3,4"), landings)
        assertTrue(Rules.legalMoves(s).all { it.captures.size == 1 })
    }

    @Test
    fun `vector 13 - cannot jump own piece`() {
        // engine.test.ts:208-212
        val s = board(listOf(man("a", PieceColors.RED, 5, 2), man("own", PieceColors.RED, 4, 3)))
        assertTrue(Rules.legalMoves(s).all { it.captures.isEmpty() })
    }

    @Test
    fun `vector 14 - cannot jump two pieces at once with no empty gap`() {
        // engine.test.ts:214-222
        val s = board(listOf(man("a", PieceColors.RED, 5, 2), man("b", PieceColors.BLUE, 4, 3), man("c", PieceColors.BLUE, 3, 4)))
        val moves = Rules.legalMoves(s)
        assertFalse(moves.any { it.landing.sameAs(Square(2, 5)) && it.captures.size == 2 })
    }

    @Test
    fun `vector 15 - king cannot jump two pieces at once along the diagonal`() {
        // engine.test.ts:224-230
        val s = board(listOf(king("k", PieceColors.RED, 7, 0), man("b1", PieceColors.BLUE, 5, 2), man("b2", PieceColors.BLUE, 4, 3)))
        val caps = Rules.legalMoves(s).filter { it.captures.isNotEmpty() }
        assertTrue(caps.isEmpty())
    }

    @Test
    fun `vector 16 - cannot re-jump the same piece in one chain`() {
        // engine.test.ts:232-238
        val s = board(listOf(man("a", PieceColors.RED, 5, 2), man("b", PieceColors.BLUE, 4, 3), man("c", PieceColors.BLUE, 2, 5)))
        val chain = Rules.legalMoves(s)[0]
        val capKeys = chain.captures.map { "${it.r},${it.c}" }
        assertEquals(capKeys.size, capKeys.toSet().size)
    }

    @Test
    fun `vector 17 - captured pieces block landing during the chain, removed only at chain end`() {
        // engine.test.ts:240-252
        val s = board(listOf(man("a", PieceColors.RED, 5, 2), man("b", PieceColors.BLUE, 4, 3), man("c", PieceColors.BLUE, 2, 5)))
        val chain = Rules.legalMoves(s)[0]
        for (land in chain.path) {
            assertFalse(chain.captures.any { it.sameAs(land) })
        }
        val after = Rules.applyMove(s, chain)
        assertTrue(after.pieces.none { it.color == PieceColors.BLUE })
        assertEquals(1, after.pieces.size)
    }

    // ===== FORCED / MAXIMUM CAPTURE (engine.test.ts:258-308) =====

    @Test
    fun `vector 18 - forcedMaxCapture true keeps only the longest chains`() {
        // engine.test.ts:259-270
        val s = board(
            listOf(
                man("a", PieceColors.RED, 5, 2),
                man("b", PieceColors.BLUE, 4, 3),
                man("c", PieceColors.BLUE, 2, 5),
                man("d", PieceColors.BLUE, 4, 1)
            ),
            PieceColors.RED,
            GameSettings(forcedMaxCapture = true, drawMoveLimit = 40)
        )
        val moves = Rules.legalMoves(s)
        val max = moves.maxOf { it.captures.size }
        assertTrue(max >= 2)
        assertTrue(moves.all { it.captures.size == max })
    }

    @Test
    fun `vector 19 - forcedMaxCapture false keeps shorter captures too`() {
        // engine.test.ts:272-284
        val s = board(
            listOf(
                man("a", PieceColors.RED, 5, 2),
                man("b", PieceColors.BLUE, 4, 3),
                man("c", PieceColors.BLUE, 2, 5),
                man("d", PieceColors.BLUE, 4, 1)
            ),
            PieceColors.RED,
            GameSettings(forcedMaxCapture = false, drawMoveLimit = 40)
        )
        val moves = Rules.legalMoves(s)
        val lens = moves.map { it.captures.size }.toSet()
        assertTrue(lens.contains(1))
        assertTrue(lens.contains(2))
        assertTrue(moves.all { it.captures.isNotEmpty() })
    }

    @Test
    fun `vector 20 - isLegal rejects a non-maximal capture under forcedMaxCapture`() {
        // engine.test.ts:286-295
        val s = board(listOf(man("a", PieceColors.RED, 5, 2), man("b", PieceColors.BLUE, 4, 3), man("c", PieceColors.BLUE, 2, 5)))
        val shortMove = Move(from = Square(5, 2), path = listOf(Square(3, 4)), captures = listOf(Square(4, 3)), promotion = false)
        assertFalse(Rules.isLegal(s, shortMove))
    }

    @Test
    fun `vector 21 - isLegal accepts the exact maximal chain`() {
        // engine.test.ts:297-301
        val s = board(listOf(man("a", PieceColors.RED, 5, 2), man("b", PieceColors.BLUE, 4, 3), man("c", PieceColors.BLUE, 2, 5)))
        val full = Rules.legalMoves(s)[0]
        assertTrue(Rules.isLegal(s, full))
    }

    @Test(expected = IllegalArgumentException::class)
    fun `vector 22 - applyMove throws on an illegal move`() {
        // engine.test.ts:303-307
        val s = board(listOf(man("a", PieceColors.RED, 5, 2)))
        val bogus = Move(from = Square(5, 2), path = listOf(Square(6, 3)), captures = emptyList(), promotion = false)
        Rules.applyMove(s, bogus)
    }

    // ===== PROMOTION (engine.test.ts:313-374) =====

    @Test
    fun `vector 23 - a man reaching the back rank on a quiet move promotes and the turn ends`() {
        // engine.test.ts:314-321
        val s = board(listOf(man("a", PieceColors.RED, 1, 2)))
        val mv = Rules.legalMoves(s).first { it.landing.r == 0 }
        assertTrue(mv.promotion)
        val ns = Rules.applyMove(s, mv)
        assertTrue(ns.pieces[0].king)
        assertEquals(PieceColors.BLUE, ns.turn)
    }

    @Test
    fun `vector 24 - a capture landing on the back rank promotes and the chain stops`() {
        // engine.test.ts:323-343
        val s = board(
            listOf(
                man("a", PieceColors.RED, 2, 3),
                man("v1", PieceColors.BLUE, 1, 2),
                man("v2", PieceColors.BLUE, 1, 0)
            )
        )
        val moves = Rules.legalMoves(s)
        assertTrue(moves.all { it.captures.size == 1 })
        val mv = moves.first { it.landing.r == 0 && it.landing.c == 1 }
        assertTrue(mv.promotion)
        val ns = Rules.applyMove(s, mv)
        val moved = ns.pieces.first { it.color == PieceColors.RED }
        assertTrue(moved.king)
        assertEquals(Square(0, 1), moved.square)
        assertTrue(ns.pieces.any { it.square.r == 1 && it.square.c == 0 })
    }

    @Test
    fun `vector 25 - promotion is authoritative from the landing square, ignoring a spoofed flag`() {
        // engine.test.ts:353-362
        val s = board(listOf(man("a", PieceColors.RED, 1, 2)))
        val mv = Rules.legalMoves(s).first { it.landing.r == 0 }
        val spoofed = mv.copy(promotion = false)
        val ns = Rules.applyMove(s, spoofed)
        assertTrue(ns.pieces[0].king)
    }

    @Test
    fun `vector 26 - blue man reaching row 7 (its back rank) promotes`() {
        // engine.test.ts:364-373
        val s = board(listOf(man("b", PieceColors.BLUE, 6, 1)), PieceColors.BLUE)
        val mv = Rules.legalMoves(s).first { it.landing.r == 7 }
        val ns = Rules.applyMove(s, mv.copy(promotion = false))
        val moved = ns.pieces.first { it.color == PieceColors.BLUE }
        assertTrue(moved.king)
        assertEquals(7, moved.square.r)
    }

    // ===== OUTCOME (engine.test.ts:379-494) =====

    @Test
    fun `vector 27 - win by capturing all opponent pieces (red wins)`() {
        // engine.test.ts:380-385
        val s = board(listOf(man("a", PieceColors.RED, 5, 2), man("b", PieceColors.BLUE, 4, 3)))
        val ns = Rules.applyMove(s, Rules.legalMoves(s)[0])
        assertEquals(PieceColors.RED, ns.result?.winner)
        assertEquals(MatchEndReasons.CAPTURE_ALL, ns.result?.reason)
    }

    @Test
    fun `vector 28 - win when blue is captured entirely (symmetric branch)`() {
        // engine.test.ts:387-393
        val s = board(listOf(man("b", PieceColors.BLUE, 2, 5), man("r", PieceColors.RED, 3, 4)), PieceColors.BLUE)
        val ns = Rules.applyMove(s, Rules.legalMoves(s)[0])
        assertEquals(PieceColors.BLUE, ns.result?.winner)
        assertEquals(MatchEndReasons.CAPTURE_ALL, ns.result?.reason)
    }

    @Test
    fun `vector 29 - no legal moves is a loss for the boxed side`() {
        // engine.test.ts:395-407
        val s = board(
            listOf(
                man("b", PieceColors.BLUE, 0, 1),
                man("r1", PieceColors.RED, 1, 0),
                man("r2", PieceColors.RED, 1, 2),
                man("r3", PieceColors.RED, 2, 3)
            ),
            PieceColors.BLUE
        )
        assertTrue(Rules.legalMoves(s, PieceColors.BLUE).isEmpty())
        val out = Rules.checkOutcome(s)
        assertEquals(PieceColors.RED, out?.winner)
        assertEquals(MatchEndReasons.NO_MOVES, out?.reason)
    }

    @Test
    fun `vector 30 - no result while the game continues`() {
        // engine.test.ts:409-412
        val s = board(listOf(man("a", PieceColors.RED, 5, 2), man("b", PieceColors.BLUE, 1, 4)))
        assertNull(Rules.checkOutcome(s))
    }

    @Test
    fun `vector 31 - positionKey is canonical regardless of piece order or id`() {
        // engine.test.ts:483-493
        val a = board(listOf(king("R", PieceColors.RED, 7, 0), man("bm", PieceColors.BLUE, 2, 5)), PieceColors.RED)
        val b = board(listOf(man("x", PieceColors.BLUE, 2, 5), king("y", PieceColors.RED, 7, 0)), PieceColors.RED)
        assertEquals(Rules.positionKey(a), Rules.positionKey(b))
        val c = board(listOf(king("R", PieceColors.RED, 7, 0), man("bm", PieceColors.BLUE, 2, 5)), PieceColors.BLUE)
        assertTrue(Rules.positionKey(a) != Rules.positionKey(c))
        val d = board(listOf(man("R", PieceColors.RED, 7, 0), man("bm", PieceColors.BLUE, 2, 5)), PieceColors.RED)
        assertTrue(Rules.positionKey(a) != Rules.positionKey(d))
    }

    @Test
    fun `vector 32 - applyMove does not mutate its input`() {
        // engine.test.ts:500-505
        val s = Rules.initialState()
        val snapshotPieces = s.pieces.toList()
        Rules.applyMove(s, Rules.legalMoves(s)[0])
        assertEquals(snapshotPieces, s.pieces)
        assertEquals(PieceColors.RED, s.turn)
    }

    @Test
    fun `vector 33 - draw by threefold repetition of exact position plus side to move`() {
        // engine.test.ts:461-481
        var s = board(
            listOf(
                king("R", PieceColors.RED, 7, 0),
                man("rm", PieceColors.RED, 5, 2),
                king("B", PieceColors.BLUE, 0, 7),
                man("bm", PieceColors.BLUE, 2, 5)
            ),
            PieceColors.RED,
            GameSettings(forcedMaxCapture = true, drawMoveLimit = 1000)
        )
        val cycle = listOf(
            listOf(7, 0, 6, 1),
            listOf(0, 7, 1, 6),
            listOf(6, 1, 7, 0),
            listOf(1, 6, 0, 7)
        )
        outer@ for (rep in 0 until 4) {
            for (step in cycle) {
                val (fr, fc, tr, tc) = step
                val mv = Rules.legalMoves(s).first { it.from.r == fr && it.from.c == fc && it.landing.r == tr && it.landing.c == tc }
                s = Rules.applyMove(s, mv)
                if (s.result != null) break@outer
            }
        }
        assertEquals(MatchEndReasons.REPETITION, s.result?.reason)
        assertEquals("draw", s.result?.winner)
    }
}
