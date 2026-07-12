package com.filipinodama.app.ui.screens.game

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.filipinodama.app.data.engine.PieceColors
import com.filipinodama.app.data.match.GameRepository
import com.filipinodama.app.data.match.OfflineStatus
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
    var showResignConfirm by remember { mutableStateOf(false) }

    DisposableEffect(difficulty) {
        GameRepository.newGame(difficulty)
        onDispose { }
    }

    val gs = ui.gameState
    val myTurn = gs.result == null && gs.turn == PieceColors.RED && ui.status == OfflineStatus.PLAYING

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

        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
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
        AlertDialog(
            onDismissRequest = { showResignConfirm = false },
            title = { Text("Resign this match?") },
            text = { Text("The AI will be awarded the win.") },
            confirmButton = {
                TextButton(onClick = { showResignConfirm = false; GameRepository.resign() }) {
                    Text("Resign", color = Color(0xFFFF8FAE))
                }
            },
            dismissButton = {
                TextButton(onClick = { showResignConfirm = false }) { Text("Cancel", color = Ink) }
            }
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
