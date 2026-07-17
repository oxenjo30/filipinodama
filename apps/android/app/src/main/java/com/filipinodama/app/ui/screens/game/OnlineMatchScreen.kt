package com.filipinodama.app.ui.screens.game

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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.filipinodama.app.R
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.economy.EconomyRepository
import com.filipinodama.app.data.economy.EconomyResult
import com.filipinodama.app.data.engine.MatchEndReasons
import com.filipinodama.app.data.engine.PieceColors
import com.filipinodama.app.data.engine.RankTiers
import com.filipinodama.app.data.match.MatchRepository
import com.filipinodama.app.data.match.MatchStatus
import com.filipinodama.app.ui.components.CurrencyAmount
import com.filipinodama.app.ui.components.CurrencyIconKind
import com.filipinodama.app.ui.components.MockupBackButton
import com.filipinodama.app.ui.components.screenInsets
import com.filipinodama.app.ui.screens.profile.AvatarView
import com.filipinodama.app.ui.screens.social.ReportPlayerDialog
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel

/**
 * The live ONLINE match screen — server-authoritative, mirrors
 * apps/web/src/features/play/OnlineMatchPage.tsx's board portion, restyled 1:1
 * to the mobile mockup's Board screen (mobile-split.txt lines 417-505):
 * top bar (back / "RANKED · SEASON N" / guide button), opponent + self player
 * bars (avatar+frame, name, tier·trophies, capture counter, blue/red tinted
 * gradients), must-capture / your-turn pills, mockup-styled Resign.
 *
 * HONEST OMISSIONS vs the mockup (verified, not skipped):
 *  - "05:00" per-player countdown timers: classic online matches have NO
 *    clock data — `clocks` is only populated by the Damath engine
 *    (packages/game-engine/src/damath/damathState.ts:30, web-only per owner
 *    directive) and web's OnlineMatchPage renders no clocks either.
 *  - "↺ Undo": server-authoritative matches have no undo event (no such EV
 *    in apps/server/src/realtime/match.ts; web has no undo).
 *  - "💡 Hint": no hint implementation exists anywhere (server, web, or
 *    engine) — a dead button would be a fake control.
 *
 * The Result overlay is the mockup's full-bleed takeover (art background,
 * VICTORY/DEFEAT gradient title, stat tiles, trophy/gold pills, Rematch /
 * Watch replay / Back to Home / Report opponent) with the real rematch
 * state machine preserved. Report uses the real POST /reports
 * (context="profile" — the only server-supported non-DM context) and Watch
 * replay routes to the real ReplayViewerScreen (GET /api/matches/:id).
 */
@Composable
fun OnlineMatchScreen(
    mode: String,
    onExit: () -> Unit,
    onWatchReplay: (String) -> Unit = {},
    onOpenSettings: () -> Unit = {}
) {
    val ui by MatchRepository.state.collectAsState()
    val authState by AuthRepository.state.collectAsState()
    val me = authState.user
    var showResignConfirm by remember { mutableStateOf(false) }
    var chatOpen by remember { mutableStateOf(false) }
    var lastSeenChatCount by remember { mutableStateOf(0) }
    var seasonNum by remember { mutableStateOf<Int?>(null) }

    // Mockup header shows "Ranked · Season N" — season number is real data
    // (EconomyRepository.seasonCurrent, same source as HomeScreen's hero pill).
    LaunchedEffect(mode) {
        if (mode == "RANKED") {
            when (val r = EconomyRepository.seasonCurrent()) {
                is EconomyResult.Success -> seasonNum = r.data.season.number
                is EconomyResult.Failure -> { /* label falls back to "RANKED" */ }
            }
        }
    }

    val gs = ui.gameState
    if (gs == null) {
        // The match state hasn't arrived. Two cases:
        //  1. ENDED — the server said no-such-match (an abandoned/forfeited match
        //     that's already gone from live memory, e.g. resuming a stale
        //     "Continue" card). Don't spin on "Loading match…" forever — exit
        //     back so the resume card refreshes away.
        //  2. Still genuinely loading — show the loader, but with a TIMEOUT so a
        //     resync that never resolves (dead match) can't strand the player.
        if (ui.status == MatchStatus.ENDED) {
            LaunchedEffect(Unit) { onExit() }
            return
        }
        // Give the resync ~8s; if no state arrives, the match is unresumable — bail.
        LaunchedEffect(ui.matchId) {
            kotlinx.coroutines.delay(8000)
            if (MatchRepository.state.value.gameState == null) {
                MatchRepository.reset()
                onExit()
            }
        }
        Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                CircularProgressIndicator(color = GoldLt)
                Text("Loading match…", color = Ink, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(top = 14.dp))
            }
        }
        return
    }

    val myColor = ui.myColor
    val isSpectating = myColor == null
    val myTurn = gs.result == null && gs.turn == myColor && ui.status == MatchStatus.PLAYING
    val flip = myColor == PieceColors.BLUE

    // Board sound effects (move / capture / king / win / lose), diffed from the
    // live state. myColor is null for a spectator → neutral end flourish.
    com.filipinodama.app.data.audio.GameSounds(state = gs, myColor = myColor)

    // Real capture counters (mockup's ×N chips): captured-by-a-side = 12 minus
    // the other side's remaining pieces.
    val redRemaining = gs.pieces.count { it.color == PieceColors.RED }
    val blueRemaining = gs.pieces.count { it.color == PieceColors.BLUE }
    val capturedByRed = 12 - blueRemaining
    val capturedByBlue = 12 - redRemaining

    val oppColor = if (myColor == PieceColors.RED) PieceColors.BLUE else PieceColors.RED
    val oppIsBlue = oppColor == PieceColors.BLUE
    val opponent = ui.opponent

    // Unread badge: count messages that arrived since the panel was last opened.
    val unread = if (chatOpen) 0 else (ui.chat.size - lastSeenChatCount).coerceAtLeast(0)

    fun leave() {
        MatchRepository.leaveQueue()
        MatchRepository.reset()
        onExit()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(
                // Mockup board bg: radial-gradient(circle at 50% 28%, #1c1338, #0b0716 70%).
                Brush.radialGradient(listOf(Color(0xFF1C1338), Color(0xFF0B0716)))
            )
            .screenInsets()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
            .imePadding(),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Top bar: back ‹ / centered mode label / guide (settings) button.
        Row(
            modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            MockupBackButton(onClick = { leave() })
            if (isSpectating) {
                // Spectate top bar: pulsing "LIVE" label + real viewer count
                // (SOC-4/ROOM-1). `ui.viewers` is pushed live over the socket
                // (spectate:count) — render it as the mockup's 👁 count pill.
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(5.dp),
                        modifier = Modifier
                            .background(Color(0x1FFF5A6A), RoundedCornerShape(100.dp))
                            .border(1.dp, Color(0x40FF5A6A), RoundedCornerShape(100.dp))
                            .padding(horizontal = 9.dp, vertical = 4.dp)
                    ) {
                        Box(modifier = Modifier.size(6.dp).background(Color(0xFFFF5A6A), CircleShape))
                        Text("LIVE", color = Color(0xFFFF8F9C), style = MaterialTheme.typography.labelSmall, letterSpacing = 1.5.sp)
                    }
                    ui.viewers?.let { v ->
                        Text("👁 $v", color = Color(0xFF8B7CAE), style = MaterialTheme.typography.labelMedium)
                    }
                }
            } else {
                Text(
                    text = when {
                        mode == "RANKED" -> if (seasonNum != null) "RANKED · SEASON $seasonNum" else "RANKED"
                        else -> "CASUAL MATCH"
                    },
                    color = Color(0xFF8B7CAE),
                    style = MaterialTheme.typography.labelMedium,
                    letterSpacing = 2.sp
                )
            }
            Box(
                modifier = Modifier
                    .size(38.dp)
                    .clickable(onClick = onOpenSettings)
                    .background(Color(0xB31B1030), RoundedCornerShape(12.dp))
                    .border(1.dp, Color(0x40E8B84B), RoundedCornerShape(12.dp)),
                contentAlignment = Alignment.Center
            ) {
                Image(painterResource(R.drawable.sb_guide), contentDescription = "Settings", modifier = Modifier.size(18.dp))
            }
        }

        // Opponent bar (top) — blue or red tint depending on the seat.
        MatchPlayerBar(
            name = if (isSpectating) "Blue" else opponent?.displayName ?: "Opponent",
            tierLine = if (isSpectating) "Blue player"
            else opponent?.let { "${RankTiers.forTrophies(it.trophies).label} · ${it.trophies} 🏆" } ?: "Opponent",
            avatarUrl = if (isSpectating) null else opponent?.avatarUrl,
            frameId = if (isSpectating) null else opponent?.frameId,
            caps = if (isSpectating) capturedByBlue else if (oppIsBlue) capturedByBlue else capturedByRed,
            capturedSideColor = if ((if (isSpectating) PieceColors.BLUE else oppColor) == PieceColors.BLUE) Color(0xFFA0303A) else Color(0xFF2E6BC6),
            blueTint = if (isSpectating) true else oppIsBlue
        )

        // Turn pill — mockup's must-capture (red, pulsing) / your-turn (gold).
        Box(modifier = Modifier.padding(vertical = 12.dp)) {
            when {
                isSpectating -> TurnPill(
                    text = "${if (gs.turn == PieceColors.BLUE) "Blue" else "Red"} to move · Move ${gs.moveNumber}",
                    dot = Ink2, bg = Panel.copy(alpha = 0.7f), borderColor = Color(0x33E8B84B), textColor = Ink
                )
                myTurn && ui.mustCapture -> TurnPill(
                    text = "You must capture this turn.",
                    dot = Color(0xFFFF5A6A), bg = Color(0x26FF5A6A), borderColor = Color(0x80FF5A6A), textColor = Color(0xFFFF8F9C)
                )
                myTurn -> TurnPill(
                    text = "Your turn",
                    dot = Color(0xFFF0CF72), bg = Color(0x1FE8B84B), borderColor = Color(0x59E8B84B), textColor = Color(0xFFF4D886)
                )
                // Our move is applied locally but not yet confirmed by the server
                // (latency fix #2): on a laggy link, show it's SYNCING rather than
                // silently reading as the opponent's turn.
                ui.pendingMove -> TurnPill(
                    text = "Sending move…",
                    dot = Color(0xFFF0CF72), bg = Panel.copy(alpha = 0.7f), borderColor = Color(0x33E8B84B), textColor = Ink
                )
                else -> TurnPill(
                    text = "Opponent's move…",
                    dot = Ink2, bg = Panel.copy(alpha = 0.7f), borderColor = Color(0x33E8B84B), textColor = Ink
                )
            }
        }

        if (ui.connectionLost && ui.status == MatchStatus.PLAYING && gs.result == null) {
            ConnectionLostBanner(modifier = Modifier.padding(bottom = 10.dp))
        }

        // Vibration pref (Settings "Audio & Haptics") — real consumption of
        // SettingsStore.haptics: light tick on each interactive board tap.
        val hapticFeedback = androidx.compose.ui.platform.LocalHapticFeedback.current
        BoardView(
            state = gs,
            selected = ui.selected,
            moveTargets = ui.moveTargets,
            captureTargets = ui.captureTargets,
            mustCapture = ui.mustCapture && myTurn,
            onSquareClick = {
                if (com.filipinodama.app.data.settings.SettingsStore.instance.haptics.value) {
                    hapticFeedback.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.TextHandleMove)
                }
                MatchRepository.onSquareClick(it)
            },
            flip = flip,
            interactive = myTurn && !isSpectating
        )

        // Self bar (bottom) — the mockup's red-tinted "me" bar.
        MatchPlayerBar(
            name = if (isSpectating) "Red" else me?.displayName ?: "You",
            tierLine = if (isSpectating) "Red player"
            else me?.let { "${RankTiers.forTrophies(it.trophies).label} · ${it.trophies} 🏆" } ?: "You",
            avatarUrl = if (isSpectating) null else me?.avatarUrl,
            frameId = if (isSpectating) null else me?.frameId,
            caps = if (isSpectating) capturedByRed else if (myColor == PieceColors.BLUE) capturedByBlue else capturedByRed,
            capturedSideColor = if ((if (isSpectating) PieceColors.RED else myColor ?: PieceColors.RED) == PieceColors.BLUE) Color(0xFFA0303A) else Color(0xFF2E6BC6),
            blueTint = if (isSpectating) false else myColor == PieceColors.BLUE,
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
            // Action row — mockup shows Undo/Hint/Resign (Mobile.dc.html
            // lines 351-355). Of these, only Resign has a real backend for
            // online play (no `undo` event in apps/server/src/realtime/
            // match.ts; no hint implementation anywhere — server, web, or
            // engine). Per the owner's finding #10 direction, Undo/Hint are
            // rendered matching the mockup's exact look but disabled
            // (non-clickable, dimmed) rather than either faking a working
            // control OR omitting them outright — this is an honest
            // display-only state, not a dead button pretending to work.
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(9.dp)
            ) {
                DisabledActionButton(label = "↺ Undo", modifier = Modifier.weight(1f))
                DisabledActionButton(label = "💡 Hint", modifier = Modifier.weight(1f))
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clickable(enabled = gs.result == null) { showResignConfirm = true }
                        .background(Color(0x1AFF5A6A), RoundedCornerShape(12.dp))
                        .border(1.dp, Color(0x59FF5A6A), RoundedCornerShape(12.dp))
                        .padding(vertical = 12.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text("⚑ Resign", color = Color(0xFFFF8F9C), style = MaterialTheme.typography.labelMedium)
                }
            }

            // Quick Chat — real in-match chat (kept even though the mockup's
            // board screen doesn't draw it; removing a wired real feature
            // would be a regression, and web keeps it too).
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
        com.filipinodama.app.ui.components.ResignConfirmDialog(
            subtitle = "Your opponent will be awarded the win. This can't be undone.",
            onCancel = { showResignConfirm = false },
            onResign = { showResignConfirm = false; MatchRepository.resign() }
        )
    }

    if (ui.end != null) {
        MatchEndCard(
            mode = mode,
            onRematch = { MatchRepository.offerRematch() },
            onAcceptRematch = { MatchRepository.acceptRematch() },
            onDeclineRematch = { MatchRepository.declineRematch() },
            onWatchReplay = onWatchReplay,
            onHome = {
                MatchRepository.reset()
                onExit()
            }
        )
    }
}

/**
 * The mockup's player info bar: avatar+frame, Cinzel name, tier·trophies,
 * capture counter chip. Blue seat = blue-tinted gradient/border; red seat =
 * the mockup's glowing crimson gradient. Timer chip intentionally absent
 * (no clock data for classic matches — see class doc).
 */
@Composable
private fun MatchPlayerBar(
    name: String,
    tierLine: String,
    avatarUrl: String?,
    frameId: String?,
    caps: Int,
    capturedSideColor: Color,
    blueTint: Boolean,
    modifier: Modifier = Modifier
) {
    val bg = if (blueTint) Brush.linearGradient(listOf(Color(0x332E6BC6), Color(0x8C1B1030)))
    else Brush.linearGradient(listOf(Color(0x38D93B52), Color(0x8C1B1030)))
    val borderColor = if (blueTint) Color(0x4D5A96FF) else Color(0x73D93B52)
    val nameColor = if (blueTint) Color(0xFFDBE6FF) else Color(0xFFFFD9D9)
    val subColor = if (blueTint) Color(0xFF8FB3FF) else Color(0xFFF0A0A0)

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
            Text(tierLine, color = subColor, style = MaterialTheme.typography.labelSmall)
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Box(modifier = Modifier.size(14.dp).background(capturedSideColor, CircleShape))
            Text("×$caps", color = Color(0xFFC9B8E8), style = MaterialTheme.typography.labelMedium)
        }
    }
}

/**
 * Undo/Hint — mockup styling (gold-hairline dark pill) rendered disabled:
 * no click handler, dimmed text/border. Neither has a real backend for
 * online matches (see OnlineMatchScreen kdoc HONEST OMISSIONS) — this is an
 * honest "shown, but inert" state per the owner's finding #10 direction,
 * never a fabricated working control.
 */
@Composable
private fun DisabledActionButton(label: String, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .background(Color(0x14E8B84B), RoundedCornerShape(12.dp))
            .border(1.dp, Color(0x24E8B84B), RoundedCornerShape(12.dp))
            .padding(vertical = 12.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(label, color = Ink2.copy(alpha = 0.55f), style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
private fun TurnPill(text: String, dot: Color, bg: Color, borderColor: Color, textColor: Color) {
    Row(
        modifier = Modifier
            .background(bg, RoundedCornerShape(100.dp))
            .border(1.dp, borderColor, RoundedCornerShape(100.dp))
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Box(modifier = Modifier.size(8.dp).background(dot, CircleShape))
        Text(text, color = textColor, style = MaterialTheme.typography.labelLarge)
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

/**
 * Result takeover — the mockup's full-bleed Result screen (mobile-split.txt
 * lines 507-563): art background (the mockup's exact
 * load-victory-portrait/load-crimson-portrait assets, loss desaturated+dimmed
 * per resArtFilter), gradient scrim, "MATCH COMPLETE" eyebrow,
 * VICTORY/DEFEAT gradient title, stat tiles (Moves / Your caps / Opp caps),
 * trophy + gold pills, then Rematch / Watch replay / Back to Home / Report
 * opponent. The real rematch offer/accept/decline state machine from the
 * previous card is preserved inside the mockup's layout.
 */
@Composable
private fun MatchEndCard(
    mode: String,
    onRematch: () -> Unit,
    onAcceptRematch: () -> Unit,
    onDeclineRematch: () -> Unit,
    onWatchReplay: (String) -> Unit,
    onHome: () -> Unit
) {
    val ui by MatchRepository.state.collectAsState()
    val end = ui.end ?: return
    val isSpectating = ui.myColor == null
    val won = ui.myColor != null && end.result.winner == ui.myColor
    val draw = end.result.winner == "draw"
    var showReport by remember { mutableStateOf(false) }

    // Spectators get a neutral "who won" summary (mirrors the mockup's
    // Spectate end-card + OnlineMatchPage.tsx) — no rematch/rating framing.
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
                Text("Match Complete", color = com.filipinodama.app.ui.theme.Gold, style = MaterialTheme.typography.labelLarge)
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
                    GameButton("Home", onHome, variant = GameButtonVariant.PURPLE)
                }
            }
        }
        return
    }

    val title = when {
        end.interrupted -> "CONNECTION LOST"
        draw -> "DRAW"
        won -> "VICTORY"
        else -> "DEFEAT"
    }
    val body = when {
        end.interrupted -> "The match dropped and couldn't be recovered — no rating was affected. Start a new one below."
        end.result.reason == MatchEndReasons.RESIGN -> if (won) "Your opponent resigned." else "You resigned."
        end.result.reason == MatchEndReasons.CAPTURE_ALL -> if (won) "You captured every enemy piece." else "The enemy captured all your pieces."
        draw -> "A hard-fought draw."
        won -> "Well played."
        else -> "Better luck next time."
    }

    // Real stats: moves from the authoritative history; caps derived from the
    // final board (12 per side at start).
    val gs = ui.gameState
    val moves = gs?.history?.size ?: 0
    val myColor = ui.myColor
    val myRemaining = gs?.pieces?.count { it.color == myColor } ?: 0
    val oppRemaining = gs?.pieces?.count { it.color != myColor } ?: 0
    val myCaps = 12 - oppRemaining
    val oppCaps = 12 - myRemaining

    // Mockup style values (mobile-split.txt script lines 5029-5041).
    val eyebrowColor = if (won) Color(0xFFF0CF72) else Color(0xFFFF8F9C)
    val titleBrush = if (won || draw) Brush.verticalGradient(listOf(Color(0xFFFBE9B0), Color(0xFFE0B13C)))
    else Brush.verticalGradient(listOf(Color(0xFFF0B8BF), Color(0xFFC05563)))

    Box(modifier = Modifier.fillMaxSize()) {
        // Full-bleed result art: the mockup's exact assets. Loss gets the
        // mockup's exact `grayscale(.55) brightness(.62)` filter (resArtFilter,
        // Mobile.dc.html line ~4041) — a partial-desaturation matrix (55%
        // toward grayscale, matching CSS grayscale(.55) which blends rather
        // than fully desaturating) combined with a brightness scale of 0.62
        // on every channel.
        val lossMatrix = remember {
            // Start from the standard luminance-preserving saturation(0.45)
            // matrix (grayscale(.55) == saturation(1-.55)), then scale its
            // color-mixing coefficients by brightness 0.62 directly (a
            // saturation matrix's translation column is already zero, so
            // scaling every entry by `b` composes both effects in one pass
            // without needing a matrix-multiply operator).
            val sat = ColorMatrix().apply { setToSaturation(0.45f) }
            val b = 0.62f
            val scaled = FloatArray(20)
            for (i in 0 until 20) {
                // Leave the alpha row (indices 15-19) untouched so opacity
                // is unaffected by the brightness scale.
                scaled[i] = if (i in 15..19) sat.values[i] else sat.values[i] * b
            }
            ColorMatrix(scaled)
        }
        Image(
            painter = painterResource(if (won || draw) R.drawable.load_victory_portrait else R.drawable.load_crimson_portrait),
            contentDescription = null,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop,
            colorFilter = if (won || draw) null else ColorFilter.colorMatrix(lossMatrix)
        )
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        0f to Color(0x590B0716),
                        0.42f to Color(0x8C0B0716),
                        0.78f to Color(0xF00B0716),
                        1f to Color(0xFF0B0716)
                    )
                )
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(top = 64.dp, start = 22.dp, end = 22.dp, bottom = 22.dp)
                // Result screen is a non-tab game route with no other bottom
                // inset handling — the Rematch/Watch replay/Back/Report button
                // stack below sits flush at the very bottom, so it must clear
                // the gesture/nav bar.
                .navigationBarsPadding(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                if (end.interrupted) "MATCH INTERRUPTED" else "MATCH COMPLETE",
                color = eyebrowColor,
                style = MaterialTheme.typography.labelMedium,
                letterSpacing = 3.sp
            )
            Text(
                title,
                style = MaterialTheme.typography.displayMedium.copy(
                    fontWeight = FontWeight.ExtraBold,
                    brush = titleBrush
                ),
                modifier = Modifier.padding(top = 6.dp)
            )
            Text(
                body,
                color = Color(0xFFD8CBF0),
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 10.dp)
            )

            Box(Modifier.padding(vertical = 20.dp))

            // Stat tiles: Moves (gold) / Your caps (green) / Opp caps (red).
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                ResultStatTile(moves.toString(), "Moves", Color(0xFFF0CF72), Color(0x38E8B84B), Modifier.weight(1f))
                ResultStatTile(myCaps.toString(), "Your caps", Color(0xFF7FE0A3), Color(0x403FBF6F), Modifier.weight(1f))
                ResultStatTile(oppCaps.toString(), "Opp caps", Color(0xFFFF9AA6), Color(0x40FF5A6A), Modifier.weight(1f))
            }

            // Trophy delta + gold pills (real deltas only — trophy pill only
            // when ranked & settled; gold pill only when a reward landed).
            if (!end.interrupted && (mode == "RANKED" || end.goldReward > 0)) {
                Row(modifier = Modifier.fillMaxWidth().padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                    if (mode == "RANKED") {
                        val delta = if (myColor == PieceColors.RED) end.redTrophyDelta else end.blueTrophyDelta
                        val pos = delta >= 0
                        Row(
                            modifier = Modifier
                                .weight(1f)
                                .background(
                                    Brush.verticalGradient(
                                        if (pos) listOf(Color(0x293FBF6F), Color(0x0A3FBF6F)) else listOf(Color(0x24FF5A6A), Color(0x08FF5A6A))
                                    ),
                                    RoundedCornerShape(13.dp)
                                )
                                .border(1.dp, if (pos) Color(0x663FBF6F) else Color(0x66FF5A6A), RoundedCornerShape(13.dp))
                                .padding(vertical = 13.dp),
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            CurrencyAmount(
                                kind = CurrencyIconKind.TROPHY,
                                text = "${if (pos) "+" else ""}$delta",
                                color = if (pos) Color(0xFF7FE0A3) else Color(0xFFFF9AA6),
                                style = MaterialTheme.typography.titleSmall
                            )
                        }
                    }
                    if (end.goldReward > 0) {
                        Row(
                            modifier = Modifier
                                .weight(1f)
                                .background(
                                    Brush.verticalGradient(listOf(Color(0x29F2D493), Color(0x0AF2D493))),
                                    RoundedCornerShape(13.dp)
                                )
                                .border(1.dp, Color(0x66F2D493), RoundedCornerShape(13.dp))
                                .padding(vertical = 13.dp),
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            CurrencyAmount(
                                kind = CurrencyIconKind.COIN,
                                text = "+${end.goldReward}",
                                color = Color(0xFFF2D493),
                                style = MaterialTheme.typography.titleSmall
                            )
                        }
                    }
                }
            }

            // Button stack — mockup order: Rematch (gold), Watch replay
            // (purple-tint), Back to Home (dark), Report opponent (red-tint) —
            // with the real rematch state machine layered in.
            Column(modifier = Modifier.padding(top = 16.dp).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                when {
                    ui.offeredByOpponent && !ui.offeredByMe -> {
                        Text(
                            "${ui.opponent?.displayName ?: "Your opponent"} wants a rematch!",
                            color = GoldLt,
                            style = MaterialTheme.typography.labelLarge,
                            modifier = Modifier.align(Alignment.CenterHorizontally)
                        )
                        EndButton("✔ Accept Rematch", onAcceptRematch, EndButtonStyle.GOLD)
                        EndButton("Decline", onDeclineRematch, EndButtonStyle.DARK)
                    }
                    ui.offeredByMe -> {
                        Text(
                            "Waiting for opponent…",
                            color = Ink,
                            style = MaterialTheme.typography.labelLarge,
                            modifier = Modifier.align(Alignment.CenterHorizontally)
                        )
                        EndButton("Cancel", onDeclineRematch, EndButtonStyle.DARK)
                    }
                    else -> {
                        if (ui.rematchDeclined) {
                            Text(
                                "Opponent declined the rematch.",
                                color = Color(0xFFFF8FAE),
                                style = MaterialTheme.typography.labelLarge,
                                modifier = Modifier.align(Alignment.CenterHorizontally)
                            )
                        }
                        if (!end.interrupted) {
                            EndButton("↺ Rematch", onRematch, EndButtonStyle.GOLD)
                        }
                        ui.matchId?.let { id ->
                            if (!end.interrupted) {
                                EndButton("▶ Watch replay", { onWatchReplay(id) }, EndButtonStyle.PURPLE)
                            }
                        }
                    }
                }
                EndButton("Back to Home", onHome, EndButtonStyle.DARK)
                if (!end.interrupted && ui.opponent != null) {
                    EndButton("⚑ Report opponent", { showReport = true }, EndButtonStyle.RED)
                }
            }
        }
    }

    if (showReport) {
        val accused = ui.opponent
        if (accused != null) {
            ReportPlayerDialog(
                accusedId = accused.id,
                context = "profile",
                onClose = { showReport = false }
            )
        }
    }
}

private enum class EndButtonStyle { GOLD, PURPLE, DARK, RED }

@Composable
private fun EndButton(text: String, onClick: () -> Unit, style: EndButtonStyle) {
    val (bg, borderColor, fg) = when (style) {
        EndButtonStyle.GOLD -> Triple(
            Brush.linearGradient(listOf(Color(0xFFEFC25A), Color(0xFFC9971F))),
            Color.Transparent, Color(0xFF3A2405)
        )
        EndButtonStyle.PURPLE -> Triple(
            Brush.linearGradient(listOf(Color(0x297A4BBF), Color(0x297A4BBF))),
            Color(0x66C9A4FF), Color(0xFFD9C2FF)
        )
        EndButtonStyle.DARK -> Triple(
            Brush.linearGradient(listOf(Color(0xB31B1030), Color(0xB31B1030))),
            Color(0x47E8B84B), Color(0xFFE6DCF5)
        )
        EndButtonStyle.RED -> Triple(
            Brush.linearGradient(listOf(Color(0x0FFF5A6A), Color(0x0FFF5A6A))),
            Color(0x47FF5A6A), Color(0xFFFF9AA8)
        )
    }
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .background(bg, RoundedCornerShape(14.dp))
            .border(1.dp, borderColor, RoundedCornerShape(14.dp))
            .padding(vertical = if (style == EndButtonStyle.GOLD) 15.dp else 13.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(text, color = fg, style = MaterialTheme.typography.labelLarge)
    }
}

@Composable
private fun ResultStatTile(value: String, label: String, valueColor: Color, borderColor: Color, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .background(Color(0x990F081A), RoundedCornerShape(13.dp))
            .border(1.dp, borderColor, RoundedCornerShape(13.dp))
            .padding(vertical = 13.dp, horizontal = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(value, color = valueColor, style = MaterialTheme.typography.titleLarge)
        Text(label, color = Color(0xFF9B8BBD), style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 2.dp))
    }
}
