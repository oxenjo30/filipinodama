package com.filipinodama.app.data.audio

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import com.filipinodama.app.data.engine.GameState
import com.filipinodama.app.data.engine.PieceColor

/**
 * GameSounds — the Android port of apps/web/src/lib/useGameSounds.ts. Plays one
 * board sound per state transition by DIFFING the previous [GameState] against
 * the current one, so callers don't have to thread sound calls through every
 * move handler. Works for vs-AI, local, online and spectated matches.
 *
 * Priority per transition (only ONE sound per change): game end > king
 * promotion > capture > move. [myColor] (optional) picks win vs lose on end; a
 * spectator (null) always hears the neutral "win" flourish; a draw is "draw".
 *
 * All playback is gated inside [SoundManager] by the Sound-effects setting.
 */
@Composable
fun GameSounds(state: GameState?, myColor: PieceColor?) {
    // Hold the previous state across recompositions to diff against.
    val prev = remember { arrayOfNulls<GameState>(1) }

    LaunchedEffect(state) {
        val before = prev[0]
        prev[0] = state
        if (state == null) return@LaunchedEffect

        // First state we ever see (match load / resync) — baseline, no sound.
        if (before == null) return@LaunchedEffect

        val grew = state.history.size > before.history.size
        val endedNow = state.result != null && before.result == null
        if (!grew && !endedNow) return@LaunchedEffect

        // ── End of match ── (highest priority)
        if (endedNow && state.result != null) {
            when {
                state.result.winner == "draw" -> SoundManager.playSfx(SoundManager.Sfx.DRAW)
                myColor != null && state.result.winner == myColor -> SoundManager.playSfx(SoundManager.Sfx.WIN)
                myColor != null -> SoundManager.playSfx(SoundManager.Sfx.LOSE)
                else -> SoundManager.playSfx(SoundManager.Sfx.WIN) // spectator: neutral flourish
            }
            return@LaunchedEffect
        }

        if (!grew) return@LaunchedEffect

        // ── King promotion ── a new king appeared vs the previous position.
        val kingsBefore = before.pieces.count { it.king }
        val kingsNow = state.pieces.count { it.king }
        if (kingsNow > kingsBefore) {
            SoundManager.playSfx(SoundManager.Sfx.KING)
            return@LaunchedEffect
        }

        // ── Capture ── fewer pieces than before.
        if (state.pieces.size < before.pieces.size) {
            SoundManager.playSfx(SoundManager.Sfx.CAPTURE)
            return@LaunchedEffect
        }

        // ── Plain move ──
        SoundManager.playSfx(SoundManager.Sfx.MOVE)
    }
}
