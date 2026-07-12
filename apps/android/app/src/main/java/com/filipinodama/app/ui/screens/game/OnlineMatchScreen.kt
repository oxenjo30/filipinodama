package com.filipinodama.app.ui.screens.game

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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
    var chatOpen by remember { mutableStateOf(false) }
    var lastSeenChatCount by remember { mutableStateOf(0) }

    val gs = ui.gameState
    if (gs == null) {
        Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background), contentAlignment = Alignment.Center) {
            Text("Loading match…", color = Ink, style = MaterialTheme.typography.bodyLarge)
        }
        return
    }

    val myColor = ui.myColor
    val isSpectating = myColor == null
    val myTurn = gs.result == null && gs.turn == myColor && ui.status == MatchStatus.PLAYING
    val flip = myColor == PieceColors.BLUE

    // Unread badge: count messages that arrived since the panel was last opened.
    val unread = if (chatOpen) 0 else (ui.chat.size - lastSeenChatCount).coerceAtLeast(0)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = if (isSpectating) "Spectating" else if (mode == "RANKED") "Ranked Match" else "Quick Match",
            style = MaterialTheme.typography.titleMedium,
            color = Green
        )
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Live · Online", style = MaterialTheme.typography.bodySmall, color = Ink2)
            // Real live spectator count — spectator view only (mirrors
            // OnlineMatchPage.tsx: players keep the plain "Live · Online" line).
            if (isSpectating && ui.viewers != null) {
                Text(
                    text = "· 👁 ${ui.viewers}",
                    style = MaterialTheme.typography.bodySmall,
                    color = GoldLt
                )
            }
        }

        PlayerPanel(
            name = if (isSpectating) "Red" else ui.opponent?.displayName ?: "Opponent",
            sub = if (isSpectating) "Red player" else "Opponent",
            active = gs.result == null && gs.turn != myColor,
            modifier = Modifier.padding(top = 12.dp)
        )

        TurnBanner(
            text = when {
                isSpectating -> "${if (gs.turn == PieceColors.BLUE) "Blue" else "Red"} to move · Move ${gs.moveNumber}"
                myTurn -> if (ui.mustCapture) "⚠ You must capture" else "● Your move"
                else -> "Opponent's move…"
            },
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
            interactive = myTurn && !isSpectating
        )

        PlayerPanel(
            name = if (isSpectating) "Blue" else "You",
            sub = if (isSpectating) "Blue player" else "You · ${myColor ?: ""}",
            active = if (isSpectating) gs.result == null && gs.turn == PieceColors.BLUE else myTurn,
            modifier = Modifier.padding(top = 12.dp)
        )

        if (isSpectating) {
            Text(
                text = "🔒 Spectating — you can watch but not move pieces",
                style = MaterialTheme.typography.labelSmall,
                color = Ink2,
                modifier = Modifier.padding(top = 10.dp)
            )
            GameButton(
                text = "Leave Spectator View",
                onClick = {
                    MatchRepository.reset()
                    onExit()
                },
                variant = GameButtonVariant.PURPLE,
                modifier = Modifier.padding(top = 12.dp).fillMaxWidth()
            )
        } else {
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

            // Quick Chat — hidden entirely for spectators (myColor null), mirroring
            // apps/web/src/features/play/OnlineMatchPage.tsx: `{myColor !== null && (<MatchChat.../>)}`.
            Column(modifier = Modifier.fillMaxWidth().padding(top = 14.dp)) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable {
                            chatOpen = !chatOpen
                            if (chatOpen) lastSeenChatCount = ui.chat.size
                        },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("💬 Quick Chat", color = GoldLt, style = MaterialTheme.typography.labelLarge)
                        ChatUnreadBadge(unread)
                    }
                    Text(if (chatOpen) "▲" else "▼", color = Ink2, fontSize = 12.sp)
                }
                if (chatOpen) {
                    MatchChat(
                        messages = ui.chat.map { m ->
                            MatchChatUiMsg(id = m.id, mine = m.mine, emote = m.emote, body = m.body)
                        },
                        onSend = { emote, body ->
                            if (emote != null) MatchRepository.sendEmote(emote) else if (body != null) MatchRepository.sendChat(body)
                        },
                        modifier = Modifier.padding(top = 10.dp)
                    )
                }
            }
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
    val isSpectating = ui.myColor == null
    val won = ui.myColor != null && end.result.winner == ui.myColor
    val draw = end.result.winner == "draw"

    // Spectators get a neutral "who won" summary (mirrors the mockup's
    // Spectate end-card + OnlineMatchPage.tsx) — no rematch/rating framing,
    // since none of that applies to a viewer.
    if (isSpectating) {
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
                Text("Match Complete", color = Gold, style = MaterialTheme.typography.labelLarge)
                Text(
                    text = if (end.interrupted) "Match Interrupted"
                    else if (draw) "Draw"
                    else "${if (end.result.winner == PieceColors.RED) "Red" else "Blue"} takes the victory!",
                    color = GoldLt,
                    style = MaterialTheme.typography.headlineSmall,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 6.dp, bottom = 16.dp)
                )
                Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    ResultStat(value = ui.gameState?.history?.size ?: 0, label = "Moves")
                }
                Column(modifier = Modifier.padding(top = 20.dp).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                    GameButton("↻ Watch Another", onFindNewMatch, variant = GameButtonVariant.RED)
                    GameButton("Home", onHome, variant = GameButtonVariant.PURPLE)
                }
            }
        }
        return
    }

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
