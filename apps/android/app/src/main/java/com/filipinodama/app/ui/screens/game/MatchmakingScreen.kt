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
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import com.filipinodama.app.data.match.MatchRepository
import com.filipinodama.app.data.match.MatchStatus
import com.filipinodama.app.ui.components.CurrencyAmount
import com.filipinodama.app.ui.components.CurrencyIconKind
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel
import kotlinx.coroutines.delay

/**
 * Online matchmaking: searching state with an elapsed timer, then the
 * "Match Found!" reveal (opponent identity + device badge) for
 * [MatchRepository.MATCH_FOUND_REVEAL_MS] (~1.8s, matches web exactly)
 * before the store auto-requests matchResync and this screen hands off to
 * [OnlineMatchScreen] once state.status flips to PLAYING/ENDED.
 *
 * Mirrors apps/web/src/features/play/OnlineMatchPage.tsx's matchmaking
 * section (searching/found sub-states, device badge, cancel -> mm:leave).
 */
@Composable
fun MatchmakingScreen(mode: String, onCancel: () -> Unit, onEnteredMatch: () -> Unit) {
    val ui by MatchRepository.state.collectAsState()
    var elapsedSec by remember { mutableStateOf(0) }

    LaunchedEffect(ui.status) {
        if (ui.status == MatchStatus.SEARCHING) {
            elapsedSec = 0
            while (true) {
                delay(1000)
                elapsedSec++
            }
        }
    }

    LaunchedEffect(mode) {
        MatchRepository.joinQueue(mode)
    }

    LaunchedEffect(ui.status) {
        if (ui.status == MatchStatus.PLAYING || ui.status == MatchStatus.ENDED) onEnteredMatch()
    }

    val found = ui.status == MatchStatus.FOUND && ui.opponent != null
    val elapsedLabel = "%02d:%02d".format(elapsedSec / 60, elapsedSec % 60)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "✦ ONLINE MATCHMAKING ✦",
            color = Gold,
            style = MaterialTheme.typography.labelMedium
        )
        Text(
            text = if (found) "Match Found!" else "Finding Your Match",
            color = GoldLt,
            style = MaterialTheme.typography.headlineMedium,
            modifier = Modifier.padding(top = 8.dp, bottom = 4.dp)
        )
        Text(
            text = if (found) "Get ready — your rival awaits." else "Finding the next available opponent…",
            color = Ink,
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center
        )

        GameFrameCard(modifier = Modifier.padding(top = 24.dp).fillMaxWidth()) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.weight(1f)) {
                        Text("You", color = GoldLt, style = MaterialTheme.typography.titleSmall)
                    }
                    Box(
                        modifier = Modifier
                            .size(56.dp)
                            .background(Color(0xFF0F0820).copy(alpha = 0.7f), CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("VS", color = Gold, style = MaterialTheme.typography.titleMedium)
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.weight(1f)) {
                        if (found) {
                            Text(ui.opponent?.displayName ?: "Opponent", color = Color(0xFFFF8FAE), style = MaterialTheme.typography.titleSmall)
                            CurrencyAmount(
                                kind = CurrencyIconKind.TROPHY,
                                text = (ui.opponent?.trophies ?: 0).toString(),
                                color = Ink,
                                style = MaterialTheme.typography.labelSmall
                            )
                            val device = ui.opponent?.device ?: "web"
                            val (icon, label) = when (device) {
                                "mobile" -> "📱" to "Mobile"
                                "tablet" -> "▤" to "Tablet"
                                else -> "💻" to "Web"
                            }
                            Text(
                                "$icon Playing on $label",
                                color = Ink2,
                                style = MaterialTheme.typography.labelSmall,
                                modifier = Modifier.padding(top = 4.dp)
                            )
                        } else {
                            CircularProgressIndicator(modifier = Modifier.size(28.dp), color = Color(0xFFA83744), strokeWidth = 2.dp)
                            Text("Searching…", color = Ink2, style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 6.dp))
                        }
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 22.dp),
                    horizontalArrangement = Arrangement.SpaceEvenly
                ) {
                    StatCell(elapsedLabel, "Elapsed")
                    StatCell(if (mode == "RANKED") "Ranked" else "Classic", "Mode")
                }
            }
        }

        if (ui.error != null) {
            Text(
                text = ui.error ?: "",
                color = Color(0xFFFF8FAE),
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier.padding(top = 16.dp)
            )
        }

        if (!found) {
            GameButton(
                text = "Cancel Search",
                onClick = {
                    MatchRepository.leaveQueue()
                    MatchRepository.reset()
                    onCancel()
                },
                variant = GameButtonVariant.PURPLE,
                modifier = Modifier.padding(top = 22.dp)
            )
        }
    }
}

@Composable
private fun StatCell(value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, color = GoldLt, style = MaterialTheme.typography.titleMedium)
        Text(label, color = Ink2, style = MaterialTheme.typography.labelSmall)
    }
}
