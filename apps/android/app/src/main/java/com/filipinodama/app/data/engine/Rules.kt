package com.filipinodama.app.data.engine

/**
 * Kotlin port of packages/game-engine/src/engine.ts — the MINIMAL classic
 * Filipino Dama (checkers) move-generation logic needed to drive client-side
 * UX hints (tap-a-piece highlighting, compulsory-capture emphasis).
 *
 * READ-ONLY / ADVISORY ONLY. This is never the source of truth for an online
 * match: the server independently validates every move via the TS engine and
 * this helper's output is only used to decide which squares are tappable —
 * exactly the same pattern apps/web/src/stores/onlineStore.ts uses with the
 * real TS `legalMoves()` (see that file's `derive()` for the reference
 * pattern this mirrors 1:1). For the OFFLINE AI mode, this same helper (plus
 * [Ai]) IS authoritative, because that mode has no server involvement at all
 * (mirrors apps/web/src/stores/gameStore.ts, which is equally client-local).
 *
 * Ported faithfully, including the subtle "occupied is physical-presence,
 * not capture-status" rule that makes captured-but-not-yet-removed pieces
 * still block landings and (for kings) ray pass-through mid-chain.
 */
object Rules {

    private val DIRS = listOf(
        Square(-1, -1),
        Square(-1, 1),
        Square(1, -1),
        Square(1, 1)
    )

    private fun inBounds(r: Int, c: Int): Boolean = r in 0..7 && c in 0..7

    private fun opponent(color: PieceColor): PieceColor = PieceColors.opponent(color)

    private fun backRank(color: PieceColor): Int = if (color == PieceColors.RED) 0 else 7

    private fun forwardDir(color: PieceColor): Int = if (color == PieceColors.RED) -1 else 1

    /** Standard 12-per-side opening position, red to move. Mirrors createInitialState. */
    fun initialState(settings: GameSettings = DEFAULT_SETTINGS, id: String = "local"): GameState {
        var idc = 0
        val pieces = mutableListOf<Piece>()
        for (r in 0..7) {
            for (c in 0..7) {
                if (!isDark(r, c)) continue
                when {
                    r <= 2 -> pieces.add(Piece(id = "p${idc++}", color = PieceColors.BLUE, king = false, square = Square(r, c)))
                    r >= 5 -> pieces.add(Piece(id = "p${idc++}", color = PieceColors.RED, king = false, square = Square(r, c)))
                }
            }
        }
        return GameState(id = id, pieces = pieces, turn = PieceColors.RED, moveNumber = 1, history = emptyList(), settings = settings)
    }

    private fun at(pieces: List<Piece>, r: Int, c: Int): Piece? = pieces.find { it.square.r == r && it.square.c == c }

    private fun mkMove(p: Piece, path: List<Square>, captures: List<Square>): Move {
        val landing = path.last()
        val promotion = !p.king && landing.r == backRank(p.color)
        return Move(from = p.square, path = path, captures = captures, promotion = promotion)
    }

    /** All non-capturing moves for a single piece. */
    private fun quietMoves(state: GameState, p: Piece): List<Move> {
        val out = mutableListOf<Move>()
        val dirs = if (p.king) DIRS else DIRS.filter { it.r == forwardDir(p.color) }
        for (d in dirs) {
            var r = p.square.r + d.r
            var c = p.square.c + d.c
            if (p.king) {
                while (inBounds(r, c) && at(state.pieces, r, c) == null) {
                    out.add(mkMove(p, listOf(Square(r, c)), emptyList()))
                    r += d.r
                    c += d.c
                }
            } else if (inBounds(r, c) && at(state.pieces, r, c) == null) {
                out.add(mkMove(p, listOf(Square(r, c)), emptyList()))
            }
        }
        return out
    }

    private data class Chain(val path: List<Square>, val captures: List<Square>)

    /** A square is "occupied" if ANY piece physically stands on it — including a
     *  piece captured earlier in the current chain (removed only at chain end). */
    private fun occupied(pieces: List<Piece>, r: Int, c: Int): Boolean = at(pieces, r, c) != null

    /** The capturable enemy piece on a square, if any — excludes a square already
     *  taken this chain (cannot re-jump the same piece). */
    private fun pieceOn(pieces: List<Piece>, taken: List<Square>, r: Int, c: Int): Piece? {
        val pc = at(pieces, r, c) ?: return null
        if (taken.any { it.r == r && it.c == c }) return null
        return pc
    }

    /** Recursively build all capture chains for a piece from a working board. */
    private fun captureChains(
        pieces: List<Piece>,
        p: Piece,
        from: Square,
        king: Boolean,
        taken: List<Square>,
        path: List<Square>
    ): List<Chain> {
        val results = mutableListOf<Chain>()
        for (d in DIRS) {
            if (king) {
                var r = from.r + d.r
                var c = from.c + d.c
                while (inBounds(r, c) && !occupied(pieces, r, c)) {
                    r += d.r
                    c += d.c
                }
                if (!inBounds(r, c)) continue
                val victim = pieceOn(pieces, taken, r, c) ?: continue
                if (victim.color == p.color) continue
                var lr = r + d.r
                var lc = c + d.c
                while (inBounds(lr, lc) && !occupied(pieces, lr, lc)) {
                    pushChain(results, pieces, p, Square(lr, lc), king, taken + Square(r, c), path)
                    lr += d.r
                    lc += d.c
                }
            } else {
                val mr = from.r + d.r
                val mc = from.c + d.c
                val lr = from.r + 2 * d.r
                val lc = from.c + 2 * d.c
                if (!inBounds(lr, lc)) continue
                val victim = pieceOn(pieces, taken, mr, mc) ?: continue
                if (victim.color == p.color) continue
                if (occupied(pieces, lr, lc)) continue
                // promotion mid-chain ends the turn (Filipino rule)
                val promotes = lr == backRank(p.color)
                pushChain(results, pieces, p, Square(lr, lc), king || promotes, taken + Square(mr, mc), path, promotes)
            }
        }
        return results
    }

    private fun pushChain(
        results: MutableList<Chain>,
        pieces: List<Piece>,
        p: Piece,
        landing: Square,
        king: Boolean,
        taken: List<Square>,
        path: List<Square>,
        stop: Boolean = false
    ) {
        val newPath = path + landing
        val cont = if (stop) emptyList() else captureChains(pieces, p, landing, king, taken, newPath)
        if (cont.isEmpty()) results.add(Chain(newPath, taken)) else results.addAll(cont)
    }

    /** Legal moves for the side to move (or a given color). Captures are mandatory;
     *  when settings.forcedMaxCapture, only the longest chains survive. */
    fun legalMoves(state: GameState, color: PieceColor = state.turn): List<Move> {
        val mine = state.pieces.filter { it.color == color }
        val captures = mutableListOf<Move>()
        for (p in mine) {
            val chains = captureChains(state.pieces, p, p.square, p.king, emptyList(), listOf(p.square))
            for (ch in chains) {
                val realPath = ch.path.drop(1) // drop origin
                captures.add(mkMove(p, realPath, ch.captures))
            }
        }
        if (captures.isNotEmpty()) {
            if (!state.settings.forcedMaxCapture) return captures
            val max = captures.maxOf { it.captures.size }
            return captures.filter { it.captures.size == max }
        }
        val quiet = mutableListOf<Move>()
        for (p in mine) quiet.addAll(quietMoves(state, p))
        return quiet
    }

    fun isLegal(state: GameState, move: Move): Boolean {
        return legalMoves(state).any { m ->
            m.from.sameAs(move.from) &&
                m.path.size == move.path.size &&
                m.path.zip(move.path).all { (a, b) -> a.sameAs(b) }
        }
    }

    /** Apply a move, returning a NEW state (never mutates [state]). Throws if illegal. */
    fun applyMove(state: GameState, move: Move): GameState {
        if (!isLegal(state, move)) throw IllegalArgumentException("Illegal move")
        val capturedSquares = move.captures
        val remaining = state.pieces.filter { pc -> capturedSquares.none { it.r == pc.square.r && it.c == pc.square.c } }
        val mover = at(state.pieces, move.from.r, move.from.c)!!
        val landing = move.path.last()
        // Promotion is AUTHORITATIVE from the landing square, not move.promotion —
        // mirrors engine.ts's applyMoveRaw anti-spoof comment.
        val becomesKing = mover.king || landing.r == backRank(mover.color)
        val movedPiece = mover.copy(square = landing, king = becomesKing)
        val newPieces = remaining.map { if (it.id == mover.id) movedPiece else it }
        val newHistory = state.history + move
        val nextTurn = opponent(state.turn)
        val next = state.copy(
            pieces = newPieces,
            turn = nextTurn,
            moveNumber = state.moveNumber + 1,
            history = newHistory
        )
        return next.copy(result = checkOutcome(next))
    }

    /** A canonical, side-to-move-aware string key for a position (dedup/repetition). */
    fun positionKey(state: GameState): String {
        val parts = state.pieces
            .map { "${it.square.r},${it.square.c},${it.color},${if (it.king) "K" else "m"}" }
            .sorted()
        return "${state.turn}|${parts.joinToString(";")}"
    }

    fun checkOutcome(state: GameState): GameResult? {
        val redLeft = state.pieces.any { it.color == PieceColors.RED }
        val blueLeft = state.pieces.any { it.color == PieceColors.BLUE }
        if (!blueLeft) return GameResult(winner = PieceColors.RED, reason = MatchEndReasons.CAPTURE_ALL)
        if (!redLeft) return GameResult(winner = PieceColors.BLUE, reason = MatchEndReasons.CAPTURE_ALL)
        if (legalMoves(state, state.turn).isEmpty()) {
            return GameResult(winner = opponent(state.turn), reason = MatchEndReasons.NO_MOVES)
        }

        val limit = state.settings.drawMoveLimit
        val (keys, plyWasKingMove) = reconstruct(state)

        // Threefold repetition: the current position (last key) has occurred
        // three times across the whole game history including now.
        val current = keys.last()
        if (keys.count { it == current } >= 3) {
            return GameResult(winner = "draw", reason = MatchEndReasons.REPETITION)
        }

        // Inactivity: the last `limit` plies were ALL king moves with no
        // capture and no promotion, by both sides.
        if (plyWasKingMove.size >= limit) {
            val window = plyWasKingMove.takeLast(limit)
            val moves = state.history.takeLast(limit)
            val stale = window.indices.all { i -> window[i] && moves[i].captures.isEmpty() && !moves[i].promotion }
            if (stale) return GameResult(winner = "draw", reason = MatchEndReasons.INACTIVITY)
        }
        return null
    }

    /** Reconstruct every position the game passed through (for repetition/inactivity
     *  detection) by replaying [state]'s history on a freshly rebuilt starting board. */
    private fun reconstruct(state: GameState): Pair<List<String>, List<Boolean>> {
        var board = startingBoard(state)
        val keys = mutableListOf(positionKey(board))
        val plyWasKingMove = mutableListOf<Boolean>()
        for (mv in state.history) {
            val mover = at(board.pieces, mv.from.r, mv.from.c)
            plyWasKingMove.add(mover?.king == true)
            board = applyMoveRawRebuild(board, mv)
            keys.add(positionKey(board))
        }
        return keys to plyWasKingMove
    }

    /** Apply a move with NO legality check and NO result computation — used only
     *  by [reconstruct] while replaying known-legal history. */
    private fun applyMoveRawRebuild(state: GameState, move: Move): GameState {
        val remaining = state.pieces.filter { pc -> move.captures.none { it.r == pc.square.r && it.c == pc.square.c } }
        val mover = at(state.pieces, move.from.r, move.from.c) ?: return state.copy(
            turn = opponent(state.turn),
            moveNumber = state.moveNumber + 1
        )
        val landing = move.path.last()
        val becomesKing = mover.king || landing.r == backRank(mover.color)
        val movedPiece = mover.copy(square = landing, king = becomesKing)
        val newPieces = remaining.map { if (it.id == mover.id) movedPiece else it }
        return state.copy(pieces = newPieces, turn = opponent(state.turn), moveNumber = state.moveNumber + 1)
    }

    /**
     * Reconstruct the board as it was BEFORE the first move in history, by
     * un-applying each recorded move from the current position in reverse.
     * Mirrors engine.ts's startingBoard — captured pieces are restored as
     * opponent MEN (king-ness of a captured piece isn't recorded on Move), which
     * is exact for the live position and only imprecise for a historical
     * reconstruction used purely for repetition/inactivity keys.
     */
    private fun startingBoard(state: GameState): GameState {
        var pieces = state.pieces
        var turn = state.turn
        var moveNumber = state.moveNumber
        var restoredCounter = 0
        for (i in state.history.indices.reversed()) {
            val mv = state.history[i]
            turn = opponent(turn)
            moveNumber -= 1
            val landing = mv.path.last()
            val mover = pieces.find { it.square.r == landing.r && it.square.c == landing.c }
            pieces = if (mover != null) {
                pieces.map { p ->
                    if (p.id == mover.id) p.copy(square = mv.from, king = if (mv.promotion) false else p.king) else p
                }
            } else {
                pieces
            }
            val restoredColor = mover?.let { opponent(it.color) } ?: opponent(turn)
            for (cap in mv.captures) {
                pieces = pieces + Piece(
                    id = "restored-${i}-${restoredCounter++}",
                    color = restoredColor,
                    king = false,
                    square = cap
                )
            }
        }
        return state.copy(pieces = pieces, turn = turn, moveNumber = moveNumber, history = emptyList(), result = null)
    }
}
