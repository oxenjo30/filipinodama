package com.filipinodama.app.ui.screens.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.engine.GameState
import com.filipinodama.app.data.profile.MatchDetailDto
import com.filipinodama.app.data.profile.ProfileRepository
import com.filipinodama.app.data.profile.ProfileResult
import com.filipinodama.app.data.profile.ReplayReconstruction
import com.filipinodama.app.ui.screens.game.BoardView
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Green
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Red
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive

/**
 * ReplayViewerScreen — mobile-screen-inventory.md OVERLAY "Replay Viewer"
 * (lines 481-486), a full-screen board playback ported from
 * apps/web/src/features/profile/ReplayModal.tsx:
 *   1. GET /api/matches/:id -> { settings, moves[] }.
 *   2. Reconstruct every position with the Kotlin engine port
 *      (Rules.initialState + Rules.applyMove per ply — see
 *      ReplayReconstruction.kt), exactly mirroring the web modal's
 *      createInitialState()/applyMove() loop.
 *   3. Read-only BoardView per ply + transport controls: step back/forward,
 *      play/pause (900ms/ply, matching ReplayModal's interval), move counter.
 *
 * Rows built (per inventory): back chevron, title + result badge, board,
 * move counter, ◀ / play-pause / ▶ transport. Speed toggle (1x/2x) and flip
 * are ported too since ReplayModal.tsx ships them as part of the same control
 * bar this screen is 1:1 replicating.
 *
 * Entry points: match history rows (own profile) + public-profile recent
 * matches list — both pass a real, persisted matchId.
 */
@Composable
fun ReplayViewerScreen(matchId: String, onBack: () -> Unit) {
    val meId = AuthRepository.state.value.user?.id ?: ""

    var match by remember { mutableStateOf<MatchDetailDto?>(null) }
    var states by remember { mutableStateOf<List<GameState>?>(null) }
    var loadError by remember { mutableStateOf<String?>(null) }

    var ply by remember { mutableStateOf(0) }
    var playing by remember { mutableStateOf(false) }
    var speed by remember { mutableStateOf(1) }

    LaunchedEffect(matchId) {
        match = null
        states = null
        loadError = null
        ply = 0
        playing = false
        speed = 1
        when (val result = ProfileRepository.matchDetail(matchId)) {
            is ProfileResult.Success -> {
                val m = result.data.match
                match = m
                states = ReplayReconstruction.reconstruct(m.settings, m.moves)
            }
            is ProfileResult.Failure -> loadError = result.message
        }
    }

    val maxPly = (states?.size ?: 1) - 1

    // Auto-advance — mirrors ReplayModal's setInterval(900 / speed).
    LaunchedEffect(playing, speed, states) {
        if (!playing || states == null) return@LaunchedEffect
        while (isActive && playing) {
            delay((900 / speed).toLong())
            if (ply >= maxPly) {
                playing = false
            } else {
                ply += 1
            }
        }
    }

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                "‹",
                color = GoldLt,
                style = MaterialTheme.typography.headlineSmall,
                modifier = Modifier.clickable(onClick = onBack)
            )
            Text("Match Replay", color = Gold, style = MaterialTheme.typography.labelMedium)
        }

        val m = match
        val st = states
        when {
            loadError != null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(loadError ?: "Could not load this replay.", color = Ink2, style = MaterialTheme.typography.bodyMedium)
            }
            m == null || st == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Gold)
            }
            else -> {
                val header = replayHeader(m, meId)
                Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        "${header.resultLabel} · vs ${header.oppName}",
                        color = header.resultColor,
                        style = MaterialTheme.typography.headlineSmall
                    )
                    Text(
                        "${modeLabel(m.mode)} · Score ${header.redCap}–${header.blueCap}",
                        color = Ink2,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = 4.dp, bottom = 18.dp)
                    )

                    val boardState = st[ply.coerceIn(0, maxPly)]
                    BoardView(
                        state = boardState,
                        selected = null,
                        moveTargets = emptyList(),
                        captureTargets = emptyList(),
                        mustCapture = false,
                        onSquareClick = {},
                        interactive = false
                    )

                    Text(
                        "Move $ply / $maxPly",
                        color = GoldLt,
                        style = MaterialTheme.typography.labelLarge,
                        modifier = Modifier.padding(top = 12.dp)
                    )

                    Row(
                        modifier = Modifier.padding(top = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        TransportButton("⏮") { playing = false; ply = 0 }
                        TransportButton("◀") { playing = false; ply = (ply - 1).coerceAtLeast(0) }
                        TransportButton(if (playing) "⏸" else "▶", primary = true) {
                            if (playing) {
                                playing = false
                            } else {
                                if (ply >= maxPly) ply = 0
                                playing = true
                            }
                        }
                        TransportButton("▶") { playing = false; ply = (ply + 1).coerceAtMost(maxPly) }
                        TransportButton("⏭") { playing = false; ply = maxPly }
                        TransportButton("${speed}×") { speed = if (speed == 1) 2 else 1 }
                    }
                }
            }
        }
    }
}

private data class ReplayHeader(
    val oppName: String,
    val resultLabel: String,
    val resultColor: androidx.compose.ui.graphics.Color,
    val redCap: Int,
    val blueCap: Int
)

/** Mirrors ReplayModal.tsx's `header` useMemo. */
private fun replayHeader(match: MatchDetailDto, meId: String): ReplayHeader {
    val iAmRed = match.red?.id == meId
    val opp = if (iAmRed) match.blue else match.red
    val oppName = opp?.displayName ?: if (match.mode == "AI" || match.mode == "LOCAL") "Computer" else "Opponent"
    val result = when {
        match.winner == "draw" || match.winner == null -> "draw"
        (match.winner == "red") == iAmRed -> "win"
        else -> "loss"
    }
    val resultLabel = when (result) {
        "win" -> "Victory"
        "loss" -> "Defeat"
        else -> "Draw"
    }
    val resultColor = when (result) {
        "win" -> Green
        "loss" -> Red
        else -> GoldLt
    }
    // Red captures even-indexed plies, blue odd-indexed — matches ReplayModal.tsx.
    var redCap = 0
    var blueCap = 0
    var mover = "red"
    for (mv in match.moves) {
        if (mover == "red") redCap += mv.captures.size else blueCap += mv.captures.size
        mover = if (mover == "red") "blue" else "red"
    }
    return ReplayHeader(oppName, resultLabel, resultColor, redCap, blueCap)
}

private fun modeLabel(mode: String): String = when (mode) {
    "AI" -> "vs AI"
    "CASUAL" -> "Casual"
    "RANKED" -> "Ranked"
    "PRIVATE" -> "Private"
    "LOCAL" -> "Local"
    else -> mode
}

@Composable
private fun TransportButton(label: String, primary: Boolean = false, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(if (primary) 52.dp else 42.dp)
            .clickable(onClick = onClick)
            .background(
                if (primary) Gold else androidx.compose.ui.graphics.Color(0xFF0F0820).copy(alpha = 0.6f),
                RoundedCornerShape(9.dp)
            ),
        contentAlignment = Alignment.Center
    ) {
        Text(label, color = if (primary) androidx.compose.ui.graphics.Color(0xFF1A0F2E) else GoldLt, style = MaterialTheme.typography.labelLarge)
    }
}
