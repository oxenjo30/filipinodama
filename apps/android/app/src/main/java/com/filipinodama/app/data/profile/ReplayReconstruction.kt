package com.filipinodama.app.data.profile

import com.filipinodama.app.data.engine.DEFAULT_SETTINGS
import com.filipinodama.app.data.engine.GameSettings
import com.filipinodama.app.data.engine.GameState
import com.filipinodama.app.data.engine.Move
import com.filipinodama.app.data.engine.Rules

/**
 * Board-per-ply replay reconstruction — a direct Kotlin port of
 * apps/web/src/features/profile/ReplayModal.tsx's reconstruction step:
 *
 *   const snapshots = [createInitialState(settings)];
 *   for (const mv of moves) snapshots.push(applyMove(snapshots.last, mv));
 *
 * i.e. states[0] is the initial position, states[i] is the position AFTER i
 * moves have been applied (one snapshot per ply). A malformed/illegal stored
 * move stops reconstruction early — the same try/catch behavior ReplayModal
 * uses ("replay what is valid") rather than crashing the whole viewer.
 */
object ReplayReconstruction {

    fun reconstruct(settings: GameSettings?, moves: List<Move>): List<GameState> {
        val effectiveSettings = settings ?: DEFAULT_SETTINGS
        val snapshots = mutableListOf(Rules.initialState(effectiveSettings))
        for (mv in moves) {
            val prev = snapshots.last()
            val next = try {
                Rules.applyMove(prev, mv)
            } catch (e: IllegalArgumentException) {
                break
            }
            snapshots.add(next)
        }
        return snapshots
    }
}
