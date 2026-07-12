package com.filipinodama.app.ui.screens.game

import androidx.compose.foundation.background
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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.filipinodama.app.data.engine.MatchEndReasons
import com.filipinodama.app.data.engine.PieceColors
import com.filipinodama.app.data.match.MatchRepository
import com.filipinodama.app.data.match.MatchStatus
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Green
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel

/**
 * The live ONLINE match screen — server-authoritative, mirrors
 * apps/web/src/features/play/OnlineMatchPage.tsx's board portion (matchmaking
 * screen is a separate composable, [MatchmakingScreen]; this screen only
 * renders once status is playing/ended). The board itself never applies a
 * move locally: every tap calls [MatchRepository.onSquareClick], which only
 * ever emits an intent — the board re-renders when the server's matchMoved/
 * matchState arrives via the StateFlow.
 */
@Composable
fun OnlineMatchScreen(mode: String, onExit: () -> Unit) {
    val ui by MatchRepository.state.collectAsState()
    var showResignConfirm by remember { mutableStateOf(false) }

    val gs = ui.gameState
    if (gs == null) {
        Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background), contentAlignment = Alignment.Center) {
            Text("Loading match…", color = Ink, style = MaterialTheme.typography.bodyLarge)
        }
        return
    }

    val myColor = ui.myColor
    val myTurn = gs.result == null && gs.turn == myColor && ui.status == MatchStatus.PLAYING
    val flip = myColor == PieceColors.BLUE

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = if (mode == "RANKED") "Ranked Match" else "Quick Match",
            style = MaterialTheme.typography.titleMedium,
            color = Green
        )
        Text("Live · Online", style = MaterialTheme.typography.bodySmall, color = Ink2)

        PlayerPanel(
            name = ui.opponent?.displayName ?: "Opponent",
            sub = "Opponent",
            active = gs.result == null && gs.turn != myColor,
            modifier = Modifier.padding(top = 12.dp)
        )

        TurnBanner(
            text = if (myTurn) (if (ui.mustCapture) "⚠ You must capture" else "● Your move") else "Opponent's move…",
            highlight = myTurn,
            modifier = Modifier.padding(vertical = 10.dp)
        )

        if (ui.connectionLost && ui.status == MatchStatus.PLAYING && gs.result == null) {
            ConnectionLostBanner(modifier = Modifier.padding(bottom = 10.dp))
        }

        BoardView(
            state = gs,
            selected = ui.selected,
            moveTargets = ui.moveTargets,
            captureTargets = ui.captureTargets,
            mustCapture = ui.mustCapture && myTurn,
            onSquareClick = { MatchRepository.onSquareClick(it) },
            flip = flip,
            interactive = myTurn
        )

        PlayerPanel(
            name = "You",
            sub = "You · ${myColor ?: ""}",
            active = myTurn,
            modifier = Modifier.padding(top = 12.dp)
        )

        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            GameButton(
                text = "🏳 Resign",
                onClick = { showResignConfirm = true },
                variant = GameButtonVariant.RED,
                enabled = gs.result == null,
                modifier = Modifier.weight(1f)
            )
            GameButton(
                text = "← Leave",
                onClick = {
                    MatchRepository.leaveQueue()
                    MatchRepository.reset()
                    onExit()
                },
                variant = GameButtonVariant.PURPLE,
                modifier = Modifier.weight(1f)
            )
        }
    }

    if (showResignConfirm) {
        AlertDialog(
            onDismissRequest = { showResignConfirm = false },
            title = { Text("Resign this match?") },
            text = { Text("Your opponent will be awarded the win. This can't be undone.") },
            confirmButton = {
                androidx.compose.material3.TextButton(onClick = {
                    showResignConfirm = false
                    MatchRepository.resign()
                }) {
                    Text("Resign", color = androidx.compose.ui.graphics.Color(0xFFFF8FAE))
                }
            },
            dismissButton = {
                androidx.compose.material3.TextButton(onClick = { showResignConfirm = false }) {
                    Text("Cancel", color = Ink)
                }
            }
        )
    }

    if (ui.end != null) {
        MatchEndCard(
            mode = mode,
            onRematch = { MatchRepository.offerRematch() },
            onAcceptRematch = { MatchRepository.acceptRematch() },
            onDeclineRematch = { MatchRepository.declineRematch() },
            onFindNewMatch = {
                MatchRepository.reset()
                MatchRepository.joinQueue(mode)
            },
            onHome = {
                MatchRepository.reset()
                onExit()
            }
        )
    }
}

@Composable
private fun PlayerPanel(name: String, sub: String, active: Boolean, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(Panel, RoundedCornerShape(12.dp))
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Column {
            Text(name, color = androidx.compose.ui.graphics.Color.White, style = MaterialTheme.typography.titleSmall)
            Text(sub, color = Ink2, style = MaterialTheme.typography.labelSmall)
        }
        if (active) {
            Box(
                modifier = Modifier
                    .size(9.dp)
                    .background(Green, CircleShape)
            )
        }
    }
}

@Composable
private fun TurnBanner(text: String, highlight: Boolean, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .background(
                if (highlight) Green.copy(alpha = 0.18f) else Panel.copy(alpha = 0.7f),
                RoundedCornerShape(100.dp)
            )
            .padding(horizontal = 18.dp, vertical = 9.dp)
    ) {
        Text(
            text = text,
            color = if (highlight) androidx.compose.ui.graphics.Color(0xFF8CE0AD) else Ink,
            style = MaterialTheme.typography.titleSmall
        )
    }
}

@Composable
private fun ConnectionLostBanner(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .background(Panel.copy(alpha = 0.9f), RoundedCornerShape(100.dp))
            .padding(horizontal = 16.dp, vertical = 8.dp)
    ) {
        Text(
            text = "Connection lost — reconnecting…",
            color = GoldLt,
            style = MaterialTheme.typography.labelLarge
        )
    }
}

@Composable
private fun MatchEndCard(
    mode: String,
    onRematch: () -> Unit,
    onAcceptRematch: () -> Unit,
    onDeclineRematch: () -> Unit,
    onFindNewMatch: () -> Unit,
    onHome: () -> Unit
) {
    val ui by MatchRepository.state.collectAsState()
    val end = ui.end ?: return
    val won = ui.myColor != null && end.result.winner == ui.myColor
    val draw = end.result.winner == "draw"

    val title = when {
        end.interrupted -> "Connection Lost"
        draw -> "Draw"
        won -> "Victory"
        else -> "Defeat"
    }
    val body = when {
        end.interrupted -> "The match dropped and couldn't be recovered — no rating was affected. Start a new one below."
        end.result.reason == MatchEndReasons.RESIGN -> if (won) "Your opponent resigned." else "You resigned."
        end.result.reason == MatchEndReasons.CAPTURE_ALL -> if (won) "You captured every enemy piece." else "The enemy captured all your pieces."
        draw -> "A hard-fought draw."
        won -> "Well played."
        else -> "Better luck next time."
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.72f)),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .padding(24.dp)
                .background(Panel, RoundedCornerShape(18.dp))
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = if (end.interrupted) "Match Interrupted" else "Match Complete",
                color = Gold,
                style = MaterialTheme.typography.labelLarge
            )
            Text(
                text = title,
                color = GoldLt,
                style = MaterialTheme.typography.headlineSmall,
                modifier = Modifier.padding(top = 6.dp, bottom = 4.dp)
            )
            Text(text = body, color = Ink, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center)

            if (!end.interrupted && mode == "RANKED") {
                val delta = if (ui.myColor == PieceColors.RED) end.redTrophyDelta else end.blueTrophyDelta
                Row(modifier = Modifier.padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Text(
                        text = "🏆 ${if (delta >= 0) "+" else ""}$delta",
                        color = if (delta >= 0) androidx.compose.ui.graphics.Color(0xFF3FBF6F) else androidx.compose.ui.graphics.Color(0xFFFF8FAE),
                        style = MaterialTheme.typography.titleSmall
                    )
                    if (won && end.goldReward > 0) {
                        Text(
                            text = "🪙 +${end.goldReward}",
                            color = androidx.compose.ui.graphics.Color(0xFFF2D493),
                            style = MaterialTheme.typography.titleSmall
                        )
                    }
                }
            }

            Column(modifier = Modifier.padding(top = 20.dp).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                when {
                    ui.offeredByOpponent && !ui.offeredByMe -> {
                        Text(
                            "${ui.opponent?.displayName ?: "Your opponent"} wants a rematch!",
                            color = GoldLt,
                            style = MaterialTheme.typography.labelLarge
                        )
                        GameButton("✔ Accept Rematch", onAcceptRematch, variant = GameButtonVariant.GOLD)
                        GameButton("Decline", onDeclineRematch, variant = GameButtonVariant.PURPLE)
                    }
                    ui.offeredByMe -> {
                        Text("Waiting for opponent…", color = Ink, style = MaterialTheme.typography.labelLarge)
                        GameButton("Cancel", onDeclineRematch, variant = GameButtonVariant.PURPLE)
                    }
                    else -> {
                        if (ui.rematchDeclined) {
                            Text(
                                "Opponent declined the rematch.",
                                color = androidx.compose.ui.graphics.Color(0xFFFF8FAE),
                                style = MaterialTheme.typography.labelLarge
                            )
                        }
                        GameButton("↻ Request Rematch", onRematch, variant = GameButtonVariant.GOLD)
                        GameButton("Find New Match", onFindNewMatch, variant = GameButtonVariant.PURPLE)
                    }
                }
                GameButton("Home", onHome, variant = GameButtonVariant.PURPLE)
            }
        }
    }
}
