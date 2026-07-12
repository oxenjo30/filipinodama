package com.filipinodama.app.data.match

import com.filipinodama.app.data.engine.AiDifficulties
import com.filipinodama.app.data.engine.PieceColors
import com.filipinodama.app.data.engine.Square
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.delay
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * State-transition tests for [GameRepository] — the offline "Play vs AI"
 * mode. Confirms: fresh game state (12+12, red to move), human=red-only
 * interaction guard, a full human-move -> AI-reply cycle actually completes
 * (the AI is not stubbed — this exercises the real [com.filipinodama.app.data.engine.Ai] port),
 * resign awards the AI the win, and reset/newGame restore a clean board.
 */
class GameRepositoryTest {

    @Test
    fun `newGame starts with the standard opening, red to move, playing status`() {
        GameRepository.newGame(AiDifficulties.EASY)
        val st = GameRepository.state.value
        assertEquals(24, st.gameState.pieces.size)
        assertEquals(PieceColors.RED, st.gameState.turn)
        assertEquals(OfflineStatus.PLAYING, st.status)
        assertNull(st.gameState.result)
    }

    @Test
    fun `tapping an opponent-side square never selects anything`() {
        GameRepository.newGame(AiDifficulties.EASY)
        // (2,3) is a blue piece's starting square — human is red-only.
        GameRepository.onSquareClick(Square(2, 3))
        assertNull(GameRepository.state.value.selected)
    }

    @Test
    fun `selecting a red piece populates moveTargets`() {
        GameRepository.newGame(AiDifficulties.EASY)
        GameRepository.onSquareClick(Square(5, 2)) // a red man's starting square with legal forward moves
        val st = GameRepository.state.value
        assertEquals(Square(5, 2), st.selected)
        assertTrue(st.moveTargets.isNotEmpty())
    }

    // NOTE: GameRepository schedules the AI reply on a REAL background
    // dispatcher (kotlinx.coroutines.Dispatchers.Default) with a genuine
    // 700ms delay, mirroring gameStore.ts's AI_THINK_MS — so these two tests
    // use runBlocking + real delay() (wall-clock time) rather than
    // kotlinx-coroutines-test's runTest, whose virtual-time scheduler would
    // fast-forward the polling delay() without the real background job ever
    // having run, causing a false "still THINKING" read.
    @Test
    fun `a legal human move transitions status to THINKING then back to PLAYING after the AI replies`() = runBlocking {
        GameRepository.newGame(AiDifficulties.EASY)
        GameRepository.onSquareClick(Square(5, 2))
        val target = GameRepository.state.value.moveTargets.first()
        GameRepository.onSquareClick(target)

        // Immediately after the human's move, the AI's reply is scheduled
        // (THINKING) rather than applied synchronously.
        assertEquals(OfflineStatus.THINKING, GameRepository.state.value.status)
        assertEquals(1, GameRepository.state.value.gameState.history.size)

        // Give the real coroutine (700ms delay + negamax search) time to land —
        // this exercises the actual Ai.bestMove port, not a mock.
        var waited = 0L
        while (GameRepository.state.value.status == OfflineStatus.THINKING && waited < 5000) {
            delay(50)
            waited += 50
        }

        val after = GameRepository.state.value
        assertEquals(OfflineStatus.PLAYING, after.status)
        assertEquals(2, after.gameState.history.size) // human ply + AI ply
        assertEquals(PieceColors.RED, after.gameState.turn) // control back to human
    }

    @Test
    fun `resign awards the AI (blue) the win with reason resign`() {
        GameRepository.newGame(AiDifficulties.EASY)
        GameRepository.resign()
        val st = GameRepository.state.value
        assertEquals(OfflineStatus.OVER, st.status)
        assertEquals(PieceColors.BLUE, st.gameState.result?.winner)
        assertEquals("resign", st.gameState.result?.reason)
    }

    @Test
    fun `canUndo is false on a fresh game and true after a full human+AI exchange`() = runBlocking {
        GameRepository.newGame(AiDifficulties.EASY)
        assertFalse(GameRepository.canUndo())

        GameRepository.onSquareClick(Square(5, 2))
        val target = GameRepository.state.value.moveTargets.first()
        GameRepository.onSquareClick(target)

        var waited = 0L
        while (GameRepository.state.value.status == OfflineStatus.THINKING && waited < 5000) {
            delay(50)
            waited += 50
        }

        assertTrue(GameRepository.canUndo())
        GameRepository.undo()
        assertEquals(0, GameRepository.state.value.gameState.history.size)
        assertEquals(PieceColors.RED, GameRepository.state.value.gameState.turn)
    }

    @Test
    fun `rematch resets to a fresh board at the same difficulty`() {
        GameRepository.newGame(AiDifficulties.HARD)
        GameRepository.resign()
        assertEquals(OfflineStatus.OVER, GameRepository.state.value.status)

        GameRepository.rematch()
        val st = GameRepository.state.value
        assertEquals(OfflineStatus.PLAYING, st.status)
        assertNull(st.gameState.result)
        assertEquals(AiDifficulties.HARD, st.difficulty)
        assertEquals(24, st.gameState.pieces.size)
    }
}
