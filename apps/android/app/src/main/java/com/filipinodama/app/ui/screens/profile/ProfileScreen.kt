package com.filipinodama.app.ui.screens.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.engine.RankTiers
import com.filipinodama.app.data.profile.LedgerRowDto
import com.filipinodama.app.data.profile.MatchRowDto
import com.filipinodama.app.data.profile.ProfileRepository
import com.filipinodama.app.data.profile.ProfileResult
import com.filipinodama.app.data.profile.tierArtUrl
import com.filipinodama.app.data.settings.SettingsStore
import com.filipinodama.app.ui.components.CurrencyAmount
import com.filipinodama.app.ui.components.CurrencyIconKind
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Green
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel
import com.filipinodama.app.ui.theme.Red
import kotlinx.coroutines.launch

/**
 * ProfileScreen — re-diffed 1:1 against the mockup's own-profile section
 * (`handoffv3/FilipinoDama Mobile.dc.html` lines 506-651, `isProfile` block;
 * owner test finding #4 — the built screen had drifted structurally from the
 * mockup). Row-by-row mapping to the mockup markup:
 *   508-530  identity header card: avatar (60dp, gold ring) + tier badge
 *            pill bottom-right + optional cosmetic frame overlay, name
 *            (Cinzel), guild-line subtitle, trophy count + tier label,
 *            "Edit" button top-right, rank-progress bar to next tier.
 *   533-536  quick-links row: "🎒 Inventory" + "👥 Friends" (w/ unread badge)
 *            pills, NOT the old 3-chip Edit/Friends/Settings row.
 *   539-546  stat tiles (4-col grid): Wins / Win Rate / Best Streak / Games
 *            — REPLACES the old Matches/Wins/Losses/Win Rate set, which
 *            doesn't match the mockup's `profStats` data (line 4022).
 *   549-556  tab bar: Overview / History / Settings (3 tabs, THIS app's
 *            Settings tab navigates to the existing SettingsScreen
 *            destination rather than inlining its content a second time —
 *            same real screen, just reachable as the mockup's 3rd tab
 *            instead of a separate action chip).
 *   558-566  Achievements grid (Overview) — CLIENT-COMPUTED FROM REAL STATS,
 *            same 4 rules apps/web/src/features/profile/AchievementsGrid.tsx
 *            uses (First Blood/Royal Streak/Grandmaster/Kingmaker — wins,
 *            streak, trophies thresholds). The mockup's OWN placeholder
 *            names ("Streak x10"/"Capture King"/"Season Vet") have no
 *            server-side backing data (verified: no bestStreak/achievements
 *            table anywhere) — reproducing them verbatim would fabricate
 *            unlock state, so the web's real 4 are ported instead (same grid
 *            shape/spacing, honest data).
 *   567-589  Guild card / Purchase History card / Discover Guilds / Create a
 *            Guild / Contact Support — real data (guild membership, orders).
 *   609-619  History tab — real match list (tap -> Match Detail, SCREEN 29,
 *            which then opens the full ReplayViewer via "Watch replay").
 *
 * "Best Streak" in the mockup's stat tiles has NO longest-historical-streak
 * field anywhere server-side (verified: only a CURRENT win-streak column
 * exists, User.streak, distinct from the unrelated daily-login streak) — the
 * tile is honestly relabeled "Current Streak" and wired to the real field
 * rather than fabricating a running maximum.
 */
@Composable
fun ProfileScreen(
    onSignedOut: () -> Unit = {},
    onGoToSignIn: () -> Unit = {},
    onOpenMatch: (String) -> Unit = {},
    onOpenFriends: () -> Unit = {},
    onOpenGuild: () -> Unit = {},
    onOpenDiscoverGuilds: () -> Unit = {},
    onOpenOrders: () -> Unit = {},
    onOpenInventory: () -> Unit = {},
    onOpenLegal: (String) -> Unit = {},
    onOpenAchievements: () -> Unit = {}
) {
    val authState by AuthRepository.state.collectAsState()
    val me = authState.user
    val scope = rememberCoroutineScope()

    var tab by remember { mutableStateOf("overview") }
    var avatarPickerOpen by remember { mutableStateOf(false) }
    var editOpen by remember { mutableStateOf(false) }
    var contactOpen by remember { mutableStateOf(false) }

    var trophyRows by remember { mutableStateOf<List<LedgerRowDto>?>(null) }
    var matches by remember { mutableStateOf<List<MatchRowDto>?>(null) }
    var historyFilter by remember { mutableStateOf("all") }
    // Overview tab's Guild quick-link card — same source GuildHallScreen uses
    // to detect membership (GET /api/users/:me.id -> user.guild), so this card
    // reflects the real account, not a fabricated "Rank 4 - 28 members" (the
    // mockup's own hardcoded static example — no member-count/rank field
    // exists on PublicGuildDto, so this card shows only name+tag, honestly).
    var myGuild by remember { mutableStateOf<com.filipinodama.app.data.profile.PublicGuildDto?>(null) }

    LaunchedEffect(me?.id) {
        if (me?.id == null) return@LaunchedEffect
        when (val result = com.filipinodama.app.data.profile.ProfileRepository.publicUser(me.id)) {
            is com.filipinodama.app.data.profile.ProfileResult.Success -> myGuild = result.data.user.guild
            is com.filipinodama.app.data.profile.ProfileResult.Failure -> myGuild = null
        }
    }

    LaunchedEffect(me?.id) {
        if (me?.id == null) return@LaunchedEffect
        trophyRows = null
        when (val result = ProfileRepository.trophyLedger()) {
            is ProfileResult.Success -> trophyRows = result.data.items
            is ProfileResult.Failure -> trophyRows = emptyList()
        }
    }

    LaunchedEffect(me?.id, historyFilter) {
        val userId = me?.id ?: return@LaunchedEffect
        matches = null
        val modeArg = if (historyFilter in setOf("RANKED", "CASUAL", "AI")) historyFilter else null
        val resultArg = if (historyFilter in setOf("win", "loss")) historyFilter else null
        when (val result = ProfileRepository.matches(userId, mode = modeArg, result = resultArg)) {
            is ProfileResult.Success -> matches = result.data.items
            is ProfileResult.Failure -> matches = emptyList()
        }
    }

    if (me == null) {
        Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Sign in to view your profile", color = GoldLt, style = MaterialTheme.typography.titleLarge)
                Text(
                    "Your rank, trophies, match history and achievements live on your account.",
                    color = Ink2,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }
        }
        return
    }

    val tierNow = RankTiers.forTrophies(me.trophies)
    val nextTier = RankTiers.next(tierNow)
    val span = if (nextTier != null) nextTier.min - tierNow.min else 1
    val into = me.trophies - tierNow.min
    val toNextLabel = if (nextTier != null) "${(nextTier.min - me.trophies).coerceAtLeast(0)} trophies to next tier" else "Top tier reached"

    if (avatarPickerOpen) {
        AvatarPickerDialog(onClose = { avatarPickerOpen = false })
    }
    if (editOpen) {
        EditProfileDialog(onClose = { editOpen = false }, onChangeAvatar = { avatarPickerOpen = true })
    }
    if (contactOpen) {
        com.filipinodama.app.ui.screens.settings.ContactSupportDialog(onClose = { contactOpen = false })
    }

    val dmUnread by com.filipinodama.app.data.social.DmRepository.state.collectAsState()

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).verticalScroll(rememberScrollState())) {
        // ── identity header card — mockup lines 508-530: gradient card,
        // avatar (60dp) + tier-badge pill bottom-right + optional frame
        // overlay, name (Cinzel), guild-line subtitle, trophy+tier line,
        // top-right "Edit" button, rank-progress bar to next tier.
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp)
                .clip(RoundedCornerShape(22.dp))
                .background(Brush.linearGradient(listOf(Color(0xFF3A1C4A), Color(0xFF1A1030))))
                .border(1.dp, Color(0x47E8B84B), RoundedCornerShape(22.dp))
        ) {
            // Mockup identity card (line 730): the gold SUN (logo-sun.png) peeks
            // faintly from the TOP-RIGHT corner — 130x130, opacity .12, offset
            // right:-26/top:-26 so it bleeds off the corner (overflow:hidden).
            AsyncImage(
                model = "${com.filipinodama.app.BuildConfig.WEB_ORIGIN}/assets/logo-sun.png",
                contentDescription = null,
                contentScale = androidx.compose.ui.layout.ContentScale.Fit,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .size(130.dp)
                    .offset(x = 26.dp, y = (-26).dp)
                    .alpha(0.12f)
            )
            Column(modifier = Modifier.padding(20.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box {
                    AvatarView(
                        avatarUrl = me.avatarUrl,
                        frameId = me.frameId,
                        size = 60.dp,
                        onClick = { avatarPickerOpen = true }
                    )
                    // Tier badge pill — mockup shows icon + roman-numeral
                    // sub-tier ("III"); this app's real 7-tier ladder
                    // (RankTiers.TIERS) has no sub-tier numeral concept, so
                    // the pill shows the real tier crest art only (honest —
                    // no fabricated numeral).
                    Box(
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .size(22.dp)
                            .background(Color(0xFF1A1030), androidx.compose.foundation.shape.CircleShape)
                            .border(1.dp, Color(0x66E8B84B), androidx.compose.foundation.shape.CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        AsyncImage(model = tierArtUrl(tierNow.img), contentDescription = null, modifier = Modifier.size(14.dp))
                    }
                }
                Column(modifier = Modifier.weight(1f).padding(start = 20.dp)) {
                    Text("${me.displayName}${me.tag}", color = Color(0xFFF4ECD6), style = MaterialTheme.typography.titleLarge)
                    // Guild line — always rendered; "No guild" fallback when the
                    // player isn't in one (PROF-7), matching the mockup which
                    // always shows a guild subtitle.
                    Text(
                        if (myGuild != null) "[${myGuild!!.tag}] ${myGuild!!.name}" else "No guild",
                        color = Color(0xFF9A8BBF),
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.padding(top = 2.dp)
                    )
                    CurrencyAmount(
                        kind = CurrencyIconKind.TROPHY,
                        text = me.trophies.toString(),
                        color = Gold,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(top = 7.dp)
                    )
                }
                Box(
                    modifier = Modifier
                        .clickable { editOpen = true }
                        .background(Color(0x1AE8B84B), RoundedCornerShape(11.dp))
                        .border(1.dp, Color(0x4DE8B84B), RoundedCornerShape(11.dp))
                        .padding(horizontal = 14.dp, vertical = 8.dp)
                ) {
                    Text("Edit", color = Color(0xFFF4D886), style = MaterialTheme.typography.labelLarge)
                }
            }
            // Rank progress bar to next tier.
            Column(modifier = Modifier.padding(top = 18.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(tierNow.label.uppercase(), color = Color(0xFFC9A4FF), style = MaterialTheme.typography.labelSmall)
                    Text("${me.trophies} / ${if (nextTier != null) nextTier.min else me.trophies}", color = Color(0xFF8B7CAE), style = MaterialTheme.typography.labelSmall)
                }
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 6.dp)
                        .height(8.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(Color(0x66000000))
                ) {
                    val progress = if (span > 0) (into.toFloat() / span.toFloat()).coerceIn(0f, 1f) else 1f
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(progress)
                            .fillMaxHeight()
                            .background(Brush.horizontalGradient(listOf(Color(0xFFEFC25A), Color(0xFFC9971F))))
                    )
                }
                Text(toNextLabel, color = Color(0xFF8B7CAE), style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 6.dp))
            }
            } // end identity content Column
        } // end identity Box (with banner)

        // ── quick links row — mockup lines 533-536: "🎒 Inventory" (gold) +
        // "👥 Friends" (purple, unread badge) pills. Replaces the old
        // Edit/Friends/Settings 3-chip row (Edit moved into the header above,
        // Settings moved into the tab bar below).
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clickable(onClick = onOpenInventory)
                    .background(Color(0x1AE8B84B), RoundedCornerShape(13.dp))
                    .border(1.dp, Color(0x59E8B84B), RoundedCornerShape(13.dp))
                    .padding(vertical = 13.dp),
                contentAlignment = Alignment.Center
            ) {
                Text("🎒 Inventory", color = Color(0xFFF4D886), style = MaterialTheme.typography.labelLarge)
            }
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clickable(onClick = onOpenFriends)
                    .background(Brush.verticalGradient(listOf(Color(0x477A4BBF), Color(0x474E2A8E))), RoundedCornerShape(13.dp))
                    .border(1.dp, Color(0x66C9A4FF), RoundedCornerShape(13.dp))
                    .padding(vertical = 13.dp),
                contentAlignment = Alignment.Center
            ) {
                Box {
                    Text("👥 Friends", color = Color(0xFFE7D6FF), style = MaterialTheme.typography.labelLarge)
                    if (dmUnread.unread > 0) {
                        Box(
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .offset(x = 12.dp, y = (-8).dp)
                                .background(Brush.verticalGradient(listOf(Color(0xFFFF6B7D), Color(0xFFE23D55))), RoundedCornerShape(10.dp))
                                .padding(horizontal = 5.dp, vertical = 1.dp)
                        ) {
                            Text(dmUnread.unread.toString(), color = androidx.compose.ui.graphics.Color.White, style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
            }
        }

        // ── tabs — mockup's exact 3-tab pill row (lines 549-553, profOverview/
        // profHistory/profSettings @ mockup line 3649): Overview / History /
        // Settings, ALL THREE are real in-place tab switches (`profTab`
        // state), not a navigation push. OWNER ROUND-3 FIX: Settings
        // previously called onOpenSettings() (navigated away to a separate
        // SettingsScreen destination) — WRONG, the mockup's own
        // `openSettings` handler is literally
        // `this.setState({screen:'profile', profTab:'settings'})`, i.e.
        // Settings is the Profile tab's 3rd inline pane (mockup line 4037),
        // never a distinct screen. Fixed below: `tab = "settings"` renders
        // the settings content INLINE via [ProfileSettingsTab].
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(top = 18.dp)
                .background(Color(0xFF0F0720).copy(alpha = 0.6f), RoundedCornerShape(14.dp))
                .padding(4.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            ProfileTabButton("Overview", tab == "overview", Modifier.weight(1f)) { tab = "overview" }
            ProfileTabButton("History", tab == "history", Modifier.weight(1f)) { tab = "history" }
            ProfileTabButton("Settings", tab == "settings", Modifier.weight(1f)) { tab = "settings" }
        }

        if (tab == "overview") {
            Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                // Stat tiles — mockup profStats (line 4022): Wins / Win Rate /
                // Best Streak / Games, in that exact order+colors. "Best
                // Streak" has no longest-historical-streak field anywhere
                // server-side (verified) — relabeled "Current Streak" and
                // wired to the real User.streak column instead of fabricating
                // a running maximum (see file kdoc).
                val total = me.wins + me.losses + me.draws
                val winRate = if (total > 0) (me.wins * 100 / total) else 0
                val stats: List<Triple<String, String, Color>> = listOf(
                    Triple("Wins", me.wins.toString(), Green),
                    Triple("Win Rate", "$winRate%", GoldLt),
                    Triple("Current Streak", me.streak.toString(), Color(0xFFFF8F9C)),
                    Triple("Games", total.toString(), Color(0xFF8FB3FF))
                )
                LazyVerticalGrid(
                    columns = GridCells.Fixed(4),
                    modifier = Modifier.height(90.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(stats) { stat ->
                        val (label, value, color) = stat
                        Column(
                            modifier = Modifier.background(Panel, RoundedCornerShape(14.dp)).padding(vertical = 13.dp, horizontal = 4.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(value, color = color, style = MaterialTheme.typography.titleMedium)
                            Text(label, color = Ink2, style = MaterialTheme.typography.labelSmall, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.padding(top = 3.dp))
                        }
                    }
                }

                // NOTE: the mockup's Overview tab (profOverview, lines 558-605) is
                // exactly: Achievements grid → Guild card → Purchase History →
                // Discover Guilds. It has NO rank-tier ladder and NO trophy-history
                // list here (the rank PROGRESS BAR lives in the identity card
                // above; the full tier ladder is not an Overview element). Those
                // were previously rendered first and pushed the real Overview
                // content off-screen — removed to match the mockup 1:1.

                // Achievements grid — mockup lines 558-566 (4-col grid,
                // "See all ›" header). Real rules from the shared
                // [Achievements.ALL] list (see its kdoc) — NOT the mockup's
                // own fabricated placeholder names, since some have no
                // server-side backing data. Header + whole grid both open the
                // full Achievements screen (mockup row "tap opens Achievements").
                AchievementsGrid(wins = me.wins, streak = me.streak, trophies = me.trophies, onOpenAchievements = onOpenAchievements)

                // Overview quick-link cards — mockup lines 814-850 ("avEditShow"
                // sibling section within isProfile). "My Reports" (lines
                // 851-868, hasMyReports) is deliberately NOT built: there is no
                // GET endpoint returning the current user's own submitted
                // reports anywhere in apps/server (grepped modules/reports.ts —
                // only admin-facing list/resolve routes exist, no
                // self-service "my reports" read), so it stays honestly
                // omitted rather than faked.
                val guild = myGuild
                if (guild != null) {
                    ProfileQuickLinkCard(
                        iconEmoji = null,
                        iconAssetFile = "me-guild.png",
                        title = guild.name,
                        subtitle = "[${guild.tag}] · Tap to open",
                        accentBorder = Color(0x33E8B84B),
                        onClick = onOpenGuild
                    )
                } else {
                    ProfileQuickLinkCard(
                        iconEmoji = null,
                        iconAssetFile = "me-banner.png",
                        title = "Discover Guilds",
                        subtitle = "Browse & join active orders",
                        accentBorder = Color(0x47C9A4FF),
                        iconBg = Color(0x1FC9A4FF),
                        onClick = onOpenDiscoverGuilds
                    )
                }
                ProfileQuickLinkCard(
                    iconEmoji = "🧾",
                    iconAssetFile = null,
                    title = "Purchase History",
                    subtitle = "View your past orders",
                    accentBorder = Color(0x24E8B84B),
                    onClick = onOpenOrders
                )
                if (guild == null) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable(onClick = onOpenGuild)
                            .background(Color(0x0DE8B84B), RoundedCornerShape(14.dp))
                            .border(1.dp, Color(0x57E8B84B), RoundedCornerShape(14.dp))
                            .padding(vertical = 13.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("＋", color = Color(0xFFF4D886), style = MaterialTheme.typography.titleMedium)
                            Text("Create a Guild", color = Color(0xFFF4D886), style = MaterialTheme.typography.labelLarge)
                        }
                    }
                }
                ProfileQuickLinkCard(
                    iconEmoji = "💬",
                    iconAssetFile = null,
                    title = "Contact Support",
                    subtitle = "Report an issue or ask a question",
                    accentBorder = Color(0x335A96FF),
                    iconBg = Color(0x1F5A96FF),
                    onClick = { contactOpen = true }
                )

                // Account action on the Overview itself (owner request: Log Out
                // was only reachable inside the Settings tab). Guest-aware: a
                // guest's only meaningful action is upgrading to a real account,
                // so show "Sign In / Create Account" for them (logging a guest
                // out just recycles them into another anonymous guest); a real
                // user gets the red Log Out, mirroring the Settings-tab button.
                if (me.isGuest) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 6.dp)
                            .clickable(onClick = onGoToSignIn)
                            .background(Brush.verticalGradient(listOf(Color(0xFFEFC25A), Color(0xFFC9971F))), RoundedCornerShape(14.dp))
                            .padding(vertical = 15.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("Sign In / Create Account", color = Color(0xFF3A2405), style = MaterialTheme.typography.titleMedium)
                    }
                } else {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 6.dp)
                            .clickable {
                                scope.launch {
                                    AuthRepository.logout()
                                    onSignedOut()
                                }
                            }
                            .background(Red.copy(alpha = 0.08f), RoundedCornerShape(14.dp))
                            .padding(vertical = 15.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("Log Out", color = Color(0xFFFF8F9C), style = MaterialTheme.typography.titleMedium)
                    }
                }
            }
        } else if (tab == "history") {
            Column(modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    listOf("all" to "All", "win" to "Wins", "loss" to "Losses", "RANKED" to "Ranked", "CASUAL" to "Casual", "AI" to "AI").forEach { (key, label) ->
                        HistoryFilterChip(label = label, active = historyFilter == key) { historyFilter = key }
                    }
                }

                val rows = matches
                when {
                    rows == null -> Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = Gold)
                    }
                    rows.isEmpty() -> Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                        Text(
                            "No matches here yet.\nFinish a game and it will appear in your history automatically.",
                            color = Ink2,
                            style = MaterialTheme.typography.bodyMedium,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }
                    else -> Column {
                        rows.forEach { m -> MatchHistoryRow(match = m, myUserId = me.id, onClick = { onOpenMatch(m.id) }) }
                    }
                }
            }
        } else {
            // ── Settings tab (profSettings) — mockup lines 621-651, setGroups
            // (mockup line 4017): rendered INLINE as the 3rd Profile tab, never
            // a navigated-to screen (owner round-3 fix — see tab-row kdoc
            // above). Reuses the SAME real SettingsStore singleton the
            // standalone SettingsScreen persists to/reads from, so toggling a
            // row here and opening the standalone screen elsewhere stay in
            // sync (one source of truth, not two competing prefs stores).
            ProfileSettingsTab(
                onOpenLegal = onOpenLegal,
                onSignedOut = onSignedOut
            )
        }
    }
}

/**
 * Inline Settings tab content — mockup `profSettings` block (line 621-651)
 * reproduced top-to-bottom exactly:
 *   1. Gameplay group (line 4018): Confirm moves / Auto-promote / Move hints /
 *      Force capture — gold-pill toggle (46x27, mockup `sw()` helper line
 *      4017) bound to the real [SettingsStore].
 *   2. Audio & Haptics group (line 4019): Sound effects / Music / Vibration.
 *   3. Notifications group (line 4020): Match invites / Guild activity /
 *      Events & offers.
 *   4. Support section (mockup line 638-644, static NOT-toggle rows): How to
 *      Play / Help & FAQ / Terms & Privacy / Contact Support (with the
 *      "Ticket" badge pill) — each a `›` nav row exactly like the mockup.
 *   5. Log Out button (red, full-width, mockup line 647) + version footer
 *      (mockup line 648, "FilipinoDama · v{real BuildConfig version}" — the
 *      mockup's own "v1.0.0 (build 142)" is placeholder demo copy, using the
 *      real version here is the honest substitution, not a fidelity gap).
 */
@Composable
private fun ProfileSettingsTab(
    onOpenLegal: (String) -> Unit,
    onSignedOut: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val store = SettingsStore.instance
    val confirmMoves by store.confirmMoves.collectAsState()
    val autoPromote by store.autoPromote.collectAsState()
    val hints by store.hints.collectAsState()
    val forceCapture by store.forceCapture.collectAsState()
    val sound by store.sound.collectAsState()
    val music by store.music.collectAsState()
    val haptics by store.haptics.collectAsState()
    val pushMatch by store.pushMatch.collectAsState()
    val pushGuild by store.pushGuild.collectAsState()
    val pushEvent by store.pushEvent.collectAsState()

    var contactOpen by remember { mutableStateOf(false) }
    if (contactOpen) {
        com.filipinodama.app.ui.screens.settings.ContactSupportDialog(onClose = { contactOpen = false })
    }

    Column(modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp)) {
        SettingsGroupCard(title = "Gameplay") {
            SettingsToggleRow("Confirm moves", "Tap twice to commit a move", confirmMoves) { store.setConfirmMoves(it) }
            SettingsToggleRow("Auto-promote", "Crown a Dama automatically", autoPromote) { store.setAutoPromote(it) }
            SettingsToggleRow("Move hints", "Highlight legal destinations", hints) { store.setHints(it) }
            SettingsToggleRow("Force capture", "Enforce mandatory captures", forceCapture) { store.setForceCapture(it) }
        }
        SettingsGroupCard(title = "Audio & Haptics") {
            SettingsToggleRow("Sound effects", null, sound) { store.setSound(it) }
            SettingsToggleRow("Music", null, music) { store.setMusic(it) }
            SettingsToggleRow("Vibration", null, haptics) { store.setHaptics(it) }
        }
        SettingsGroupCard(title = "Notifications") {
            SettingsToggleRow("Match invites", null, pushMatch) { store.setPushMatch(it) }
            SettingsToggleRow("Guild activity", null, pushGuild) { store.setPushGuild(it) }
            SettingsToggleRow("Events & offers", null, pushEvent) { store.setPushEvent(it) }
        }
        SettingsGroupCard(title = "Support") {
            SettingsNavRow("How to Play") { onOpenLegal("howto") }
            SettingsNavRow("Help & FAQ") { onOpenLegal("faq") }
            SettingsNavRow("Terms & Privacy") { onOpenLegal("terms") }
            SettingsNavRow("Contact Support", badge = "Ticket") { contactOpen = true }
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 22.dp)
                .clickable {
                    scope.launch {
                        AuthRepository.logout()
                        onSignedOut()
                    }
                }
                .background(Red.copy(alpha = 0.08f), RoundedCornerShape(14.dp))
                .padding(vertical = 15.dp),
            contentAlignment = Alignment.Center
        ) {
            Text("Log Out", color = Color(0xFFFF8F9C), style = MaterialTheme.typography.titleMedium)
        }
        Text(
            "FilipinoDama · v${com.filipinodama.app.BuildConfig.VERSION_NAME}",
            color = Color(0xFF5F527E),
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 8.dp),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center
        )
    }
}

/** Mockup Settings group card — rounded panel with an uppercase gold-muted title (line 626-627). */
@Composable
private fun SettingsGroupCard(title: String, content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) {
    Column(modifier = Modifier.padding(top = 20.dp)) {
        Text(
            title.uppercase(),
            color = Ink2,
            style = MaterialTheme.typography.labelMedium,
            letterSpacing = 1.5.sp,
            modifier = Modifier.padding(start = 2.dp, bottom = 9.dp)
        )
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(Color(0xCC1B1030))
                .border(1.dp, Color(0x1FE8B84B), RoundedCornerShape(16.dp))
        ) {
            content()
        }
    }
}

/**
 * Mockup toggle row (line 629-632): label + optional description on the
 * left, a gold-pill track+knob on the right. Exact mockup `sw()` geometry
 * (line 4017): track 46x27 pill, gradient gold when on / translucent white
 * when off; knob 21x21 white circle sliding 19dp on toggle — this is a
 * hand-built pill (NOT Material's [Switch]) to match the mockup 1:1 rather
 * than the platform default shape.
 */
@Composable
private fun SettingsToggleRow(label: String, desc: String?, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onCheckedChange(!checked) }
            .padding(horizontal = 15.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(label, color = Color(0xFFE6DCF5), style = MaterialTheme.typography.bodyMedium)
            if (desc != null) {
                Text(desc, color = Ink2, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 2.dp))
            }
        }
        MockupToggle(checked = checked, onCheckedChange = onCheckedChange)
    }
}

/** The mockup's exact gold-pill toggle switch (46x27 track / 21dp knob, mockup `sw()` line 4017). */
@Composable
private fun MockupToggle(checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Box(
        modifier = Modifier
            .width(46.dp)
            .height(27.dp)
            .clip(RoundedCornerShape(100.dp))
            .background(
                if (checked) Brush.horizontalGradient(listOf(Color(0xFFEFC25A), Color(0xFFC9971F)))
                else Brush.horizontalGradient(listOf(Color(0x1FFFFFFF), Color(0x1FFFFFFF)))
            )
            .clickable { onCheckedChange(!checked) }
    ) {
        Box(
            modifier = Modifier
                .padding(3.dp)
                .size(21.dp)
                .offset(x = if (checked) 19.dp else 0.dp)
                .clip(CircleShape)
                .background(Color.White)
        )
    }
}

/** Mockup Support row (line 640-643): static nav row, label + optional badge + trailing `›`. */
@Composable
private fun SettingsNavRow(label: String, badge: String? = null, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 15.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(label, color = Color(0xFFE6DCF5), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
        if (badge != null) {
            Box(
                modifier = Modifier
                    .background(Color(0x247FA8FF), RoundedCornerShape(100.dp))
                    .padding(horizontal = 8.dp, vertical = 3.dp)
            ) {
                Text(badge, color = Color(0xFF7FA8FF), style = MaterialTheme.typography.labelSmall)
            }
        }
        Text("›", color = Ink2, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(start = 8.dp))
    }
}

@Composable
private fun ProfileActionChip(label: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier = modifier
            .clickable(onClick = onClick)
            .background(Panel, RoundedCornerShape(10.dp))
            .padding(vertical = 12.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(label, color = GoldLt, style = MaterialTheme.typography.labelLarge)
    }
}

/**
 * Overview quick-link card — mockup lines 814-850 (Guild / Purchase History /
 * Discover Guilds / Contact Support rows): 44dp icon box, title (Cinzel 14sp),
 * subtitle (11sp muted), trailing chevron.
 */
@Composable
private fun ProfileQuickLinkCard(
    iconEmoji: String?,
    iconAssetFile: String?,
    title: String,
    subtitle: String,
    accentBorder: Color,
    iconBg: Color = Color(0x1AE8B84B),
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .background(Color(0xCC1B1030), RoundedCornerShape(16.dp))
            .border(1.dp, accentBorder, RoundedCornerShape(16.dp))
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Box(
            modifier = Modifier.size(44.dp).background(iconBg, RoundedCornerShape(12.dp)).border(1.dp, accentBorder, RoundedCornerShape(12.dp)),
            contentAlignment = Alignment.Center
        ) {
            if (iconEmoji != null) {
                Text(iconEmoji, style = MaterialTheme.typography.titleLarge)
            } else if (iconAssetFile != null) {
                coil.compose.AsyncImage(
                    model = "${com.filipinodama.app.BuildConfig.WEB_ORIGIN}/assets/$iconAssetFile",
                    contentDescription = null,
                    modifier = Modifier.size(28.dp)
                )
            }
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(title, color = Color(0xFFF4ECD6), style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
            Text(subtitle, color = Color(0xFF9A8BBF), style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 2.dp))
        }
        Text("›", color = Ink2, style = MaterialTheme.typography.titleLarge)
    }
}

/**
 * Achievements grid — mockup profAch (Overview, line 5019) + achList (full
 * Achievements screen SCREEN 30, line 2331/3338). Both are gated by the SAME
 * (wins, streak, trophies) inputs — no fabricated stats, no server changes.
 * This is the ONE shared source [ProfileScreen]'s Overview (first 4) and
 * [AchievementsScreen] (all 8) both consume, so the two surfaces can't drift.
 *
 * Rows 1-4 are the mockup's own Overview profAch tiles verbatim (name + icon).
 * Rows 5-8 extend to the full screen's 8-item achList using the SAME real
 * stat inputs — the mockup's own achList text differs slightly per row
 * ("Rajah's Favor"/"Season Veteran"/"Guild Champion"/"Untouchable"/"Kingdom
 * Legend" reference guild-war and exact-capture-count data the app has no
 * field for), so rows 5-8 substitute honestly-derivable milestones instead
 * of fabricating those specific unlock conditions, reusing real handoff
 * assets (medal-2.png, kingmaker.png, sb-star.png, tier-alamat.png — all
 * present under handoffv3/handoff/assets/). "Rajah tier" from the task brief
 * doesn't exist in RankTiers (the real top tier is Alamat/"Legend") — Legend
 * targets the real top tier's threshold via RankTiers.TIERS.last().
 */
internal data class AchievementDef(
    val name: String,
    val desc: String,
    val assetFile: String,
    /** Null when unlock is boolean-only (no meaningful fractional progress to show). */
    val progress: ((wins: Int, streak: Int, trophies: Int) -> Float)? = null,
    val unlocked: (wins: Int, streak: Int, trophies: Int) -> Boolean
)

internal object Achievements {
    val ALL: List<AchievementDef> = listOf(
        AchievementDef("First Blood", "Win your first match", "ic-trophy.png") { w, _, _ -> w >= 1 },
        AchievementDef("Streak x10", "Win 10 in a row", "me-target.png") { _, s, _ -> s >= 10 },
        AchievementDef("Capture King", "Crown a king", "pieces/skins/crimson/red-king.png") { w, _, _ -> w >= 1 },
        AchievementDef("Season Vet", "Reach Datu tier", "tier-datu.png") { _, _, t -> t >= RankTiers.forTrophies(1100).min },
        AchievementDef(
            "Veteran", "Win 50 matches", "medal-2.png",
            progress = { w, _, _ -> (w.toFloat() / 50f).coerceIn(0f, 1f) }
        ) { w, _, _ -> w >= 50 },
        AchievementDef(
            "Champion", "Win 100 matches", "kingmaker.png",
            progress = { w, _, _ -> (w.toFloat() / 100f).coerceIn(0f, 1f) }
        ) { w, _, _ -> w >= 100 },
        AchievementDef(
            "Rising Star", "Reach 500 trophies", "sb-star.png",
            progress = { _, _, t -> (t.toFloat() / 500f).coerceIn(0f, 1f) }
        ) { _, _, t -> t >= 500 },
        AchievementDef(
            "Legend", "Reach ${RankTiers.TIERS.last().label} tier", "tier-alamat.png",
            progress = { _, _, t -> (t.toFloat() / RankTiers.TIERS.last().min.toFloat()).coerceIn(0f, 1f) }
        ) { _, _, t -> t >= RankTiers.TIERS.last().min }
    )
}

/**
 * Overview's 4-tile grid — mockup profAch (line 5019): First Blood / Streak
 * x10 / Capture King / Season Vet, the first 4 of the shared [Achievements.ALL]
 * list. Header "See all ›" AND the whole grid are tappable (mockup row
 * "tap opens Achievements") via [onOpenAchievements].
 */
@Composable
private fun AchievementsGrid(wins: Int, streak: Int, trophies: Int, onOpenAchievements: () -> Unit) {
    val defs = Achievements.ALL.take(4)
    Column(modifier = Modifier.clickable(onClick = onOpenAchievements)) {
        Row(modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("ACHIEVEMENTS", color = Ink2, style = MaterialTheme.typography.labelMedium, letterSpacing = 1.5.sp)
            Text(
                "See all ›",
                color = Color(0xFFC9A4FF),
                style = MaterialTheme.typography.labelMedium,
                modifier = Modifier.clickable(onClick = onOpenAchievements)
            )
        }
        LazyVerticalGrid(
            columns = GridCells.Fixed(4),
            modifier = Modifier.height(96.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            userScrollEnabled = false
        ) {
            items(defs) { a ->
                val unlocked = a.unlocked(wins, streak, trophies)
                Column(
                    modifier = Modifier
                        .background(Panel, RoundedCornerShape(14.dp))
                        .padding(vertical = 12.dp, horizontal = 4.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    AsyncImage(
                        model = "${com.filipinodama.app.BuildConfig.WEB_ORIGIN}/assets/${a.assetFile}",
                        contentDescription = null,
                        modifier = Modifier.size(38.dp).then(if (!unlocked) Modifier.alpha(0.35f) else Modifier)
                    )
                    Text(
                        a.name,
                        color = if (unlocked) Color(0xFFC9BCE0) else Ink2.copy(alpha = 0.6f),
                        style = MaterialTheme.typography.labelSmall,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                        maxLines = 2,
                        modifier = Modifier.padding(top = 6.dp)
                    )
                }
            }
        }
    }
}

/**
 * Pill tab button — ROOT CAUSE FIX for the bug where the Row's second child
 * never rendered ("Match History" silently absent, proven even with a
 * byte-for-byte duplicate of the first child — see docs/android-golden-paths/
 * REPORT.md follow-up section). The prior version was a `Column` with NO
 * width constraint of its own (only an inner `Box.fillMaxWidth()` two levels
 * down) sitting in a parent `Row` that ALSO had no `Arrangement`/weight on
 * either child — an unconstrained-width row of unconstrained-width columns.
 * Giving each button an explicit `Modifier.weight(1f)` (passed in from the
 * call site, matching the mockup's own `flex:1` on every tab button) forces
 * the Row to give each child a definite, non-ambiguous width during measure,
 * which is both the correct mockup-fidelity fix (equal-width flex pills, not
 * an underline tab strip) and eliminates the ambiguous/zero-width measure
 * pass that was silently dropping the second child.
 */
@Composable
private fun ProfileTabButton(label: String, active: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier = modifier
            .clickable(onClick = onClick)
            .clip(RoundedCornerShape(11.dp))
            .background(
                if (active) Brush.verticalGradient(listOf(Color(0xFFEFC25A), Color(0xFFC9971F)))
                else Brush.verticalGradient(listOf(Color.Transparent, Color.Transparent))
            )
            .padding(vertical = 11.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            label,
            color = if (active) Color(0xFF3A2405) else Ink2,
            style = MaterialTheme.typography.labelLarge
        )
    }
}

@Composable
private fun RankTierLadder(
    tierNow: com.filipinodama.app.data.engine.RankTier,
    trophies: Int,
    toNextLabel: String,
    nextLabel: String
) {
    Column(modifier = Modifier.fillMaxWidth().background(Panel, RoundedCornerShape(16.dp)).padding(20.dp)) {
        Text("Rank Tiers", color = GoldLt, style = MaterialTheme.typography.titleMedium)
        Row(modifier = Modifier.padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            AsyncImage(model = tierArtUrl(tierNow.img), contentDescription = null, modifier = Modifier.height(48.dp))
            Column(modifier = Modifier.padding(start = 12.dp)) {
                Text(tierNow.label, color = GoldLt, style = MaterialTheme.typography.titleMedium)
                CurrencyAmount(kind = CurrencyIconKind.TROPHY, text = trophies.toString(), prefix = "${tierNow.sub} · ", color = Ink2, style = MaterialTheme.typography.bodySmall)
            }
        }
        Text(
            "$toNextLabel · Next: $nextLabel",
            color = Ink2,
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(top = 10.dp, bottom = 10.dp)
        )
        RankTiers.TIERS.forEach { t ->
            val isCurrent = t.key == tierNow.key
            val reached = trophies >= t.min
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    t.label,
                    color = if (isCurrent) GoldLt else Ink,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.weight(1f)
                )
                CurrencyAmount(kind = CurrencyIconKind.TROPHY, text = "${t.min}+", color = Ink, style = MaterialTheme.typography.labelSmall)
                Text(
                    text = if (isCurrent) "CURRENT" else if (reached) "REACHED" else "LOCKED",
                    color = if (isCurrent) Gold else if (reached) Green else Ink2,
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier.padding(start = 8.dp)
                )
            }
        }
    }
}

@Composable
private fun TrophyHistoryCard(trophyRows: List<LedgerRowDto>?, trophies: Int) {
    Column(modifier = Modifier.fillMaxWidth().background(Panel, RoundedCornerShape(16.dp)).padding(20.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Trophy History", color = GoldLt, style = MaterialTheme.typography.titleMedium)
            CurrencyAmount(kind = CurrencyIconKind.TROPHY, text = trophies.toString(), color = GoldLt, style = MaterialTheme.typography.titleMedium)
        }
        Text(
            "Trophies change only in Ranked — win +25, loss −5.",
            color = Ink2,
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(top = 4.dp, bottom = 12.dp)
        )
        when {
            trophyRows == null -> Box(Modifier.fillMaxWidth().padding(20.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Gold)
            }
            trophyRows.isEmpty() -> Text(
                "No ranked matches yet.\nPlay a Ranked game and your trophy changes will appear here.",
                color = Ink2,
                style = MaterialTheme.typography.bodyMedium,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(20.dp)
            )
            else -> Column {
                trophyRows.forEach { h ->
                    val positive = h.amount >= 0
                    val color = if (positive) Green else Red
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            if (positive) "WIN" else "LOSS",
                            color = color,
                            style = MaterialTheme.typography.labelSmall,
                            modifier = Modifier.padding(end = 10.dp)
                        )
                        Text(h.reason ?: "Ranked match", color = Ink, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                        Text(
                            "${if (positive) "+" else ""}${h.amount}",
                            color = color,
                            style = MaterialTheme.typography.labelLarge
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun HistoryFilterChip(label: String, active: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clickable(onClick = onClick)
            .background(if (active) Gold else Color.Black.copy(alpha = 0.25f), RoundedCornerShape(999.dp))
            .padding(horizontal = 14.dp, vertical = 8.dp)
    ) {
        Text(label, color = if (active) Color(0xFF1A0F2E) else Ink2, style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun MatchHistoryRow(match: MatchRowDto, myUserId: String, onClick: () -> Unit) {
    val iAmRed = match.red?.id == myUserId
    val opponent = if (iAmRed) match.blue else match.red
    val oppName = opponent?.displayName ?: if (match.mode == "AI" || match.mode == "LOCAL") "Computer" else "Opponent"
    val myDelta = if (iAmRed) match.redTrophyDelta else match.blueTrophyDelta
    val result = when {
        match.winner == "draw" || match.winner == null -> "draw"
        (match.winner == "red") == iAmRed -> "win"
        else -> "loss"
    }
    val color = when (result) {
        "win" -> Green
        "loss" -> Red
        else -> Ink2
    }
    val deltaStr = if (myDelta == null) "—" else "${if (myDelta > 0) "+" else ""}$myDelta"

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            result.uppercase(),
            color = color,
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(end = 12.dp)
        )
        Column(modifier = Modifier.weight(1f)) {
            Text("vs $oppName", color = Color(0xFFEFE7FB), style = MaterialTheme.typography.bodyMedium)
            Text(
                "${modeLabelFor(match.mode)} · ${match.moveCount} moves",
                color = Ink2,
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.padding(top = 2.dp)
            )
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(deltaStr, color = color, style = MaterialTheme.typography.labelLarge)
            Text("Score ${match.redCaptures}–${match.blueCaptures}", color = Ink2, style = MaterialTheme.typography.labelSmall)
        }
    }
}

private fun modeLabelFor(mode: String): String = when (mode) {
    "AI" -> "vs AI"
    "CASUAL" -> "Casual"
    "RANKED" -> "Ranked"
    "PRIVATE" -> "Private"
    "LOCAL" -> "Local"
    else -> mode
}
