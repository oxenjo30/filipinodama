package com.filipinodama.app.data.match

import com.filipinodama.app.data.engine.Ai
import com.filipinodama.app.data.engine.AiDifficulties
import com.filipinodama.app.data.engine.DEFAULT_SETTINGS
import com.filipinodama.app.data.engine.GameResult
import com.filipinodama.app.data.engine.GameState
import com.filipinodama.app.data.engine.MatchEndReasons
import com.filipinodama.app.data.engine.Move
import com.filipinodama.app.data.engine.PieceColors
import com.filipinodama.app.data.engine.Rules
import com.filipinodama.app.data.engine.Square
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * GameRepository — fully OFFLINE "Play vs AI" mode, a Kotlin port of
 * apps/web/src/stores/gameStore.ts. Confirmed during Phase 3 research: the
 * web "Play vs AI" screen (`/play/ai`, AiSetupPage.tsx eyebrow literally
 * reads "OFFLINE PRACTICE") runs ENTIRELY client-local — createInitialState/
 * legalMoves/applyMove/bestMove straight from the TS engine, ZERO socket or
 * server calls, and the result screen shows no trophy/gold stat tiles at
 * all (only Moves/captures). This repository mirrors that behavior exactly:
 * no network, no currency, no persistence beyond the current process.
 *
 * The human is always RED (bottom, moves first); the AI is always BLUE.
 * AI_THINK_MS mirrors gameStore.ts's AI_THINK_MS=700 so the "thinking" state
 * is visibly held for the same beat.
 */
object GameRepository {

    private const val AI_THINK_MS = 700L

    private val _state = MutableStateFlow(buildInitial(AiDifficulties.NORMAL))
    val state: StateFlow<OfflineGameState> = _state.asStateFlow()

    private var aiJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.Default)

    private fun buildInitial(difficulty: String): OfflineGameState {
        val gs = Rules.initialState(DEFAULT_SETTINGS)
        return OfflineGameState(gameState = gs, difficulty = difficulty, status = OfflineStatus.PLAYING)
            .withHighlights()
    }

    fun newGame(difficulty: String = _state.value.difficulty) {
        aiJob?.cancel()
        _state.value = buildInitial(difficulty)
    }

    fun rematch() = newGame(_state.value.difficulty)

    fun onSquareClick(square: Square) {
        val st = _state.value
        if (st.status != OfflineStatus.PLAYING || st.gameState.result != null) return
        // Only the human (RED) may act — mirrors gameStore.ts's onSquareClick guard.
        if (st.gameState.turn != PieceColors.RED) return

        val selected = st.selected
        if (selected != null) {
            val options = Rules.legalMoves(st.gameState).filter { it.from.sameAs(selected) }
            val chosen = options.find { it.landing.sameAs(square) }
            if (chosen != null) {
                val next = Rules.applyMove(st.gameState, chosen)
                _state.update {
                    it.copy(
                        gameState = next,
                        selected = null,
                        status = if (next.result != null) OfflineStatus.OVER else OfflineStatus.PLAYING
                    ).withHighlights()
                }
                if (next.result == null) scheduleAiMove()
                return
            }
        }

        val piece = st.gameState.pieces.find { it.square.sameAs(square) }
        val canSelect = piece != null && piece.color == PieceColors.RED &&
            Rules.legalMoves(st.gameState).any { it.from.sameAs(square) }
        _state.update { s -> if (canSelect) s.copy(selected = square).withHighlights() else s.copy(selected = null).withHighlights() }
    }

    private fun scheduleAiMove() {
        aiJob?.cancel()
        _state.update { it.copy(status = OfflineStatus.THINKING) }
        aiJob = scope.launch {
            delay(AI_THINK_MS)
            val cur = _state.value
            if (cur.gameState.result != null || cur.gameState.turn != PieceColors.BLUE) {
                if (cur.gameState.result == null) _state.update { it.copy(status = OfflineStatus.PLAYING) }
                return@launch
            }
            val mv = Ai.bestMove(cur.gameState, cur.difficulty)
            val next = Rules.applyMove(cur.gameState, mv)
            _state.update {
                it.copy(
                    gameState = next,
                    selected = null,
                    status = if (next.result != null) OfflineStatus.OVER else OfflineStatus.PLAYING
                ).withHighlights()
            }
        }
    }

    fun canUndo(): Boolean {
        val st = _state.value
        if (st.status != OfflineStatus.PLAYING || st.gameState.result != null) return false
        // Need a completed human+AI exchange (2 plies) so control returns to RED.
        return st.gameState.history.size >= 2
    }

    fun undo() {
        val st = _state.value
        if (st.status != OfflineStatus.PLAYING || st.gameState.result != null) return
        val n = st.gameState.history.size
        if (n < 2) return
        aiJob?.cancel()
        var rolled = Rules.initialState(st.gameState.settings)
        for (i in 0 until n - 2) rolled = Rules.applyMove(rolled, st.gameState.history[i])
        _state.update { it.copy(gameState = rolled, selected = null, status = OfflineStatus.PLAYING).withHighlights() }
    }

    fun resign() {
        val st = _state.value
        if (st.gameState.result != null) return
        aiJob?.cancel()
        val resigned = st.gameState.copy(result = GameResult(winner = PieceColors.BLUE, reason = MatchEndReasons.RESIGN))
        _state.update {
            it.copy(gameState = resigned, selected = null, status = OfflineStatus.OVER, moveTargets = emptyList(), captureTargets = emptyList())
        }
    }

    fun reset() {
        aiJob?.cancel()
        _state.value = buildInitial(_state.value.difficulty)
    }
}

enum class OfflineStatus { PLAYING, THINKING, OVER }

data class OfflineGameState(
    val gameState: GameState,
    val difficulty: String,
    val status: OfflineStatus,
    val selected: Square? = null,
    val moveTargets: List<Square> = emptyList(),
    val captureTargets: List<Square> = emptyList(),
    val mustCapture: Boolean = false
) {
    /** Mirrors gameStore.ts's derive(): highlights for the currently-selected
     *  piece (human/RED only — the AI's turn never has a selection). */
    fun withHighlights(): OfflineGameState {
        val all = Rules.legalMoves(gameState)
        val mustCapture = all.any { it.captures.isNotEmpty() }
        val moveTargets = mutableListOf<Square>()
        val captureTargets = mutableListOf<Square>()
        if (selected != null) {
            for (m in all.filter { it.from.sameAs(selected) }) {
                if (m.captures.isNotEmpty()) captureTargets.add(m.landing) else moveTargets.add(m.landing)
            }
        }
        return copy(moveTargets = moveTargets, captureTargets = captureTargets, mustCapture = mustCapture)
    }

    /** Count of pieces captured per side, derived from history (mirrors
     *  gameStore.ts's capturedCounts — red opens, then alternates). */
    fun capturedCounts(): Pair<Int, Int> {
        var red = 0
        var blue = 0
        var mover = PieceColors.RED
        for (m: Move in gameState.history) {
            if (mover == PieceColors.RED) red += m.captures.size else blue += m.captures.size
            mover = PieceColors.opponent(mover)
        }
        return red to blue
    }
}
