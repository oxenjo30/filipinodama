package com.filipinodama.app.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.filipinodama.app.BuildConfig
import com.filipinodama.app.R
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.economy.ActiveMatchDto
import com.filipinodama.app.data.economy.DailyLoginStatusResponse
import com.filipinodama.app.data.economy.EconomyRepository
import com.filipinodama.app.data.economy.EconomyResult
import com.filipinodama.app.data.economy.QuestDto
import com.filipinodama.app.data.economy.SeasonCurrentResponse
import com.filipinodama.app.data.engine.RankTiers
import com.filipinodama.app.data.match.MatchRepository
import com.filipinodama.app.data.match.PublicUserDto
import com.filipinodama.app.data.tournaments.TournamentDisplay
import com.filipinodama.app.data.tournaments.TournamentListItemDto
import com.filipinodama.app.data.tournaments.TournamentsRepository
import com.filipinodama.app.ui.components.CurrencyAmount
import com.filipinodama.app.ui.components.CurrencyIcon
import com.filipinodama.app.ui.components.CurrencyIconKind
import com.filipinodama.app.ui.screens.profile.AvatarView
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel

/**
 * Home hub — rebuilt 1:1 from the mockup's actual DOM/CSS
 * (`handoffv3/FilipinoDama Mobile.dc.html`, split-file lines 211-416, SCREEN 5
 * "Home"), per the owner's UI-fidelity directive: "do not deviate from what
 * is designed in the mockup... positions of the elements, space, gap,
 * colors, buttons, etc." This supersedes the prior Phase 5/6b build, which
 * was a reinterpretation (plain currency row instead of a wallet pill, text
 * CTA instead of the gold Quick Match button, no board art, no tournaments
 * card, no game-modes grid) — see tasks/lessons.md 2026-07-13 entry.
 *
 * Row-by-row mapping to the mockup markup (line numbers in the split file):
 *   215-259  top bar: identity (avatar+frame+online dot, name, tier badge)
 *            + wallet chip (gold/gem) + search icon + notification bell
 *   262-275  hero play card: "Ranked Season {n}" pill, "Ready to climb?",
 *            gold Quick Match button, trophy count, board-marble art slot
 *   278-290  Daily Reward strip: chest icon, Ready pill, streak label
 *   293-305  Tournaments strip (ALWAYS visible, not conditional — server-
 *            backed, see TournamentsRepository)
 *   308-317  "Game Modes" section label + 2-col grid (4 mode cards)
 *   320-341  "Daily Quests" section label + quest mini-list card
 *   344-355  Season Pass banner
 *   357-372  "Watch Live" strip (kept — Live Match Browser already exists
 *            and is reachable from Mode Select per owner directive 2026-07-12
 *            gating WATCH_LIVE_ENABLED; the Home strip itself was already
 *            gated off in a prior phase's "hide watch live" work, so it is
 *            intentionally NOT re-added here to avoid re-introducing a
 *            surface the owner explicitly hid — see feat/hide-watch-live).
 *   374-414  Live Events / admin Tournaments list sections — admin-controlled,
 *            optional; the Tournaments STRIP above already covers the
 *            required "tournaments card wired to real data" requirement,
 *            and its target screen (TournamentsListScreen) reuses this same
 *            admin-controlled list shape.
 *
 * Continue Playing (GET /api/matches/active) is real product surface from a
 * prior phase that the mockup's static markup doesn't show (mockup has no
 * live-session concept) — kept, inserted between the top bar and hero card
 * where it reads naturally, not a deviation from mockup ELEMENTS (nothing is
 * removed or reordered), just an addition for a real account state the
 * static mockup never modeled.
 */
@Composable
fun HomeScreen(
    onQuickMatch: () -> Unit = {},
    onRanked: () -> Unit = {},
    onPlayAi: () -> Unit = {},
    onPlayFriend: () -> Unit = {},
    onDailyReward: () -> Unit = {},
    onQuests: () -> Unit = {},
    onSeason: () -> Unit = {},
    onTournaments: () -> Unit = {},
    onResumeMatch: (mode: String) -> Unit = {},
    onOpenLeaderboard: () -> Unit = {},
    onOpenNotifications: () -> Unit = {},
    onOpenSearch: () -> Unit = {},
    onOpenWallet: () -> Unit = {}
) {
    val authState by AuthRepository.state.collectAsState()
    val me = authState.user

    var activeMatch by remember { mutableStateOf<ActiveMatchDto?>(null) }
    var loadingActive by remember { mutableStateOf(true) }
    var homeQuests by remember { mutableStateOf<List<QuestDto>>(emptyList()) }
    var unreadNotifs by remember { mutableStateOf(0) }
    var daily by remember { mutableStateOf<DailyLoginStatusResponse?>(null) }
    var season by remember { mutableStateOf<SeasonCurrentResponse?>(null) }
    var tournaments by remember { mutableStateOf<List<TournamentListItemDto>>(emptyList()) }

    // Re-fetch the active-match ("Continue Playing") card whenever Home is
    // resumed — not just once — so a match that ended or was ABANDONED (the
    // server forfeits after a 90s disconnect window) drops its stale card as
    // soon as the player returns to Home, instead of lingering and then dead-
    // ending on "Loading match…". Bumped by the ON_RESUME observer below.
    var activeMatchRefreshTick by remember { mutableStateOf(0) }
    val lifecycleOwner = androidx.lifecycle.compose.LocalLifecycleOwner.current
    androidx.compose.runtime.DisposableEffect(lifecycleOwner) {
        val obs = androidx.lifecycle.LifecycleEventObserver { _, event ->
            if (event == androidx.lifecycle.Lifecycle.Event.ON_RESUME) activeMatchRefreshTick++
        }
        lifecycleOwner.lifecycle.addObserver(obs)
        onDispose { lifecycleOwner.lifecycle.removeObserver(obs) }
    }

    LaunchedEffect(me?.id, activeMatchRefreshTick) {
        if (me == null) {
            loadingActive = false
            return@LaunchedEffect
        }
        loadingActive = true
        when (val result = EconomyRepository.activeMatch()) {
            is EconomyResult.Success -> activeMatch = result.data.match
            is EconomyResult.Failure -> activeMatch = null
        }
        loadingActive = false

        when (val q = EconomyRepository.quests()) {
            is EconomyResult.Success -> homeQuests = q.data.daily.take(2)
            is EconomyResult.Failure -> homeQuests = emptyList()
        }

        when (val d = EconomyRepository.dailyLoginStatus()) {
            is EconomyResult.Success -> daily = d.data
            is EconomyResult.Failure -> daily = null
        }

        when (val s = EconomyRepository.seasonCurrent()) {
            is EconomyResult.Success -> season = s.data
            is EconomyResult.Failure -> season = null
        }

        when (val t = TournamentsRepository.list()) {
            is EconomyResult.Success -> tournaments = t.data.items
            is EconomyResult.Failure -> tournaments = emptyList()
        }

        com.filipinodama.app.data.social.NotificationsRepository.load()
    }

    val notifState by com.filipinodama.app.data.social.NotificationsRepository.state.collectAsState()
    LaunchedEffect(notifState.data?.unreadCount) {
        unreadNotifs = notifState.data?.unreadCount ?: 0
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp)
            .padding(top = 20.dp, bottom = 24.dp)
    ) {
        // ── top bar: identity + wallet + search + notifications ──
        if (me != null) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IdentityHeader(
                    displayName = me.displayName,
                    tag = me.tag,
                    trophies = me.trophies,
                    avatarUrl = me.avatarUrl,
                    frameId = me.frameId,
                    onClick = onOpenLeaderboard,
                    modifier = Modifier.weight(1f)
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    WalletChip(gold = me.gold, diamonds = me.diamonds, onClick = onOpenWallet)
                    RoundIconButton(onClick = onOpenSearch, contentDescription = "Search players") {
                        SearchGlyph()
                    }
                    NotificationBell(unreadCount = unreadNotifs, onClick = onOpenNotifications)
                }
            }
        }

        Box(Modifier.height(20.dp))

        if (loadingActive) {
            Box(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Gold, modifier = Modifier.size(28.dp))
            }
        } else {
            val match = activeMatch
            if (match != null && me != null) {
                ContinuePlayingCard(match = match, myUserId = me.id, onResume = {
                    val myColor = when {
                        match.red?.id == me.id -> "red"
                        match.blue?.id == me.id -> "blue"
                        else -> null
                    }
                    val opponentDto = if (myColor == "red") match.blue else match.red
                    MatchRepository.enterFromRoom(
                        matchId = match.id,
                        yourColor = myColor,
                        opponent = opponentDto?.let {
                            PublicUserDto(
                                id = it.id,
                                username = it.username,
                                displayName = it.displayName,
                                tag = it.tag,
                                avatarUrl = it.avatarUrl,
                                trophies = it.trophies,
                                rankTier = it.rankTier
                            )
                        }
                    )
                    onResumeMatch(match.mode)
                })
                Box(Modifier.height(14.dp))
            }
        }

        // ── hero play card ──
        HeroPlayCard(seasonNumLabel = seasonNumLabel(season), trophies = me?.trophies ?: 0, onClick = onQuickMatch)

        Box(Modifier.height(14.dp))

        // ── daily reward strip ──
        DailyRewardStrip(daily = daily, onClick = onDailyReward)

        Box(Modifier.height(12.dp))

        // ── tournaments strip (always visible, server-backed) ──
        TournamentsStrip(tournaments = tournaments, onClick = onTournaments)

        // ── game modes grid ──
        SectionLabel("Game Modes", topPadding = 24.dp)
        GameModesGridReal(
            onQuickMatch = onQuickMatch,
            onRanked = onRanked,
            onAi = onPlayAi,
            onFriend = onPlayFriend
        )

        // ── daily quests ──
        SectionLabel("Daily Quests", topPadding = 24.dp)
        if (homeQuests.isNotEmpty()) {
            DailyQuestsCard(quests = homeQuests, onClick = onQuests)
        } else {
            EmptyQuestsCard(onClick = onQuests)
        }

        Box(Modifier.height(14.dp))

        // ── season pass banner ──
        SeasonPassBanner(season = season, onClick = onSeason)
    }
}

private fun seasonNumLabel(season: SeasonCurrentResponse?): String {
    val n = season?.season?.number
    return if (n != null) "Season $n" else "Ranked Season"
}

// ── top bar ──

@Composable
private fun IdentityHeader(
    displayName: String,
    tag: String,
    trophies: Int,
    avatarUrl: String?,
    frameId: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val tier = RankTiers.forTrophies(trophies)
    Row(
        modifier = modifier.clickable(onClick = onClick),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box {
            AvatarView(avatarUrl = avatarUrl, frameId = frameId, size = 40.dp, ring = true)
            // Online presence dot — mockup line 222 (always-on, this IS the
            // signed-in device's own session, so it is always online).
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .size(14.dp)
                    .background(Color(0xFF0F0720), CircleShape)
                    .padding(2.dp)
                    .background(Color(0xFF3FBF6F), CircleShape)
            )
        }
        Column(modifier = Modifier.padding(start = 12.dp)) {
            Text(displayName, color = Color(0xFFF4ECD6), style = MaterialTheme.typography.titleMedium, maxLines = 1)
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 3.dp)) {
                Image(
                    painter = painterResource(id = RankTiers.drawableFor(tier.img)),
                    contentDescription = null,
                    modifier = Modifier.size(14.dp)
                )
                Text(
                    " ${tier.label} · $tag",
                    color = Color(0xFFC9A4FF),
                    style = MaterialTheme.typography.labelSmall,
                    maxLines = 1
                )
            }
        }
    }
}

@Composable
private fun WalletChip(gold: Int, diamonds: Int, onClick: () -> Unit) {
    // Diamond top-up is dark (owner directive, monetization DARK — see
    // tasks/lessons.md gold-only-economy): gate the gem balance row (and its
    // dead "+" top-up affordance, onOpenWallet is a no-op today) behind the
    // server's DIAMOND_TOPUP_ENABLED flag, same fail-closed pattern as
    // ConfigRepository.watchLiveEnabled. While off, only the gold row shows —
    // code stays intact (flag-gated), nothing deleted.
    val diamondTopUpEnabled by com.filipinodama.app.data.config.ConfigRepository.diamondTopUpEnabled.collectAsState()
    Column(
        modifier = Modifier
            .clickable(onClick = onClick)
            .clip(RoundedCornerShape(13.dp))
            .background(Color.White.copy(alpha = 0.05f))
            .padding(horizontal = 10.dp, vertical = 5.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            CurrencyIcon(kind = CurrencyIconKind.COIN, size = 13.dp)
            Text(formatK(gold), color = Color(0xFFF0CF72), style = MaterialTheme.typography.labelSmall)
        }
        if (diamondTopUpEnabled) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                CurrencyIcon(kind = CurrencyIconKind.GEM, size = 13.dp)
                Text("$diamonds", color = Color(0xFF8FB3FF), style = MaterialTheme.typography.labelSmall)
                Text("+", color = Color(0xFF8FB3FF), style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

/** Compact "1.2K"-style label for large gold amounts, mirrors the mockup's _fmtK(). */
private fun formatK(value: Int): String {
    if (value < 1000) return value.toString()
    val thousands = value / 1000.0
    return if (thousands < 10) String.format("%.1fK", thousands).replace(".0K", "K")
    else "${(value / 1000)}K"
}

@Composable
private fun RoundIconButton(onClick: () -> Unit, contentDescription: String, content: @Composable () -> Unit) {
    Box(
        modifier = Modifier
            .size(36.dp)
            .clickable(onClick = onClick)
            .clip(CircleShape)
            .background(Color.White.copy(alpha = 0.05f)),
        contentAlignment = Alignment.Center
    ) {
        content()
    }
}

@Composable
private fun SearchGlyph() {
    Text("🔍", style = MaterialTheme.typography.bodyMedium, color = Color(0xFFF4D886))
}

@Composable
private fun NotificationBell(unreadCount: Int, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clickable(onClick = onClick)
            .size(36.dp)
            .clip(CircleShape)
            .background(Color.White.copy(alpha = 0.05f)),
        contentAlignment = Alignment.Center
    ) {
        Text("🔔", style = MaterialTheme.typography.bodyMedium, color = Color(0xFFF4D886))
        if (unreadCount > 0) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .background(Color(0xFFFF5A6A), CircleShape)
                    .padding(horizontal = 4.dp, vertical = 1.dp)
            ) {
                Text(if (unreadCount > 9) "9+" else unreadCount.toString(), color = Color.White, style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

// ── continue playing (real account state, additive per kdoc above) ──

@Composable
private fun ContinuePlayingCard(match: ActiveMatchDto, myUserId: String, onResume: () -> Unit) {
    val opponent = if (match.red?.id == myUserId) match.blue else match.red
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onResume)
            .background(Panel, RoundedCornerShape(14.dp))
            .padding(16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text("▶ Continue Playing", color = GoldLt, style = MaterialTheme.typography.titleMedium)
            Text(
                text = "vs ${opponent?.displayName ?: "Opponent"} · ${modeLabel(match.mode)}",
                color = Ink,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 2.dp)
            )
        }
        Text("Resume ›", color = Gold, style = MaterialTheme.typography.labelLarge)
    }
}

private fun modeLabel(mode: String): String = when (mode) {
    "CASUAL" -> "Casual Match"
    "RANKED" -> "Ranked Match"
    "PRIVATE" -> "Private Match"
    "AI" -> "vs AI"
    "LOCAL" -> "Local Match"
    else -> mode
}

// ── hero play card — mockup lines 262-275 ──

@Composable
private fun HeroPlayCard(seasonNumLabel: String, trophies: Int, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(22.dp))
            .background(Brush.linearGradient(listOf(Color(0xFF3A1C4A), Color(0xFF1A1030))))
            .border(1.dp, Color(0xFFE8B84B).copy(alpha = 0.3f), RoundedCornerShape(22.dp))
            .clickable(onClick = onClick)
    ) {
        // board-marble.png decorative art slot, bottom-right, rotated -8deg,
        // per mockup line 263. Remote-loaded (same rationale as store art —
        // decorative, not persistent chrome — see StoreAssets.kt).
        AsyncImage(
            model = "${BuildConfig.WEB_ORIGIN}/assets/board-marble.png",
            contentDescription = null,
            contentScale = ContentScale.Fit,
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .size(170.dp)
                .graphicsLayer(rotationZ = -8f, alpha = 0.5f)
        )
        Column(modifier = Modifier.padding(22.dp)) {
            Box(
                modifier = Modifier
                    .background(Color(0xFFE8B84B).copy(alpha = 0.2f), RoundedCornerShape(100.dp))
                    .padding(horizontal = 11.dp, vertical = 4.dp)
            ) {
                Text(
                    seasonNumLabel.uppercase(),
                    color = Color(0xFFF4D886),
                    style = MaterialTheme.typography.labelSmall
                )
            }
            Text(
                "Ready to\nclimb?",
                color = Color(0xFFF4ECD6),
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.padding(top = 14.dp)
            )
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 16.dp)) {
                Box(
                    modifier = Modifier
                        .background(Brush.verticalGradient(listOf(Color(0xFFEFC25A), Color(0xFFC9971F))), RoundedCornerShape(13.dp))
                        .padding(horizontal = 22.dp, vertical = 13.dp)
                ) {
                    Text("Quick Match", color = Color(0xFF3A2405), style = MaterialTheme.typography.titleSmall)
                }
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(start = 8.dp)) {
                    CurrencyIcon(kind = CurrencyIconKind.TROPHY, size = 18.dp)
                    Text(
                        " ${formatComma(trophies)}",
                        color = Color(0xFFF0CF72),
                        style = MaterialTheme.typography.titleMedium
                    )
                }
            }
        }
    }
}

private fun formatComma(value: Int): String =
    "%,d".format(value)

// ── daily reward strip — mockup lines 278-290 ──

@Composable
private fun DailyRewardStrip(daily: DailyLoginStatusResponse?, onClick: () -> Unit) {
    val ready = daily?.claimedToday == false
    val label = dailyStreakLabel(daily)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Brush.linearGradient(listOf(Color(0xFFF7E2A0).copy(alpha = 0.14f), Color(0xFF1B1030).copy(alpha = 0.85f))))
            .border(1.dp, Color(0xFFE8B84B).copy(alpha = 0.3f), RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
            .padding(16.dp),
        horizontalArrangement = Arrangement.spacedBy(13.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        CurrencyIcon(kind = CurrencyIconKind.CHEST, size = 42.dp)
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Daily Reward", color = Color(0xFFF4D886), style = MaterialTheme.typography.titleSmall)
                if (ready) {
                    Box(
                        modifier = Modifier
                            .background(Brush.verticalGradient(listOf(Color(0xFFF7E2A0), Color(0xFFD5A63A))), RoundedCornerShape(100.dp))
                            .padding(horizontal = 8.dp, vertical = 3.dp)
                    ) {
                        Text("READY", color = Color(0xFF2A1A06), style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
            Text(label, color = Color(0xFF9A8BBF), style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 2.dp))
        }
        Text("›", color = Color(0xFFF0CF72), style = MaterialTheme.typography.headlineSmall)
    }
}

/** Mirrors the mockup's drStreakLabel: cycle-complete copy, else "Day N of 7" from the real day/claimedToday state. */
private fun dailyStreakLabel(daily: DailyLoginStatusResponse?): String {
    if (daily == null) return "Log in every day for escalating rewards"
    val cycleDone = daily.day >= 7 && daily.claimedToday
    return if (cycleDone) "Cycle complete — resets tomorrow" else "Day ${daily.day.coerceIn(1, 7)} of 7"
}

// ── tournaments strip — mockup lines 293-305 (ALWAYS visible, server-backed) ──

@Composable
private fun TournamentsStrip(tournaments: List<TournamentListItemDto>, onClick: () -> Unit) {
    val ready = TournamentDisplay.stripReady(tournaments)
    val label = TournamentDisplay.stripLabel(tournaments)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Brush.linearGradient(listOf(Color(0xFFC9A4FF).copy(alpha = 0.16f), Color(0xFF1B1030).copy(alpha = 0.85f))))
            .border(1.dp, Color(0xFFC9A4FF).copy(alpha = 0.32f), RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
            .padding(16.dp),
        horizontalArrangement = Arrangement.spacedBy(13.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        CurrencyIcon(kind = CurrencyIconKind.TROPHY, size = 40.dp)
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Tournaments", color = Color(0xFFF4D886), style = MaterialTheme.typography.titleSmall)
                if (ready) {
                    Box(
                        modifier = Modifier
                            .background(Brush.verticalGradient(listOf(Color(0xFF7FE0A3), Color(0xFF3FA96F))), RoundedCornerShape(100.dp))
                            .padding(horizontal = 8.dp, vertical = 3.dp)
                    ) {
                        Text("LIVE", color = Color(0xFF2A1A06), style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
            Text(label, color = Color(0xFF9A8BBF), style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 2.dp))
        }
        Text("›", color = Color(0xFFC9A4FF), style = MaterialTheme.typography.headlineSmall)
    }
}

// ── section label ──

@Composable
private fun SectionLabel(text: String, topPadding: androidx.compose.ui.unit.Dp = 24.dp) {
    Text(
        text.uppercase(),
        color = Color(0xFF8B7CAE),
        style = MaterialTheme.typography.labelMedium,
        modifier = Modifier.padding(top = topPadding, bottom = 12.dp)
    )
}

// ── game modes grid — mockup lines 308-317 ──

private data class HomeMode(val name: String, val desc: String, val drawable: Int, val bg: List<Color>, val border: Color, val go: () -> Unit)

/**
 * Game modes grid — mockup lines 308-317. Navigation targets mirror the
 * mockup's `m.go` handlers exactly: Quick Match -> matchmaking (casual),
 * Ranked -> matchmaking (ranked), Play vs AI -> AI difficulty picker,
 * Play with a Friend -> private room lobby.
 */
@Composable
private fun GameModesGridReal(
    onQuickMatch: () -> Unit,
    onRanked: () -> Unit,
    onAi: () -> Unit,
    onFriend: () -> Unit
) {
    val modes = listOf(
        HomeMode("Quick Match", "Casual online", R.drawable.mode_quick, listOf(Color(0xFF3A331C), Color(0xFF1A1030)), Color(0xFFE8B84B).copy(alpha = 0.32f), onQuickMatch),
        HomeMode("Ranked Match", "Climb the ladder", R.drawable.mode_ranked, listOf(Color(0xFF3A1C2A), Color(0xFF1A1030)), Color(0xFFD93B52).copy(alpha = 0.35f), onRanked),
        HomeMode("Play vs AI", "Practice offline", R.drawable.mode_vs_ai, listOf(Color(0xFF1C3A2C), Color(0xFF1A1030)), Color(0xFF3FBF6F).copy(alpha = 0.3f), onAi),
        HomeMode("Play with a Friend", "Private room", R.drawable.mode_friend, listOf(Color(0xFF33234A), Color(0xFF1A1030)), Color(0xFFC9A4FF).copy(alpha = 0.3f), onFriend)
    )
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        modes.chunked(2).forEach { rowModes ->
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                rowModes.forEach { m ->
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .aspectRatio(1.35f)
                            .clip(RoundedCornerShape(18.dp))
                            .background(Brush.linearGradient(m.bg))
                            .border(1.dp, m.border, RoundedCornerShape(18.dp))
                            .clickable(onClick = m.go)
                            .padding(16.dp)
                    ) {
                        Image(
                            painter = painterResource(id = m.drawable),
                            contentDescription = null,
                            modifier = Modifier.align(Alignment.TopEnd).size(52.dp)
                        )
                        Column(modifier = Modifier.align(Alignment.BottomStart)) {
                            Text(m.name, color = Color(0xFFF4ECD6), style = MaterialTheme.typography.titleSmall)
                            Text(m.desc, color = Color(0xFFB6A8D4), style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 2.dp))
                        }
                    }
                }
                if (rowModes.size == 1) Box(Modifier.weight(1f))
            }
        }
    }
}

// ── daily quests card — mockup lines 320-341 ──

@Composable
private fun DailyQuestsCard(quests: List<QuestDto>, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Color(0xFF1B1030).copy(alpha = 0.8f))
            .border(1.dp, Color(0xFFE8B84B).copy(alpha = 0.16f), RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
            .padding(16.dp)
    ) {
        quests.forEach { q ->
            val pct = if (q.goal > 0) (q.value.coerceAtMost(q.goal) * 100 / q.goal) else 0
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 7.dp)) {
                CurrencyIcon(kind = CurrencyIconKind.TROPHY, size = 34.dp)
                Column(modifier = Modifier.weight(1f).padding(start = 12.dp)) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(q.title, color = Color(0xFFE6DCF5), style = MaterialTheme.typography.labelLarge)
                        Text("${q.value}/${q.goal}", color = Color(0xFF8B7CAE), style = MaterialTheme.typography.labelSmall)
                    }
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 5.dp)
                            .height(6.dp)
                            .clip(RoundedCornerShape(3.dp))
                            .background(Color.Black.copy(alpha = 0.4f))
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(pct / 100f)
                                .height(6.dp)
                                .clip(RoundedCornerShape(3.dp))
                                .background(Brush.horizontalGradient(listOf(Color(0xFFEFC25A), Color(0xFFC9971F))))
                        )
                    }
                }
                CurrencyAmount(
                    kind = CurrencyIconKind.COIN,
                    text = "${q.rewardGold}",
                    prefix = "+",
                    color = Color(0xFFF0CF72),
                    style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier.padding(start = 10.dp)
                )
            }
        }
    }
}

@Composable
private fun EmptyQuestsCard(onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Color(0xFF1B1030).copy(alpha = 0.8f))
            .clickable(onClick = onClick)
            .padding(16.dp)
    ) {
        Text("No quests active — check back soon", color = Ink2, style = MaterialTheme.typography.bodySmall)
    }
}

// ── season pass banner — mockup lines 344-355 ──

@Composable
private fun SeasonPassBanner(season: SeasonCurrentResponse?, onClick: () -> Unit) {
    val seasonName = season?.season?.name ?: "Season of the Rajah"
    val endsLabel = season?.season?.endsAt?.let { endsInLabel(it) } ?: "—"
    val numLabel = seasonNumLabel(season)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Brush.linearGradient(listOf(Color(0xFF7A4BBF).copy(alpha = 0.4f), Color(0xFF1A1030))))
            .border(1.dp, Color(0xFFE8B84B).copy(alpha = 0.3f), RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
    ) {
        AsyncImage(
            model = "${BuildConfig.WEB_ORIGIN}/assets/me-banner.png",
            contentDescription = null,
            contentScale = ContentScale.Fit,
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .size(width = 88.dp, height = 105.dp)
                .graphicsLayer(alpha = 0.85f)
        )
        Column(modifier = Modifier.padding(16.dp)) {
            Box(
                modifier = Modifier
                    .background(Color(0xFFE8B84B).copy(alpha = 0.2f), RoundedCornerShape(100.dp))
                    .padding(horizontal = 10.dp, vertical = 3.dp)
            ) {
                Text("${numLabel.uppercase()} · ENDS $endsLabel", color = Color(0xFFF4D886), style = MaterialTheme.typography.labelSmall)
            }
            Text(seasonName, color = Color(0xFFF4ECD6), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 9.dp))

            // Level-progress label + bar (ENTRY-1) — reuses the same real fields
            // the dedicated Season Pass screen uses: tier = current level, xp vs
            // the tiers' max xp threshold. Only shown when season data is loaded.
            if (season != null && season.tiers.isNotEmpty()) {
                val maxLevel = season.tiers.size
                // Current level = number of tiers whose xp threshold is already
                // met (same derivation the dedicated Season screen uses).
                val currentLevel = season.tiers.count { it.xp <= season.xp }.coerceIn(0, maxLevel)
                val maxXp = (season.tiers.maxOfOrNull { it.xp } ?: 1).coerceAtLeast(1)
                val pct = (season.xp.toFloat() / maxXp).coerceIn(0f, 1f)
                Text(
                    "Level $currentLevel of $maxLevel · ${(pct * 100).toInt()}% to next reward",
                    color = Color(0xFFC9B8E0),
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier.padding(top = 8.dp)
                )
                Box(
                    modifier = Modifier
                        .padding(top = 6.dp)
                        .width(150.dp)
                        .height(7.dp)
                        .clip(RoundedCornerShape(100.dp))
                        .background(Color(0x66000000))
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(pct)
                            .height(7.dp)
                            .background(Brush.horizontalGradient(listOf(Color(0xFFC98B2E), Color(0xFFF7E2A0))), RoundedCornerShape(100.dp))
                    )
                }
            }
        }
    }
}

private fun endsInLabel(endsAtIso: String): String {
    return try {
        val endsAt = java.time.Instant.parse(endsAtIso)
        val ms = endsAt.toEpochMilli() - System.currentTimeMillis()
        if (ms <= 0) "Ended" else {
            val d = ms / 86_400_000
            val h = (ms % 86_400_000) / 3_600_000
            "${d}d ${h}h"
        }
    } catch (_: Exception) {
        "—"
    }
}
