package com.filipinodama.app.ui.screens.economy

import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.layout.offset
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
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.filipinodama.app.R
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.economy.EconomyResult
import com.filipinodama.app.data.tournaments.TournamentBracket
import com.filipinodama.app.data.tournaments.TournamentDetailDto
import com.filipinodama.app.data.tournaments.TournamentEntryDto
import com.filipinodama.app.data.tournaments.TournamentGroups
import com.filipinodama.app.data.tournaments.TournamentLiveRepository
import com.filipinodama.app.data.tournaments.TournamentMatchDto
import com.filipinodama.app.data.tournaments.TournamentMyMatchDto
import com.filipinodama.app.data.tournaments.TournamentsRepository
import com.filipinodama.app.data.tournaments.YourMatchState
import com.filipinodama.app.data.tournaments.countdownRunning
import com.filipinodama.app.data.tournaments.formatCountdown
import com.filipinodama.app.data.tournaments.secondsUntilDeadline
import com.filipinodama.app.data.tournaments.yourMatchState
import com.filipinodama.app.ui.components.CurrencyIcon
import com.filipinodama.app.ui.components.CurrencyIconKind
import com.filipinodama.app.ui.components.MockupBackButton
import com.filipinodama.app.ui.components.screenInsets
import com.filipinodama.app.ui.screens.profile.AvatarView
import com.filipinodama.app.ui.theme.FdMonoStyles
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldHi
import com.filipinodama.app.ui.theme.GoldLo
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Green
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Red
import kotlinx.coroutines.delay
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
 * LIVE PLAY (ready-check + auto-start): while the Cup is RUNNING the player's
 * own slot renders as a [YourMatchCard] — both Ready flags, the no-show
 * countdown, and an "I'm Ready" button. When both sides ready, the SERVER
 * creates and seeds the match and pushes "tournament:start"; this screen never
 * starts a match itself, it just navigates once [TournamentLiveRepository] has
 * handed the match to MatchRepository. See that repository for why there is no
 * un-ready button.
 *
 * Deviations from the mockup (both honest, not fabricated substitutes):
 *  - Match cards show ONLY player names (no aScore/bScore) — the Prisma
 *    TournamentMatch model (schema.prisma:698-737) has no score column at
 *    all (a slot is decided by winnerEntryId), so a per-side numeric score
 *    does not exist server-side to display.
 *  - "▶ WATCH FINAL REPLAY" only renders when the final slot is DONE and its
 *    `matchId` is non-null (a real Match row is linked) — omitted otherwise
 *    rather than always shown on "the final". The done-check matters now that
 *    a live slot also carries a matchId.
 */
@Composable
fun TournamentDetailScreen(
    tournamentId: String,
    onBack: () -> Unit = {},
    onRequireSignIn: () -> Unit = {},
    onWatchReplay: (String) -> Unit = {},
    /** Carries the Cup's own MatchMode so the board shows the chrome that matches
     *  what is really at stake (a RANKED Cup moves trophies; CASUAL does not). */
    onEnterMatch: (matchMode: String) -> Unit = {}
) {
    val scope = rememberCoroutineScope()
    var data by remember { mutableStateOf<TournamentDetailDto?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var actionMessage by remember { mutableStateOf<String?>(null) }

    val live by TournamentLiveRepository.state.collectAsStateWithLifecycle()

    suspend fun load() {
        when (val result = TournamentsRepository.detail(tournamentId)) {
            is EconomyResult.Success -> {
                data = result.data
                error = null
                // Seed the live layer from REST so the card is right even if
                // the socket never connects.
                TournamentLiveRepository.hydrate(result.data.myMatch)
            }
            is EconomyResult.Failure -> error = result.message
        }
    }

    LaunchedEffect(tournamentId) { load() }

    // ── Live half: readiness echoes + the auto-start handoff. Guests can't be
    //    in a bracket at all, so they never need the socket. ──
    DisposableEffect(tournamentId) {
        val user = AuthRepository.state.value.user
        if (user != null && !user.isGuest) TournamentLiveRepository.bind()
        onDispose { TournamentLiveRepository.reset() }
    }

    // Prefer the socket's view (it reflects a ready that landed after load);
    // fall back to the REST payload so the card works without a socket at all.
    val myMatch = live.myMatch ?: data?.myMatch

    // ── The server started our match: it has already seeded the board and put
    //    our socket in the match room, so all that's left is to go there. ──
    LaunchedEffect(live.startedMatchId) {
        if (live.startedMatchId != null) {
            TournamentLiveRepository.consumeStart()
            onEnterMatch(data?.matchMode ?: "CASUAL")
        }
    }

    // ── A rejected ready usually means our view is stale (the slot already
    //    started, or an admin resolved it) — refetch rather than stay wrong. ──
    LaunchedEffect(live.error) {
        val e = live.error ?: return@LaunchedEffect
        actionMessage = e.message
        TournamentLiveRepository.consumeError()
        load()
    }

    // ── Re-render once a second, but ONLY while a deadline is actually running. ──
    var nowMs by remember { mutableStateOf(System.currentTimeMillis()) }
    val counting = myMatch != null && countdownRunning(myMatch)
    LaunchedEffect(counting) {
        while (counting) {
            nowMs = System.currentTimeMillis()
            delay(1000)
        }
    }

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

                    // YOUR MATCH — the player's own slot: ready up, and the
                    // server drops both of you onto the board by itself.
                    if (t.status == "RUNNING" && myMatch != null) {
                        YourMatchCard(
                            myMatch = myMatch,
                            pending = live.pending,
                            nowMs = nowMs,
                            onReady = { TournamentLiveRepository.ready(myMatch.tmId) },
                            onRejoin = {
                                // The start event fires once; a player returning
                                // to a running slot needs the match handed over
                                // before the board can render it.
                                TournamentLiveRepository.enterLiveMatch(myMatch)
                                onEnterMatch(t.matchMode)
                            }
                        )
                    }

                    if (t.status == "OPEN") {
                        UpcomingNoteCard()
                    }

                    // GROUP STAGE — the qualification table, above the bracket
                    // it feeds. Renders for GROUP_DOUBLE_ELIM only; every other
                    // format has no groups and this draws nothing.
                    GroupStandingsSection(t)

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

// ─────────────────────────── Your Match ───────────────────────────

/**
 * The player's own slot, at the top of a running Cup.
 *
 * This is the surface that replaced "find your opponent in the bracket and go
 * arrange a game somewhere else". Both players press Ready; when the second
 * one does, the server creates the match and drops them both onto the board,
 * so this card never starts anything itself — it reports state until
 * "tournament:start" arrives.
 *
 * READY IS A COMMITMENT. There is no un-ready button because there is no
 * un-ready: the first Ready starts the opponent's no-show clock, and letting a
 * player take it back would let them stall the bracket indefinitely. The
 * button says so before it is pressed.
 */
@Composable
private fun YourMatchCard(
    myMatch: TournamentMyMatchDto,
    pending: Boolean,
    nowMs: Long,
    onReady: () -> Unit,
    onRejoin: () -> Unit
) {
    val shape = RoundedCornerShape(16.dp)
    val counting = countdownRunning(myMatch)
    val secondsLeft = secondsUntilDeadline(myMatch.deadlineAt, nowMs)
    val urgent = counting && secondsLeft <= 60
    val opponentName = myMatch.opponent?.username ?: "your opponent"

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 14.dp)
            .background(Brush.verticalGradient(listOf(Color(0x14E8B84B), Color(0x05E8B84B))), shape)
            .border(1.dp, Gold, shape)
            .padding(16.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("YOUR MATCH", color = Gold, style = MaterialTheme.typography.labelMedium, letterSpacing = 0.6.sp)
            Text(myMatch.roundLabel, color = Ink2, style = MaterialTheme.typography.labelSmall)
        }

        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            AvatarView(
                avatarUrl = myMatch.opponent?.avatarUrl,
                size = 40.dp,
                frameId = myMatch.opponent?.frameId,
                ring = false
            )
            Column(modifier = Modifier.weight(1f)) {
                Text("You play", color = Color(0xFF8B7CAE), style = MaterialTheme.typography.labelSmall)
                if (myMatch.opponent != null) {
                    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            myMatch.opponent.username,
                            color = Color(0xFFF4ECD6),
                            style = MaterialTheme.typography.titleMedium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false)
                        )
                        if (myMatch.opponent.tag.isNotEmpty()) {
                            Text("#${myMatch.opponent.tag}", color = Ink2, style = FdMonoStyles.StatSmall)
                        }
                    }
                } else {
                    Text(
                        "Waiting for an opponent",
                        color = Color(0xFFF4ECD6),
                        style = MaterialTheme.typography.titleMedium
                    )
                }
            }
        }

        // The no-show clock. Only armed once SOMEBODY has readied, so its
        // absence is meaningful too (nobody has committed yet).
        if (counting) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 12.dp)
                    .background(Color(0x66120922), RoundedCornerShape(12.dp))
                    .padding(horizontal = 12.dp, vertical = 9.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    if (myMatch.iAmReady) "Opponent must ready in" else "You must ready in",
                    color = Color(0xFF8B7CAE),
                    style = MaterialTheme.typography.labelSmall
                )
                Text(
                    formatCountdown(secondsLeft),
                    color = if (urgent) Color(0xFFFF9AA8) else GoldLt,
                    style = FdMonoStyles.Timer
                )
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            ReadyPill("You", myMatch.iAmReady, Modifier.weight(1f))
            ReadyPill(myMatch.opponent?.username ?: "Opponent", myMatch.opponentReady, Modifier.weight(1f))
        }

        when (yourMatchState(myMatch)) {
            YourMatchState.LIVE -> {
                GoldActionButton(label = "Rejoin your match", enabled = true, onClick = onRejoin)
                Text(
                    "Your game is in progress.",
                    color = Ink2,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }
            YourMatchState.READY_WAITING -> Text(
                "You're ready — waiting for $opponentName. The match starts by itself the moment they're ready too.",
                color = Color(0xFF7EE6A4),
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 12.dp)
            )
            YourMatchState.AWAITING_OPPONENT -> Text(
                "This slot is still waiting on the result of an earlier match.",
                color = Ink2,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 12.dp)
            )
            YourMatchState.CAN_READY -> {
                GoldActionButton(label = if (pending) "…" else "I'm Ready", enabled = !pending, onClick = onReady)
                Text(
                    if (myMatch.opponentReady) "Your opponent is waiting — press Ready to start immediately."
                    else "Readying up starts a countdown for your opponent. You can't undo it.",
                    color = Ink2,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }
        }
    }
}

@Composable
private fun ReadyPill(label: String, ready: Boolean, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(100.dp)
    Row(
        modifier = modifier
            .background(if (ready) Color(0x292F8F5B) else Color(0x0AFFFFFF), shape)
            .border(1.dp, if (ready) Color(0x663FBF6F) else Color(0x17FFFFFF), shape)
            .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp)
    ) {
        Text(if (ready) "✓" else "○", color = if (ready) Color(0xFF7EE6A4) else Ink2, style = MaterialTheme.typography.labelSmall)
        Text(
            "$label ${if (ready) "ready" else "not ready"}",
            color = if (ready) Color(0xFF7EE6A4) else Ink2,
            style = MaterialTheme.typography.labelSmall,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

/** The card's primary action, in the same gold-gradient language as [CtaButton]. */
@Composable
private fun GoldActionButton(label: String, enabled: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 14.dp)
            .clickable(enabled = enabled, onClick = onClick)
            .background(Brush.verticalGradient(listOf(Color(0xFFEFC25A), Color(0xFFC9971F))), RoundedCornerShape(12.dp))
            .alpha(if (enabled) 1f else 0.7f)
            .padding(vertical = 13.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(label, color = Color(0xFF2A1608), style = MaterialTheme.typography.titleSmall)
    }
}

// ─────────────────────────── Group standings ───────────────────────────

/**
 * The GROUP_DOUBLE_ELIM group tables.
 *
 * The bracket below shows WHO plays whom; only this shows WHO IS THROUGH, which
 * is the entire point of a group stage and is not recoverable from a bracket
 * that hasn't been seeded yet. Every group therefore gets its own table, cut
 * into the three qualification bands (upper bracket / lower bracket / out) with
 * a labelled rule between them — the same "cut line" an esports standings page
 * uses, because rank alone doesn't say where the line is.
 *
 * The W/L tally and the band are LIVE while the group stage runs (the server
 * writes `groupPlacement` only once, at the cut), so the table says so in
 * words rather than presenting a projection as a result — see [TournamentGroups].
 *
 * Visual language is [LeaderboardScreen]'s RankRow: rank, avatar, name with the
 * gold YOU pill, value on the right. Those are private and typed to a
 * leaderboard DTO, hence the separate composable rather than reuse.
 */
@Composable
private fun GroupStandingsSection(t: TournamentDetailDto) {
    if (t.format != TournamentGroups.FORMAT) return

    val groups = remember(t.entries, t.bracket, t.qualifiersPerGroup) {
        TournamentGroups.standings(
            entries = t.entries,
            matches = t.bracket.values.flatten(),
            qualifiersPerGroup = t.qualifiersPerGroup
        )
    }
    if (groups.isEmpty()) return

    Text(
        "GROUP STAGE",
        color = Color(0xFF8B7CAE),
        style = MaterialTheme.typography.labelMedium,
        modifier = Modifier.padding(top = 24.dp, bottom = 8.dp)
    )

    TournamentGroups.cutSummary(t.qualifiersPerGroup)?.let { summary ->
        Text(summary, color = Ink2, style = MaterialTheme.typography.bodySmall)
    }

    // Say plainly when the table is a projection. A cut that is still moving
    // looks identical to a settled one, and telling a player they are out when
    // they can still play their way back in is the worst thing this screen
    // could do.
    if (groups.any { !it.decided }) {
        Text(
            "Live standings — the cut is applied when the group stage finishes.",
            color = Color(0xFF8B7CAE),
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(top = 4.dp)
        )
    }

    groups.forEach { group ->
        GroupTableCard(group = group, myEntryId = t.myEntry?.id)
    }
}

/** One group's card: title, progress, and its rows split by qualification band. */
@Composable
private fun GroupTableCard(group: TournamentGroups.Group, myEntryId: String?) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 12.dp)
            .background(Color(0xCC1B1030), RoundedCornerShape(14.dp))
            .border(1.dp, Color(0x24E8B84B), RoundedCornerShape(14.dp))
            .padding(vertical = 12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                group.label.uppercase(),
                color = Color(0xFFF4D886),
                style = MaterialTheme.typography.labelMedium,
                letterSpacing = 0.7.sp
            )
            if (group.total > 0) {
                Text(
                    "${group.played}/${group.total} played",
                    color = Ink2,
                    style = MaterialTheme.typography.labelSmall
                )
            }
        }

        // Column headers, mirroring the leaderboard table's RANK/PLAYER/RATING.
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text("#", color = Ink2, style = MaterialTheme.typography.labelSmall)
            Text(
                "PLAYER",
                color = Ink2,
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.weight(1f).padding(start = 20.dp)
            )
            Text("W–L", color = Ink2, style = MaterialTheme.typography.labelSmall)
        }

        var lastBand: TournamentGroups.Band? = null
        group.rows.forEach { row ->
            if (row.band != lastBand) {
                BandDivider(band = row.band, decided = group.decided)
                lastBand = row.band
            }
            GroupStandingRow(row = row, isYou = myEntryId != null && row.entry.id == myEntryId)
        }
    }
}

/**
 * The cut line: a band heading with a hairline running off it. This is what
 * makes the qualification bands legible at a glance — without it the table is
 * an undifferentiated list and the reader has to count rows against a rule
 * stated somewhere else.
 */
@Composable
private fun BandDivider(band: TournamentGroups.Band, decided: Boolean) {
    if (band == TournamentGroups.Band.UNKNOWN) return
    val accent = bandColor(band)
    val label = TournamentGroups.BAND_LABEL[band] ?: return
    Row(
        modifier = Modifier.fillMaxWidth().padding(start = 14.dp, end = 14.dp, top = 8.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text(
            // The arrow marks a band that is still MOVING. A settled cut and a
            // live projection look identical otherwise, and the difference is
            // whether the rows below it are out or merely losing.
            if (decided) label.uppercase() else "→ ${label.uppercase()}",
            color = accent,
            style = MaterialTheme.typography.labelSmall,
            letterSpacing = 0.6.sp
        )
        Box(Modifier.weight(1f).height(1.dp).background(accent.copy(alpha = 0.28f)))
    }
}

/** One player's line. Layout matches LeaderboardScreen's RankRow. */
@Composable
private fun GroupStandingRow(row: TournamentGroups.Row, isYou: Boolean) {
    val accent = bandColor(row.band)
    val out = row.band == TournamentGroups.Band.ELIMINATED
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(if (isYou) Gold.copy(alpha = 0.06f) else Color.Transparent)
            .padding(horizontal = 14.dp, vertical = 9.dp)
            // Eliminated rows are dimmed on the same principle the bracket
            // dims a beaten competitor — still readable, clearly done.
            .alpha(if (out) 0.55f else 1f),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            row.rank.toString(),
            color = accent,
            style = MaterialTheme.typography.titleSmall,
            modifier = Modifier.padding(end = 12.dp)
        )
        AvatarView(avatarUrl = row.entry.user.avatarUrl, size = 34.dp, ring = false)
        Column(modifier = Modifier.weight(1f).padding(start = 10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                Text(
                    row.entry.user.username,
                    color = Color(0xFFF2E9D2),
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false)
                )
                if (isYou) {
                    Box(
                        modifier = Modifier
                            .background(Brush.verticalGradient(listOf(GoldHi, GoldLo)), RoundedCornerShape(100.dp))
                            .padding(horizontal = 7.dp, vertical = 2.dp)
                    ) {
                        Text("YOU", color = Color(0xFF1A0F2E), style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
            row.entry.seed?.let { seed ->
                // Groups are a snake draft over seeds, so the seed explains the
                // draw rather than being decoration.
                Text("Seed #$seed", color = Ink2, style = MaterialTheme.typography.labelSmall)
            }
        }
        Text(
            "${row.wins}–${row.losses}",
            color = if (out) Ink2 else GoldLt,
            style = FdMonoStyles.StatSmall
        )
    }
}

/**
 * Band accent. Gold is this app's "top of the table" colour (champion, YOU
 * badge), green its "still alive" one, red its "out" one — so the three bands
 * read in the app's own vocabulary rather than a new one. Colour is only ever
 * reinforcement here: every band is also spelled out by [BandDivider].
 */
private fun bandColor(band: TournamentGroups.Band): Color = when (band) {
    TournamentGroups.Band.UPPER -> Gold
    TournamentGroups.Band.LOWER -> Green
    TournamentGroups.Band.ELIMINATED -> Red
    TournamentGroups.Band.UNKNOWN -> Ink
}

// ─────────────────────────── Bracket ───────────────────────────

/**
 * Bracket geometry, in dp. [BRACKET_METRICS] feeds the shared layout math
 * (TournamentBracket, the Kotlin port of packages/shared/src/bracket.ts), so
 * Android and web place every card the same way — the numbers below are just
 * the mobile sizing of the same shape.
 */
private val CARD_H = 60.dp
private val CARD_GAP = 14.dp
private val COL_W = 168.dp
private val COL_GAP = 30.dp
private val ROUND_HEADER_H = 26.dp
private val ROUND_HEADER_GAP = 10.dp
private val BRACKET_METRICS = TournamentBracket.Metrics(cardH = CARD_H.value, gap = CARD_GAP.value)

private fun columnX(roundIndex: Int) = (COL_W + COL_GAP) * roundIndex

/**
 * The bracket, drawn the way an esports bracket is drawn: a named header over
 * each round column, one card per match with a row per competitor, and elbow
 * connectors running from each match into the one it feeds.
 *
 * WHY POSITIONS ARE COMPUTED, NOT FLOWED. A winners bracket halves every
 * round, so a plain column of evenly-spaced cards would very nearly work. The
 * losers bracket does not: a "drop" round (where the winners bracket's fresh
 * losers enter) has the SAME match count as the round before it. Feeding is
 * therefore derived from the ratio of adjacent column sizes and every card is
 * placed at the midpoint of the matches that feed it — see
 * TournamentBracket.layoutBracket.
 *
 * NO SCORE COLUMN. Real esports brackets show a series score (2-1); our slots
 * are a single game, replayed only on a draw, so a score here would be
 * invented. The winner's row gets a check instead.
 */
@Composable
private fun BracketSection(t: TournamentDetailDto, onWatchReplay: (String) -> Unit) {
    val matches = t.bracket.values.flatten()
    // GROUP_DOUBLE_ELIM's playoff IS a double elimination — its group stage
    // only replaces winners round 1 — so it takes the "Upper/Lower Bracket"
    // round wording too. Left out, every playoff column would read as a plain
    // single-elimination round while a Lower Bracket section sat beside it.
    val doubleElim = t.format == "DOUBLE_ELIM" || t.format == TournamentGroups.FORMAT
    val sections = remember(matches, doubleElim) { TournamentBracket.sections(matches, doubleElim) }
    val entryById = remember(t.entries) { t.entries.associateBy { it.id } }
    // Swiss / round-robin rounds are re-paired every round — their columns
    // aren't a tree, so drawing feeder lines between them would assert a
    // relationship that doesn't exist.
    val elimination = t.format == "SINGLE_ELIM" || doubleElim

    Text(
        "BRACKET",
        color = Color(0xFF8B7CAE),
        style = MaterialTheme.typography.labelMedium,
        modifier = Modifier.padding(top = 24.dp, bottom = 12.dp)
    )

    sections.forEach { section ->
        BracketSectionView(
            section = section,
            entryById = entryById,
            myEntryId = t.myEntry?.id,
            doubleElim = doubleElim,
            // …except the GROUP section, for exactly the reason above: a round
            // robin re-pairs every round, so its columns are a schedule, not a
            // tree. The playoff sections of the same Cup still get connectors.
            connectors = elimination && section.key != TournamentBracket.BracketKey.G
        )
    }

    // The final slot's replay, once it is actually decided and linked to a
    // real Match row (a live slot carries a matchId too, hence the done-check).
    val finalMatch = sections.lastOrNull()
        ?.let { s -> s.matchesByRound[s.rounds.lastOrNull()] }
        ?.lastOrNull { it.status == "done" && it.matchId != null }
    if (finalMatch?.matchId != null) {
        Text(
            "▶ WATCH FINAL REPLAY",
            color = Color(0xFFF4D886),
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier
                .padding(top = 12.dp)
                .clickable { onWatchReplay(finalMatch.matchId) }
        )
    }
}

/** One sub-bracket (winners / losers / grand final), or the whole tree for a
 *  single-elimination Cup. Horizontally scrollable — a 16-player round 1 is
 *  far wider than a phone. */
@Composable
private fun BracketSectionView(
    section: TournamentBracket.Section,
    entryById: Map<String, TournamentEntryDto>,
    myEntryId: String?,
    doubleElim: Boolean,
    connectors: Boolean
) {
    val sizes = section.rounds.map { (section.matchesByRound[it] ?: emptyList()).size }
    val layout = remember(sizes) { TournamentBracket.layoutBracket(sizes, BRACKET_METRICS) }
    val bodyH = TournamentBracket.bracketHeight(layout, BRACKET_METRICS).dp
    val totalW = COL_W * section.rounds.size + COL_GAP * (section.rounds.size - 1).coerceAtLeast(0)

    Column(modifier = Modifier.padding(bottom = 18.dp)) {
        section.title?.let { title ->
            Text(
                title.uppercase(),
                color = Color(0xFFF4D886),
                style = MaterialTheme.typography.labelMedium,
                letterSpacing = 0.7.sp,
                modifier = Modifier.padding(bottom = 10.dp)
            )
        }
        Box(modifier = Modifier.horizontalScroll(rememberScrollState())) {
            Box(modifier = Modifier.width(totalW).height(ROUND_HEADER_H + ROUND_HEADER_GAP + bodyH)) {
                // Round headers.
                section.rounds.forEachIndexed { ri, round ->
                    Box(
                        modifier = Modifier
                            .offset(x = columnX(ri))
                            .width(COL_W)
                            .height(ROUND_HEADER_H)
                            .background(Color(0x0DFFFFFF), RoundedCornerShape(8.dp))
                            .border(1.dp, Color(0x24E8B84B), RoundedCornerShape(8.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            TournamentBracket.roundLabel(round, section.rounds, doubleElim),
                            color = Color(0xFFE7DCC2),
                            style = MaterialTheme.typography.labelSmall,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.padding(horizontal = 8.dp)
                        )
                    }
                }

                // Elbow connectors, UNDER the cards: a horizontal stub out of
                // each match's right edge, a vertical to its parent's centre
                // line, then a horizontal into the parent.
                if (connectors) {
                    Canvas(
                        modifier = Modifier
                            .offset(y = ROUND_HEADER_H + ROUND_HEADER_GAP)
                            .width(totalW)
                            .height(bodyH)
                    ) {
                        val stroke = 1.5.dp.toPx()
                        val cardHpx = CARD_H.toPx()
                        val colWpx = COL_W.toPx()
                        val colGapPx = COL_GAP.toPx()
                        // Alpha .42, not .28 — the elbows were near-invisible
                        // against the dark board at the lower value.
                        val line = Color(0x6BE8B84B)

                        for (r in 1 until section.rounds.size) {
                            val size = sizes[r]
                            val prevSize = sizes[r - 1]
                            val parentX = (colWpx + colGapPx) * r
                            val childRight = (colWpx + colGapPx) * (r - 1) + colWpx
                            val midX = childRight + colGapPx / 2f
                            for (i in 0 until size) {
                                val parentY = (layout.getOrNull(r)?.getOrNull(i) ?: 0f).dp.toPx() + cardHpx / 2f
                                for (f in TournamentBracket.feedersFor(i, size, prevSize)) {
                                    val childTop = layout.getOrNull(r - 1)?.getOrNull(f) ?: continue
                                    val childY = childTop.dp.toPx() + cardHpx / 2f
                                    drawLine(line, Offset(childRight, childY), Offset(midX, childY), stroke)
                                    drawLine(line, Offset(midX, childY), Offset(midX, parentY), stroke)
                                    drawLine(line, Offset(midX, parentY), Offset(parentX, parentY), stroke)
                                }
                            }
                        }
                    }
                }

                // Match cards.
                section.rounds.forEachIndexed { ri, round ->
                    (section.matchesByRound[round] ?: emptyList()).forEachIndexed { mi, m ->
                        BracketMatchCard(
                            m = m,
                            entryById = entryById,
                            myEntryId = myEntryId,
                            modifier = Modifier.offset(
                                x = columnX(ri),
                                y = ROUND_HEADER_H + ROUND_HEADER_GAP + (layout.getOrNull(ri)?.getOrNull(mi) ?: 0f).dp
                            )
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun BracketMatchCard(
    m: TournamentMatchDto,
    entryById: Map<String, TournamentEntryDto>,
    myEntryId: String?,
    modifier: Modifier = Modifier
) {
    val red = m.redEntryId?.let { entryById[it] }
    val blue = m.blueEntryId?.let { entryById[it] }
    // An empty side is a BYE only on a slot that RESOLVED with one competitor;
    // an unresolved slot's empty side is still waiting on its feeder — TBD.
    val bye = TournamentBracket.isBye(m)
    val decided = TournamentBracket.isDecided(m)
    val live = TournamentBracket.isLive(m)
    val mine = myEntryId != null && (m.redEntryId == myEntryId || m.blueEntryId == myEntryId)
    val shape = RoundedCornerShape(10.dp)

    Box(
        modifier = modifier
            .width(COL_W)
            .height(CARD_H)
            .background(Color(0xCC1B1030), shape)
            .border(if (mine) 1.5.dp else 1.dp, if (mine) Gold else Color(0x24E8B84B), shape)
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            CompetitorRow(
                entry = red,
                isWinner = decided && m.winnerEntryId == m.redEntryId,
                isBye = bye && red == null,
                isMe = myEntryId != null && m.redEntryId == myEntryId,
                decided = decided,
                modifier = Modifier.weight(1f)
            )
            Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0x1FE8B84B)))
            CompetitorRow(
                entry = blue,
                isWinner = decided && m.winnerEntryId == m.blueEntryId,
                isBye = bye && blue == null,
                isMe = myEntryId != null && m.blueEntryId == myEntryId,
                decided = decided,
                modifier = Modifier.weight(1f)
            )
        }
        if (live) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .background(Color(0xE6A83744), RoundedCornerShape(topEnd = 9.dp, bottomStart = 7.dp))
                    .padding(horizontal = 6.dp, vertical = 2.dp)
            ) {
                Text("LIVE", color = Color(0xFFFFE8EC), style = MaterialTheme.typography.labelSmall, letterSpacing = 0.6.sp)
            }
        }
    }
}

/** One competitor line of a match card. Before a result both rows read
 *  neutral; after it the winner is lifted and the loser dimmed — the single
 *  strongest signal in a bracket. */
@Composable
private fun CompetitorRow(
    entry: TournamentEntryDto?,
    isWinner: Boolean,
    isBye: Boolean,
    isMe: Boolean,
    decided: Boolean,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .alpha(if (decided && !isWinner) 0.5f else 1f)
            .background(if (isWinner) Color(0x242F8F5B) else Color.Transparent)
            .padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp)
    ) {
        if (entry == null) {
            Text(
                if (isBye) "BYE" else "TBD",
                color = Ink2,
                style = MaterialTheme.typography.labelSmall
            )
        } else {
            AvatarView(avatarUrl = entry.user.avatarUrl, size = 16.dp, ring = false)
            Text(
                entry.user.username,
                color = if (isWinner) Color(0xFFA9F0C4) else Color(0xFFF2E9D2),
                style = MaterialTheme.typography.labelSmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false)
            )
            if (isMe) {
                Text("YOU", color = Gold, style = MaterialTheme.typography.labelSmall, letterSpacing = 0.5.sp)
            }
            if (isWinner) {
                Text("✓", color = Color(0xFF7EE6A4), style = MaterialTheme.typography.labelMedium)
            }
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
    // Named, not passed through: the fallback below prints the raw enum, so an
    // unmapped format shows players "GROUP_DOUBLE_ELIM" under the Cup's title.
    TournamentGroups.FORMAT -> "Groups + Double Elim"
    else -> format
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
