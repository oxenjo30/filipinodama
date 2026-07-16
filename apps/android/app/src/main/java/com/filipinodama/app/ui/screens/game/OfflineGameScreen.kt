package com.filipinodama.app.ui.screens.game

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.engine.AiDifficulties
import com.filipinodama.app.data.engine.PieceColors
import com.filipinodama.app.data.engine.RankTiers
import com.filipinodama.app.data.match.GameRepository
import com.filipinodama.app.data.match.OfflineStatus
import com.filipinodama.app.ui.screens.profile.AvatarView
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Green
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel

/**
 * Offline "Play vs AI" board — a Kotlin mirror of apps/web/src/features/play/
 * GamePage.tsx's vs-AI mode: fully local (no socket), human is always RED,
 * AI is always BLUE, result card shows Moves/Captures stat tiles only (NO
 * trophy/gold — confirmed during Phase 3 research that web's AI mode grants
 * zero rewards). Buttons: Rematch / Change Difficulty / Home, matching
 * GamePage.tsx's vs-AI branch exactly.
 */
@Composable
fun OfflineGameScreen(difficulty: String, onChangeDifficulty: () -> Unit, onHome: () -> Unit) {
    val ui by GameRepository.state.collectAsState()
    val me = AuthRepository.state.collectAsState().value.user
    var showResignConfirm by remember { mutableStateOf(false) }

    DisposableEffect(difficulty) {
        GameRepository.newGame(difficulty)
        onDispose { }
    }

    val gs = ui.gameState
    val myTurn = gs.result == null && gs.turn == PieceColors.RED && ui.status == OfflineStatus.PLAYING

    // Board sound effects (move / capture / king / win / lose), diffed from the
    // live state — the human plays RED in offline practice.
    com.filipinodama.app.data.audio.GameSounds(state = gs, myColor = PieceColors.RED)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("✦ OFFLINE PRACTICE ✦", color = Gold, style = MaterialTheme.typography.labelMedium)
        Text(
            "Play vs AI",
            color = GoldLt,
            style = MaterialTheme.typography.headlineSmall,
            modifier = Modifier.padding(top = 4.dp, bottom = 10.dp)
        )

        // Opponent card (the AI, plays BLUE) — mirrors the mockup's board-screen
        // opponent bar. No trophies/timer: the AI has no rank or clock.
        OfflinePlayerBar(
            name = "AI Opponent",
            subLine = "${difficultyLabel(difficulty)} difficulty",
            avatarUrl = null,
            frameId = null,
            blueTint = true,
            modifier = Modifier.padding(top = 8.dp)
        )

        AiTurnBanner(status = ui.status, myTurn = myTurn, mustCapture = ui.mustCapture)

        BoardView(
            state = gs,
            selected = ui.selected,
            moveTargets = ui.moveTargets,
            captureTargets = ui.captureTargets,
            mustCapture = ui.mustCapture && myTurn,
            onSquareClick = { GameRepository.onSquareClick(it) },
            flip = false,
            interactive = myTurn,
            modifier = Modifier.padding(top = 10.dp)
        )

        // Self card (you, play RED) — shows your name + rank, or "Guest" for an
        // anonymous user (owner directive: anonymous shows "Guest", not blank).
        OfflinePlayerBar(
            name = if (me == null || me.isGuest) "Guest" else me.displayName,
            subLine = if (me == null || me.isGuest) "Practice offline" else "${RankTiers.forTrophies(me.trophies).label} · ${me.trophies} 🏆",
            avatarUrl = me?.avatarUrl,
            frameId = me?.frameId,
            blueTint = false,
            modifier = Modifier.padding(top = 12.dp)
        )

        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            GameButton(
                text = "↺ Undo",
                onClick = { GameRepository.undo() },
                variant = GameButtonVariant.PURPLE,
                enabled = GameRepository.canUndo(),
                modifier = Modifier.weight(1f)
            )
            GameButton(
                text = "⚑ Resign",
                onClick = { showResignConfirm = true },
                variant = GameButtonVariant.RED,
                enabled = gs.result == null,
                modifier = Modifier.weight(1f)
            )
        }
    }

    if (showResignConfirm) {
        com.filipinodama.app.ui.components.ResignConfirmDialog(
            subtitle = "The AI will be awarded the win.",
            onCancel = { showResignConfirm = false },
            onResign = { showResignConfirm = false; GameRepository.resign() }
        )
    }

    if (ui.status == OfflineStatus.OVER && gs.result != null) {
        OfflineEndCard(
            onRematch = { GameRepository.rematch() },
            onChangeDifficulty = onChangeDifficulty,
            onHome = onHome
        )
    }
}

/** "Easy"/"Normal"/"Hard" for a difficulty key. */
private fun difficultyLabel(difficulty: String): String = when (difficulty) {
    AiDifficulties.EASY -> "Easy"
    AiDifficulties.HARD -> "Hard"
    else -> "Normal"
}

/**
 * Board-screen player card (mockup Mobile.dc.html isBoard bars): avatar+frame,
 * Cinzel name, sub-line. Blue seat (the AI) = blue-tinted; red seat (you) = the
 * crimson gradient. No capture counter/timer here — the offline vs-AI mode has
 * no clock and captures aren't surfaced per-seat in this local mode.
 */
@Composable
private fun OfflinePlayerBar(
    name: String,
    subLine: String,
    avatarUrl: String?,
    frameId: String?,
    blueTint: Boolean,
    modifier: Modifier = Modifier
) {
    val bg = if (blueTint) Brush.linearGradient(listOf(Color(0x332E6BC6), Color(0x8C1B1030)))
    else Brush.linearGradient(listOf(Color(0x38D93B52), Color(0x8C1B1030)))
    val borderColor = if (blueTint) Color(0x4D5A96FF) else Color(0x73D93B52)
    val nameColor = if (blueTint) Color(0xFFDBE6FF) else Color(0xFFFFD9D9)
    val subColor = if (blueTint) Color(0xFF8FB3FF) else Color(0xFFF0A0A0)
    val seatColor = if (blueTint) Color(0xFF5A96FF) else Color(0xFFD93B52)

    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(bg, RoundedCornerShape(15.dp))
            .border(1.dp, borderColor, RoundedCornerShape(15.dp))
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        AvatarView(avatarUrl = avatarUrl, size = 38.dp, frameId = frameId, ring = false)
        Column(modifier = Modifier.weight(1f)) {
            Text(name, color = nameColor, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.ExtraBold))
            Text(subLine, color = subColor, style = MaterialTheme.typography.labelSmall)
        }
        Box(modifier = Modifier.size(14.dp).background(seatColor, CircleShape))
    }
}

@Composable
private fun AiTurnBanner(status: OfflineStatus, myTurn: Boolean, mustCapture: Boolean) {
    val text = when {
        status == OfflineStatus.THINKING -> "AI is thinking…"
        myTurn && mustCapture -> "⚠ You must capture"
        myTurn -> "● Your move"
        else -> "AI's move…"
    }
    Box(
        modifier = Modifier
            .background(if (myTurn) Green.copy(alpha = 0.18f) else Panel.copy(alpha = 0.7f), RoundedCornerShape(100.dp))
            .padding(horizontal = 18.dp, vertical = 9.dp)
    ) {
        Text(text, color = if (myTurn) Color(0xFF8CE0AD) else Ink, style = MaterialTheme.typography.titleSmall)
    }
}

@Composable
private fun OfflineEndCard(onRematch: () -> Unit, onChangeDifficulty: () -> Unit, onHome: () -> Unit) {
    val ui by GameRepository.state.collectAsState()
    val result = ui.gameState.result ?: return
    val won = result.winner == PieceColors.RED
    val draw = result.winner == "draw"
    val title = if (draw) "Draw" else if (won) "Victory" else "Defeat"
    val (redCaps, blueCaps) = ui.capturedCounts()

    Box(
        modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.72f)),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier.padding(24.dp).background(Panel, RoundedCornerShape(18.dp)).padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("Match Complete", color = Gold, style = MaterialTheme.typography.labelLarge)
            Text(title, color = GoldLt, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 6.dp, bottom = 14.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                StatTile(ui.gameState.history.size.toString(), "Moves")
                StatTile(redCaps.toString(), "You took")
                StatTile(blueCaps.toString(), "AI took")
            }

            Column(modifier = Modifier.padding(top = 20.dp).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                GameButton("↻ Rematch", onRematch, variant = GameButtonVariant.GOLD)
                GameButton("Change Difficulty", onChangeDifficulty, variant = GameButtonVariant.PURPLE)
                GameButton("Home", onHome, variant = GameButtonVariant.PURPLE)
            }
        }
    }
}

@Composable
private fun StatTile(value: String, label: String) {
    Column(
        modifier = Modifier
            .background(Color.Black.copy(alpha = 0.25f), RoundedCornerShape(10.dp))
            .padding(horizontal = 14.dp, vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(value, color = GoldLt, style = MaterialTheme.typography.titleMedium)
        Text(label, color = Ink2, style = MaterialTheme.typography.labelSmall, textAlign = TextAlign.Center)
    }
}
