package com.filipinodama.app.ui.screens.economy

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.filipinodama.app.R
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.economy.EconomyResult
import com.filipinodama.app.data.tournaments.TournamentDetailDto
import com.filipinodama.app.data.tournaments.TournamentMatchDto
import com.filipinodama.app.data.tournaments.TournamentsRepository
import com.filipinodama.app.ui.components.CurrencyIcon
import com.filipinodama.app.ui.components.CurrencyIconKind
import com.filipinodama.app.ui.components.MockupBackButton
import com.filipinodama.app.ui.components.screenInsets
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import kotlinx.coroutines.launch

/**
 * Tournament Detail — mobile-screen-inventory.md SCREEN 9 (`isTourDetail`,
 * `data-screen-label="Tournament"`), mockup lines 615-726 of mobile-split.txt.
 * Reached from [TournamentsListScreen]'s rows (finding PROG-1/PROG-2 — those
 * rows were previously dead).
 *
 * Wired to the real GET /api/tournaments/:id (apps/server/src/modules/
 * tournaments.ts:55-84) via [TournamentsRepository.detail] — entries, bracket
 * (grouped by round), and myEntry are all real, no fabricated data. Register/
 * Leave call the real join/leave routes and reload detail on success.
 *
 * Deviations from the mockup (both honest, not fabricated substitutes):
 *  - Match cards show ONLY player names (no aScore/bScore) — the Prisma
 *    TournamentMatch model (schema.prisma:698-737) has no score column at
 *    all (V1 reports only winnerEntryId via an admin action), so a per-side
 *    numeric score does not exist server-side to display.
 *  - "▶ WATCH FINAL REPLAY" only renders on the final-round match when that
 *    match's `matchId` is non-null (a real Match row was linked by the admin
 *    report) — omitted otherwise rather than always shown on "the final".
 */
@Composable
fun TournamentDetailScreen(
    tournamentId: String,
    onBack: () -> Unit = {},
    onRequireSignIn: () -> Unit = {},
    onWatchReplay: (String) -> Unit = {}
) {
    val scope = rememberCoroutineScope()
    var data by remember { mutableStateOf<TournamentDetailDto?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var actionMessage by remember { mutableStateOf<String?>(null) }

    suspend fun load() {
        when (val result = TournamentsRepository.detail(tournamentId)) {
            is EconomyResult.Success -> { data = result.data; error = null }
            is EconomyResult.Failure -> error = result.message
        }
    }

    LaunchedEffect(tournamentId) { load() }

    Column(modifier = Modifier.fillMaxSize().screenInsets().background(MaterialTheme.colorScheme.background).padding(horizontal = 16.dp, vertical = 20.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            MockupBackButton(onClick = onBack)
            Text(
                "TOURNAMENT",
                color = Color(0xFF8B7CAE),
                style = MaterialTheme.typography.labelSmall
            )
        }

        when {
            error != null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(error ?: "", color = Ink2, style = MaterialTheme.typography.bodyMedium)
                    Text(
                        "Retry",
                        color = GoldLt,
                        style = MaterialTheme.typography.labelLarge,
                        modifier = Modifier.padding(top = 12.dp).clickable { scope.launch { load() } }
                    )
                }
            }
            data == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Gold)
            }
            else -> {
                val t = data!!
                Column(
                    modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(top = 16.dp)
                ) {
                    HeroCard(t)
                    InfoTiles(t)
                    PlayersFillCard(t)

                    Box(Modifier.padding(top = 14.dp)) {
                        CtaButton(
                            tournament = t,
                            busy = busy,
                            onRegister = {
                                val user = AuthRepository.state.value.user
                                if (user?.isGuest != false) {
                                    actionMessage = "Sign in to join tournaments"
                                    onRequireSignIn()
                                    return@CtaButton
                                }
                                busy = true
                                scope.launch {
                                    when (val r = TournamentsRepository.join(t.id)) {
                                        is EconomyResult.Success -> { actionMessage = null; load() }
                                        is EconomyResult.Failure ->
                                            if (com.filipinodama.app.ui.components.isAuthError(r.code)) onRequireSignIn()
                                            else actionMessage = r.message
                                    }
                                    busy = false
                                }
                            },
                            onLeave = {
                                busy = true
                                scope.launch {
                                    when (val r = TournamentsRepository.leave(t.id)) {
                                        is EconomyResult.Success -> { actionMessage = null; load() }
                                        is EconomyResult.Failure ->
                                            if (com.filipinodama.app.ui.components.isAuthError(r.code)) onRequireSignIn()
                                            else actionMessage = r.message
                                    }
                                    busy = false
                                }
                            }
                        )
                    }

                    actionMessage?.let { msg ->
                        Text(
                            msg,
                            color = Color(0xFFF2B8B8),
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(top = 8.dp)
                        )
                    }

                    if (t.status == "OPEN") {
                        UpcomingNoteCard()
                    }

                    if (t.bracket.isNotEmpty()) {
                        BracketSection(t, onWatchReplay = onWatchReplay)
                    } else if (t.status == "RUNNING" || t.status == "OPEN") {
                        Text(
                            "Bracket will appear once the tournament starts.",
                            color = Ink2,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(top = 20.dp)
                        )
                    }

                    if (t.status == "COMPLETED") {
                        ChampionCard(t)
                    }

                    Box(Modifier.padding(bottom = 24.dp))
                }
            }
        }
    }
}

@Composable
private fun HeroCard(t: TournamentDetailDto) {
    val pill = statusPillFor(t.status)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Brush.linearGradient(listOf(Color(0xFF3A1C4A), Color(0xFF1A1030))), RoundedCornerShape(20.dp))
            .border(1.dp, Color(0x4DE8B84B), RoundedCornerShape(20.dp))
            .padding(20.dp)
    ) {
        Box(
            modifier = Modifier
                .background(Color(pill.bg), RoundedCornerShape(100.dp))
                .padding(horizontal = 11.dp, vertical = 4.dp)
        ) {
            Text(pill.label, color = Color(pill.fg), style = MaterialTheme.typography.labelSmall)
        }
        Text(
            t.name,
            color = Color(0xFFF4ECD6),
            style = MaterialTheme.typography.headlineSmall,
            modifier = Modifier.padding(top = 10.dp)
        )
        Text(
            formatName(t.format),
            color = Color(0xFFB6A8D4),
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.padding(top = 4.dp)
        )
        Box(Modifier.fillMaxWidth().padding(top = 16.dp).height(1.dp).background(Color(0x24E8B84B)))
        Column(modifier = Modifier.padding(top = 16.dp)) {
            Text(
                "PRIZE POOL",
                color = Color(0xFF8B7CAE),
                style = MaterialTheme.typography.labelSmall
            )
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 4.dp)) {
                CurrencyIcon(kind = CurrencyIconKind.COIN, size = 20.dp)
                Text("${t.prizePoolGold}", color = Color(0xFFF0CF72), style = MaterialTheme.typography.headlineMedium)
            }
        }
    }
}

@Composable
private fun InfoTiles(t: TournamentDetailDto) {
    Row(modifier = Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Column(
            modifier = Modifier.weight(1f).background(Color(0xCC1B1030), RoundedCornerShape(14.dp)).border(1.dp, Color(0x24E8B84B), RoundedCornerShape(14.dp)).padding(horizontal = 14.dp, vertical = 13.dp)
        ) {
            Text("ENTRY", color = Color(0xFF8B7CAE), style = MaterialTheme.typography.labelSmall)
            if (t.entryFeeGold <= 0) {
                Text("Free", color = Color(0xFF7FE0A3), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 5.dp))
            } else {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp), modifier = Modifier.padding(top = 5.dp)) {
                    CurrencyIcon(kind = CurrencyIconKind.COIN, size = 15.dp)
                    Text("${t.entryFeeGold}", color = Color(0xFFF4ECD6), style = MaterialTheme.typography.titleMedium)
                }
            }
        }
        Column(
            modifier = Modifier.weight(1f).background(Color(0xCC1B1030), RoundedCornerShape(14.dp)).border(1.dp, Color(0x24E8B84B), RoundedCornerShape(14.dp)).padding(horizontal = 14.dp, vertical = 13.dp)
        ) {
            Text("STARTS", color = Color(0xFF8B7CAE), style = MaterialTheme.typography.labelSmall)
            Text(startsLabel(t), color = Color(0xFFF4ECD6), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 5.dp))
        }
    }
}

@Composable
private fun PlayersFillCard(t: TournamentDetailDto) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 10.dp)
            .background(Color(0xCC1B1030), RoundedCornerShape(14.dp))
            .border(1.dp, Color(0x24E8B84B), RoundedCornerShape(14.dp))
            .padding(14.dp)
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Players registered", color = Color(0xFFE6DCF5), style = MaterialTheme.typography.labelMedium)
            Text("${t.registeredCount}/${t.maxPlayers}", color = Color(0xFF8B7CAE), style = MaterialTheme.typography.labelMedium)
        }
        val pct = (t.registeredCount.toFloat() / t.maxPlayers.coerceAtLeast(1)).coerceIn(0f, 1f)
        Box(
            modifier = Modifier.fillMaxWidth().height(7.dp).padding(top = 9.dp)
                .background(Color.Black.copy(alpha = 0.4f), RoundedCornerShape(4.dp))
        ) {
            Box(
                modifier = Modifier.fillMaxWidth(pct).height(7.dp)
                    .background(Brush.horizontalGradient(listOf(Color(0xFFEFC25A), Color(0xFFC9971F))), RoundedCornerShape(4.dp))
            )
        }
        if (t.minTrophies > 0) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.padding(top = 8.dp)) {
                CurrencyIcon(kind = CurrencyIconKind.TROPHY, size = 12.dp)
                Text("Min. ${t.minTrophies} to join", color = Color(0xFF9A8BBF), style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

private data class CtaSpec(val label: String, val enabled: Boolean, val isLeave: Boolean, val gold: Boolean)

@Composable
private fun CtaButton(tournament: TournamentDetailDto, busy: Boolean, onRegister: () -> Unit, onLeave: () -> Unit) {
    val joined = tournament.myEntry != null
    val spec = when {
        tournament.status == "OPEN" && !joined -> CtaSpec("Register", true, false, true)
        tournament.status == "OPEN" && joined -> CtaSpec("Registered ✓  ·  Leave", true, true, false)
        tournament.status == "RUNNING" -> CtaSpec("View bracket", false, false, false)
        tournament.status == "COMPLETED" -> CtaSpec("View results", false, false, false)
        else -> CtaSpec("Unavailable", false, false, false)
    }
    val bg = if (spec.gold) Brush.verticalGradient(listOf(Color(0xFFEFC25A), Color(0xFFC9971F)))
        else if (spec.isLeave) Brush.verticalGradient(listOf(Color(0xFF2F8F5B).copy(alpha = 0.18f), Color(0xFF2F8F5B).copy(alpha = 0.18f)))
        else Brush.verticalGradient(listOf(Color(0x1F1B1030), Color(0x1F1B1030)))
    val fg = if (spec.gold) Color(0xFF2A1608) else if (spec.isLeave) Color(0xFF7EE6A4) else Ink2

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = !busy && spec.enabled) { if (spec.isLeave) onLeave() else if (spec.gold) onRegister() }
            .background(bg, RoundedCornerShape(12.dp))
            .padding(vertical = 14.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(if (busy) "…" else spec.label, color = fg, style = MaterialTheme.typography.titleSmall)
    }
}

@Composable
private fun UpcomingNoteCard() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 14.dp)
            .background(Color(0x801B1030), RoundedCornerShape(14.dp))
            .border(1.dp, Color(0x38E8B84B), RoundedCornerShape(14.dp))
            .padding(18.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("Registration is open", color = Color(0xFFF4D886), style = MaterialTheme.typography.titleMedium)
        Text(
            "The bracket is seeded and revealed when the tournament begins. Lock your seat now.",
            color = Color(0xFF9A8BBF),
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.padding(top = 6.dp)
        )
    }
}

@Composable
private fun BracketSection(t: TournamentDetailDto, onWatchReplay: (String) -> Unit) {
    val rounds = t.bracket.entries.sortedBy { it.key.toIntOrNull() ?: 0 }
    val maxRound = rounds.maxOfOrNull { it.key.toIntOrNull() ?: 0 } ?: 0
    val entryNames = t.entries.associateBy({ it.id }, { it.user.username })

    Text(
        "BRACKET",
        color = Color(0xFF8B7CAE),
        style = MaterialTheme.typography.labelMedium,
        modifier = Modifier.padding(top = 24.dp, bottom = 12.dp)
    )
    Row(modifier = Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        rounds.forEach { (roundKey, matches) ->
            val roundNum = roundKey.toIntOrNull() ?: 0
            Column(modifier = Modifier.width(184.dp)) {
                Text(
                    roundName(roundNum, maxRound),
                    color = Color(0xFFF4D886),
                    style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier.padding(bottom = 8.dp)
                )
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    matches.sortedBy { it.slot }.forEach { m ->
                        MatchCard(m, roundNum == maxRound, entryNames, onWatchReplay)
                    }
                }
            }
        }
    }
}

@Composable
private fun MatchCard(m: TournamentMatchDto, isFinal: Boolean, entryNames: Map<String, String>, onWatchReplay: (String) -> Unit) {
    val aName = m.redEntryId?.let { entryNames[it] } ?: "—"
    val bName = m.blueEntryId?.let { entryNames[it] } ?: "—"
    val aWon = m.winnerEntryId != null && m.winnerEntryId == m.redEntryId
    val bWon = m.winnerEntryId != null && m.winnerEntryId == m.blueEntryId
    val canWatchFinal = isFinal && m.matchId != null

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = canWatchFinal) { m.matchId?.let(onWatchReplay) }
            .background(Color(0xCC1B1030), RoundedCornerShape(12.dp))
            .border(1.dp, Color(0x24E8B84B), RoundedCornerShape(12.dp))
            .padding(horizontal = 11.dp, vertical = 9.dp)
    ) {
        Text(
            aName,
            color = if (aWon) Color(0xFFF4D886) else Ink,
            style = MaterialTheme.typography.bodySmall,
            maxLines = 1
        )
        Box(Modifier.fillMaxWidth().height(1.dp).padding(vertical = 6.dp).background(Color(0x1AE8B84B)))
        Text(
            bName,
            color = if (bWon) Color(0xFFF4D886) else Ink,
            style = MaterialTheme.typography.bodySmall,
            maxLines = 1
        )
        if (canWatchFinal) {
            Text(
                "▶ WATCH FINAL REPLAY",
                color = Color(0xFFF4D886),
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.padding(top = 8.dp).fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun ChampionCard(t: TournamentDetailDto) {
    val championName = t.entries.firstOrNull { it.placement == 1 }?.user?.username
    if (championName == null) return
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 14.dp)
            .background(Brush.linearGradient(listOf(Color(0x2EF0CF72), Color(0xFF1A1030))), RoundedCornerShape(16.dp))
            .border(1.dp, Color(0x4DE8B84B), RoundedCornerShape(16.dp))
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Image(painter = painterResource(id = R.drawable.ic_trophy), contentDescription = null, modifier = Modifier.width(40.dp).height(40.dp))
        Column {
            Text("CHAMPION", color = Color(0xFF8B7CAE), style = MaterialTheme.typography.labelSmall)
            Text(championName, color = Color(0xFFF4ECD6), style = MaterialTheme.typography.titleMedium)
        }
    }
}

private data class Pill(val label: String, val fg: Long, val bg: Long)

private fun statusPillFor(status: String): Pill = when (status) {
    "RUNNING" -> Pill("LIVE", 0xFF7FE0A3, 0x3D2E784A)
    "COMPLETED" -> Pill("FINISHED", 0xFFC9B8E0, 0x2E3A1C4A)
    "CANCELLED" -> Pill("CANCELLED", 0xFFE0A38B, 0x3D78502E)
    else -> Pill("UPCOMING", 0xFFF2D493, 0x2EE8B84B)
}

private fun formatName(format: String): String = when (format) {
    "SINGLE_ELIM" -> "Single elimination"
    "DOUBLE_ELIM" -> "Double elimination"
    "SWISS" -> "Swiss"
    "ROUND_ROBIN" -> "Round robin"
    else -> format
}

private fun roundName(round: Int, maxRound: Int): String = when (maxRound - round) {
    0 -> "Final"
    1 -> "Semifinal"
    2 -> "Quarterfinal"
    else -> "Round $round"
}

private fun startsLabel(t: TournamentDetailDto): String {
    if (t.status == "RUNNING") return "In progress"
    if (t.status == "COMPLETED") return "Finished"
    if (t.status == "CANCELLED") return "Cancelled"
    val iso = t.startsAt ?: return "TBA"
    return try {
        val instant = java.time.Instant.parse(iso)
        val fmt = java.time.format.DateTimeFormatter.ofPattern("MMM d, h:mm a").withZone(java.time.ZoneId.systemDefault())
        fmt.format(instant)
    } catch (_: Exception) {
        "TBA"
    }
}
