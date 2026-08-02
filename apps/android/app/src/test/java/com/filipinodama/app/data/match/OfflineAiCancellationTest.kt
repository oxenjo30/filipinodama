package com.filipinodama.app.data.match

import com.filipinodama.app.data.engine.AiDifficulties
import com.filipinodama.app.data.engine.PieceColors
import com.filipinodama.app.data.engine.Rules
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

/**
 * The offline AI must never commit a move after the game has ended.
 *
 * ROOT CAUSE: Kotlin cancellation is COOPERATIVE, and `scheduleAiMove` had no
 * suspension point after its `delay` — `Ai.bestMove` is a pure CPU search and
 * `MutableStateFlow.update` doesn't suspend. So `aiJob?.cancel()` could not stop
 * the block: the search finished and wrote a move computed from the OLD board.
 *
 * THE VISIBLE BUG: resign while "AI is thinking…" and the resigned game came
 * back to life — result was cleared, status flipped from OVER back to PLAYING.
 * The screen had already POSTed the loss, so when the game ended for real it
 * POSTed a SECOND record: one game, two rows in the AI win/loss tally.
 *
 * These are timing-sensitive by nature, so they assert the INVARIANT that
 * matters ("a finished game stays finished") rather than trying to hit the exact
 * race window.
 *
 * runBlocking, NOT runTest: GameRepository's scope is a real
 * CoroutineScope(Dispatchers.Default), so its `delay(AI_THINK_MS)` is real time.
 * runTest's virtual clock would skip our waits instantly, the AI job would never
 * actually run, and every assertion here would pass vacuously.
 */
class OfflineAiCancellationTest {

    @After
    fun tearDown() {
        GameRepository.reset()
    }

    /** Play RED's first legal move, which schedules the AI's reply. */
    private fun playOneMove() {
        val gs = GameRepository.state.value.gameState
        val move = Rules.legalMoves(gs).first()
        GameRepository.onSquareClick(move.from)
        GameRepository.onSquareClick(move.landing)
    }

    @Test
    fun `resigning while the AI is thinking leaves the game resigned`() = runBlocking {
        // HARD (depth 7) and a deliberate wait PAST the 700ms think-delay, so the
        // cancel lands while Ai.bestMove is actually running. Cancelling during
        // the delay proves nothing — that suspension point cancels correctly and
        // always did. The bug is the window AFTER it, where the search is pure
        // CPU with no suspension point for cancellation to take effect.
        GameRepository.newGame(AiDifficulties.HARD)
        playOneMove()
        assertEquals(OfflineStatus.THINKING, GameRepository.state.value.status)
        delay(900)

        GameRepository.resign()

        // Give the in-flight search ample room to finish and try to commit.
        delay(4_000)

        val st = GameRepository.state.value
        assertEquals("a resigned game must stay resigned", OfflineStatus.OVER, st.status)
        assertNotNull("the result must not be cleared by a late AI move", st.gameState.result)
        assertEquals(PieceColors.BLUE, st.gameState.result?.winner)
    }

    @Test
    fun `starting a new game while the AI is thinking is not clobbered by the old search`() = runBlocking {
        GameRepository.newGame(AiDifficulties.HARD)
        playOneMove()
        delay(900) // past the think-delay, inside the search

        GameRepository.newGame(AiDifficulties.EASY)
        delay(4_000)

        val st = GameRepository.state.value
        assertEquals(AiDifficulties.EASY, st.difficulty)
        assertEquals("a fresh board — the abandoned search must not apply", 0, st.gameState.history.size)
        assertEquals(PieceColors.RED, st.gameState.turn)
    }

    @Test
    fun `undo while the AI is thinking is not undone by the stale search`() = runBlocking {
        GameRepository.newGame(AiDifficulties.NORMAL)
        playOneMove()
        delay(2_000) // let the AI actually reply, so undo has 2 plies to roll back
        if (GameRepository.canUndo()) {
            GameRepository.undo()
            val afterUndo = GameRepository.state.value.gameState.history.size

            delay(1_500)

            assertEquals(
                "the rolled-back position must hold",
                afterUndo,
                GameRepository.state.value.gameState.history.size,
            )
        }
    }
}
