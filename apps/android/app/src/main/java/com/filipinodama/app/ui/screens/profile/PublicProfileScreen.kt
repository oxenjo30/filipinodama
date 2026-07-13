package com.filipinodama.app.ui.screens.profile

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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.graphics.Color
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.filipinodama.app.data.profile.ProfileExtrasResponse
import com.filipinodama.app.data.profile.ProfileRepository
import com.filipinodama.app.data.profile.ProfileResult
import com.filipinodama.app.data.profile.PublicUserProfileDto
import com.filipinodama.app.data.profile.RecentMatchDto
import com.filipinodama.app.data.social.FriendsRepository
import com.filipinodama.app.data.social.PresenceRepository
import com.filipinodama.app.data.social.SocialResult
import com.filipinodama.app.ui.screens.social.ReportPlayerDialog
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Green
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel
import com.filipinodama.app.ui.theme.Red
import kotlinx.coroutines.launch

/**
 * PublicProfileScreen — mobile-screen-inventory.md SCREEN 28, reached from
 * leaderboard rows / podium taps. A port of apps/web PublicProfilePage.tsx:
 * identity + stats from GET /api/users/:id, enrichment (favorite move,
 * openings, recent match replays, badges) from GET /api/users/:id/profile-extras
 * — the v3 delta endpoint (users.ts). Both fetches are independent so a
 * failed profile-extras fetch never blocks identity/stats from rendering
 * (mirrors PublicProfilePage.tsx's two separate useEffects).
 *
 * Rows built: identity header (avatar+frame, name+tag, tier, guild),
 * stat tiles (trophies/wins/losses/win-rate), Guild + Favorite Move tiles,
 * Match Replays list (tap -> ReplayViewerScreen), Badges (honest empty —
 * server always returns [] per users.ts kdoc, no fabricated achievements),
 * Favorite Openings progress bars.
 *
 * Add Friend / Message / Report actions (Phase 6b): wired below via
 * FriendButton (state-aware — self/friends/request-sent/request-received/
 * none, mirroring apps/web FriendButton.tsx exactly off the real
 * `relationship`/`requestId` fields users.ts already returns), a Message
 * button (only shown once friends, mirroring the web FriendsPage.tsx 💬
 * button gating — DMs require a confirmed friendship server-side), and
 * ReportPlayerDialog (context="profile").
 */
@Composable
fun PublicProfileScreen(
    userId: String,
    onOpenReplay: (String) -> Unit,
    onOpenChat: (String) -> Unit = {},
    signedIn: Boolean = true,
    onRequireSignIn: () -> Unit = {},
    onBack: () -> Unit = {}
) {
    var user by remember { mutableStateOf<PublicUserProfileDto?>(null) }
    var notFound by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf(false) }
    var extras by remember { mutableStateOf<ProfileExtrasResponse?>(null) }
    var relationship by remember { mutableStateOf("none") }
    var requestId by remember { mutableStateOf<String?>(null) }
    var friendBusy by remember { mutableStateOf(false) }
    var reportOpen by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    // Phase 7 retry affordance: bump to re-run both load effects below.
    var retryTick by remember { mutableStateOf(0) }

    LaunchedEffect(Unit) { PresenceRepository.start() }

    LaunchedEffect(userId, retryTick) {
        user = null
        notFound = false
        error = false
        when (val result = ProfileRepository.publicUser(userId)) {
            is ProfileResult.Success -> {
                user = result.data.user
                relationship = result.data.user.relationship
                requestId = result.data.user.requestId
            }
            is ProfileResult.Failure -> {
                if (result.code == "USER_NOT_FOUND") notFound = true else error = true
            }
        }
    }

    LaunchedEffect(userId, retryTick) {
        extras = null
        when (val result = ProfileRepository.profileExtras(userId)) {
            is ProfileResult.Success -> extras = result.data
            // A failed/unauthorized fetch must not leave extras stuck at "Loading…"
            // forever — fall to an honest empty state (mirrors PublicProfilePage.tsx).
            is ProfileResult.Failure -> extras = ProfileExtrasResponse()
        }
    }

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).verticalScroll(rememberScrollState())) {
        // Header — mockup lines 2250-2253 ("PLAYER PUBLIC PROFILE"): a bare
        // in-flow flex row (no header-bar container of its own) holding the
        // ‹ back control + an uppercase "Player profile" eyebrow label. This
        // app has no OS back stack chrome for this screen, so the mockup's
        // explicit back button is the only way back — previously missing.
        Row(
            modifier = Modifier.fillMaxWidth().padding(start = 16.dp, top = 44.dp, end = 16.dp, bottom = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            com.filipinodama.app.ui.components.MockupBackButton(onClick = onBack)
            Text(
                "PLAYER PROFILE",
                color = Ink2,
                style = MaterialTheme.typography.labelMedium,
                letterSpacing = 2.sp
            )
        }
        when {
            notFound -> Box(Modifier.fillMaxSize().padding(40.dp), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Player not found", color = GoldLt, style = MaterialTheme.typography.titleLarge)
                    Text("This player doesn't exist or has left the realm.", color = Ink2, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 8.dp))
                }
            }
            error -> Box(Modifier.fillMaxSize().padding(40.dp), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Couldn't load this profile.", color = Ink2, style = MaterialTheme.typography.bodyMedium)
                    Text(
                        "Retry",
                        color = GoldLt,
                        style = MaterialTheme.typography.labelLarge,
                        modifier = Modifier.padding(top = 12.dp).clickable { retryTick++ }
                    )
                }
            }
            user == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Gold) }
            else -> {
                val u = user!!
                val total = u.wins + u.losses + u.draws
                val winRate = if (total > 0) (u.wins * 100 / total) else 0

                // Online status pill — mockup lines 3090-3094 (pubStatusColor/
                // pubStatusLabel). Only shown when `relationship == "friends"`:
                // the server's presence:ping snapshot (apps/server/src/realtime/
                // presence.ts line 77, `friendIds(userId)`) is FRIENDS-ONLY —
                // PresenceRepository.isOnline() would silently report "Offline"
                // for a genuinely-online non-friend, which is worse than not
                // showing the pill. Avatar sized 96dp per the mockup (was 76dp).
                Column(modifier = Modifier.fillMaxWidth().padding(start = 20.dp, top = 12.dp, end = 20.dp, bottom = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    AvatarView(avatarUrl = u.avatarUrl, frameId = u.frameId, size = 96.dp)
                    Text(u.displayName, color = Color(0xFFF4ECD6), style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 14.dp))
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 5.dp)) {
                        Text(u.tag, color = Color(0xFF8B7CAE), style = MaterialTheme.typography.labelMedium)
                        Box(modifier = Modifier.size(3.dp).background(Color(0xFF6F5F92), androidx.compose.foundation.shape.CircleShape))
                        Text(u.tier.label, color = Color(0xFFC9A4FF), style = MaterialTheme.typography.labelMedium)
                    }
                    if (relationship == "friends") {
                        val online = PresenceRepository.online.collectAsState().value.contains(userId)
                        val statusColor = if (online) Color(0xFF3FBF6F) else Color(0xFF8B7CAE)
                        Box(
                            modifier = Modifier
                                .padding(top = 10.dp)
                                .background(Color(0xB31B1030), RoundedCornerShape(100.dp))
                                .border(1.dp, Color(0x33E8B84B), RoundedCornerShape(100.dp))
                                .padding(horizontal = 13.dp, vertical = 5.dp)
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                                Box(modifier = Modifier.size(8.dp).background(statusColor, androidx.compose.foundation.shape.CircleShape))
                                Text(if (online) "Online" else "Offline", color = statusColor, style = MaterialTheme.typography.labelMedium)
                            }
                        }
                    }
                }

                // ── Add Friend / Message / Report (Phase 6b) ──
                // Mirrors apps/web FriendButton.tsx state machine exactly: self/bot
                // render nothing, friends/request-sent are disabled labels,
                // request-received accepts via the SAME requestId the server gave
                // us, none sends a fresh request. Message only shows once friends
                // (DMs require a confirmed friendship, matching FriendsPage.tsx's
                // 💬 gating). Report is always available (server enforces
                // self-report/guest guards).
                if (relationship != "self" && !u.isBot) {
                    Row(modifier = Modifier.fillMaxWidth().padding(start = 20.dp, top = 0.dp, end = 20.dp, bottom = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        FriendActionButton(
                            relationship = relationship,
                            busy = friendBusy,
                            signedIn = signedIn,
                            modifier = Modifier.weight(1f),
                            onClick = {
                                if (!signedIn) {
                                    onRequireSignIn()
                                } else {
                                    friendBusy = true
                                    scope.launch {
                                        val result = if (relationship == "request-received" && requestId != null) {
                                            FriendsRepository.acceptRequest(requestId!!)
                                        } else {
                                            FriendsRepository.sendRequest(userId)
                                        }
                                        when (result) {
                                            is SocialResult.Success -> {
                                                relationship = if (result.data.status == "accepted") "friends" else "request-sent"
                                            }
                                            is SocialResult.Failure -> {}
                                        }
                                        friendBusy = false
                                    }
                                }
                            }
                        )
                        if (relationship == "friends") {
                            Box(
                                modifier = Modifier.weight(1f)
                                    .clickable { onOpenChat(userId) }
                                    .background(Panel, RoundedCornerShape(10.dp))
                                    .padding(vertical = 13.dp),
                                contentAlignment = Alignment.Center
                            ) { Text("💬 Message", color = GoldLt, style = MaterialTheme.typography.labelLarge) }
                        }
                        Box(
                            modifier = Modifier
                                .clickable { reportOpen = true }
                                .background(Panel, RoundedCornerShape(10.dp))
                                .padding(horizontal = 16.dp, vertical = 13.dp)
                        ) { Text("⚑", color = Ink2, style = MaterialTheme.typography.labelLarge) }
                    }
                }

                val statTriples: List<Triple<String, String, androidx.compose.ui.graphics.Color>> = listOf(
                    Triple("Trophies", u.trophies.toString(), GoldLt),
                    Triple("Wins", u.wins.toString(), Green),
                    Triple("Losses", u.losses.toString(), Red),
                    Triple("Win Rate", "$winRate%", GoldLt)
                )
                LazyVerticalGrid(
                    columns = GridCells.Fixed(4),
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp).height(80.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(statTriples) { stat ->
                        val (label, value, color) = stat
                        Column(
                            modifier = Modifier.background(Panel, RoundedCornerShape(12.dp)).padding(vertical = 14.dp).fillMaxWidth(),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(value, color = color, style = MaterialTheme.typography.titleMedium)
                            Text(label, color = Ink2, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 3.dp))
                        }
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth().padding(20.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Column(
                        modifier = Modifier.weight(1f).background(Panel, RoundedCornerShape(14.dp)).padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text("Guild", color = Ink2, style = MaterialTheme.typography.labelSmall)
                        Text(u.guild?.name ?: "No guild", color = if (u.guild != null) androidx.compose.ui.graphics.Color.White else Ink2, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 6.dp))
                    }
                    Column(
                        modifier = Modifier.weight(1f).background(Panel, RoundedCornerShape(14.dp)).padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text("Favorite Move", color = Ink2, style = MaterialTheme.typography.labelSmall)
                        Text(extras?.favoriteMove ?: "—", color = GoldLt, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 6.dp))
                    }
                }

                Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 4.dp).background(Panel, RoundedCornerShape(16.dp)).padding(18.dp)) {
                    Text("Match Replays", color = GoldLt, style = MaterialTheme.typography.titleMedium)
                    val ex = extras
                    when {
                        ex == null -> Box(Modifier.fillMaxWidth().padding(20.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Gold) }
                        ex.recentMatches.isEmpty() -> Text("No matches yet.", color = Ink2, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 12.dp))
                        else -> Column(modifier = Modifier.padding(top = 8.dp)) {
                            ex.recentMatches.forEach { m -> RecentMatchRow(m, onOpenReplay) }
                        }
                    }
                }

                Column(modifier = Modifier.fillMaxWidth().padding(20.dp).background(Panel, RoundedCornerShape(16.dp)).padding(18.dp)) {
                    Text("Badges & Achievements", color = GoldLt, style = MaterialTheme.typography.titleMedium)
                    val badges = extras?.badges ?: emptyList()
                    if (badges.isEmpty()) {
                        Text("No badges yet", color = Ink2, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 12.dp))
                    } else {
                        Row(modifier = Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            badges.forEach { b ->
                                Box(modifier = Modifier.background(Gold.copy(alpha = 0.12f), RoundedCornerShape(999.dp)).padding(horizontal = 14.dp, vertical = 8.dp)) {
                                    Text(b, color = GoldLt, style = MaterialTheme.typography.labelSmall)
                                }
                            }
                        }
                    }
                }

                Column(modifier = Modifier.fillMaxWidth().padding(20.dp).background(Panel, RoundedCornerShape(16.dp)).padding(18.dp)) {
                    Text("Favorite Openings", color = GoldLt, style = MaterialTheme.typography.titleMedium)
                    val openings = extras?.openings ?: emptyList()
                    if (openings.isEmpty()) {
                        Text("Not enough games yet", color = Ink2, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 12.dp))
                    } else {
                        Column(modifier = Modifier.padding(top = 10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            openings.forEach { o ->
                                Column {
                                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                        Text(o.label, color = Ink, style = MaterialTheme.typography.labelMedium)
                                        Text("${o.pct}%", color = GoldLt, style = MaterialTheme.typography.labelMedium)
                                    }
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(top = 5.dp)
                                            .background(androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.4f), RoundedCornerShape(6.dp))
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .fillMaxWidth(o.pct / 100f)
                                                .background(Gold, RoundedCornerShape(6.dp))
                                        ) {
                                            Text("", modifier = Modifier.padding(vertical = 3.dp))
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                if (reportOpen) {
                    ReportPlayerDialog(
                        accusedId = userId,
                        context = "profile",
                        onClose = { reportOpen = false }
                    )
                }
            }
        }
    }
}

/**
 * FriendActionButton — state-aware friend action, a Compose port of
 * apps/web FriendButton.tsx: friends/request-sent render as disabled labels,
 * request-received shows "Accept Request", none/signed-out show "Add Friend".
 */
@Composable
private fun FriendActionButton(relationship: String, busy: Boolean, signedIn: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val (label, bg, fg, enabled) = when {
        !signedIn -> FriendButtonStyle("＋ Add Friend", Gold.copy(alpha = 0.16f), GoldLt, true)
        relationship == "friends" -> FriendButtonStyle("Friends ✓", Green.copy(alpha = 0.15f), Color(0xFF8CE0AD), false)
        relationship == "request-sent" -> FriendButtonStyle("Request Sent", Color.Black.copy(alpha = 0.3f), Ink2, false)
        relationship == "request-received" -> FriendButtonStyle("Accept Request", Green.copy(alpha = 0.18f), Green, true)
        else -> FriendButtonStyle("＋ Add Friend", Gold.copy(alpha = 0.16f), GoldLt, true)
    }
    Box(
        modifier = modifier
            .clickable(enabled = enabled && !busy, onClick = onClick)
            .background(bg, RoundedCornerShape(10.dp))
            .padding(vertical = 13.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(if (busy) "…" else label, color = fg, style = MaterialTheme.typography.labelLarge)
    }
}

private data class FriendButtonStyle(val label: String, val bg: Color, val fg: Color, val enabled: Boolean)

@Composable
private fun RecentMatchRow(m: RecentMatchDto, onOpenReplay: (String) -> Unit) {
    val color = when (m.result) {
        "win" -> Green
        "loss" -> Red
        else -> Ink2
    }
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(m.result.uppercase(), color = color, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(end = 12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text("vs ${m.opponentName}", color = androidx.compose.ui.graphics.Color.White, style = MaterialTheme.typography.bodyMedium)
            Text(modeLabelForExtras(m.mode), color = Ink2, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 2.dp))
        }
        val deltaStr = if (m.trophyDelta == null) "—" else "${if (m.trophyDelta > 0) "+" else ""}${m.trophyDelta}"
        Text(deltaStr, color = color, style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(end = 10.dp))
        Box(
            modifier = Modifier
                .background(if (m.hasReplay) Gold else Ink2.copy(alpha = 0.2f), RoundedCornerShape(8.dp))
                .clickable(enabled = m.hasReplay) { onOpenReplay(m.id) }
                .padding(horizontal = 12.dp, vertical = 8.dp)
        ) {
            Text("▶ Replay", color = if (m.hasReplay) androidx.compose.ui.graphics.Color(0xFF1A0F2E) else Ink2, style = MaterialTheme.typography.labelSmall)
        }
    }
}

private fun modeLabelForExtras(mode: String): String = when (mode) {
    "AI" -> "vs AI"
    "CASUAL" -> "Casual"
    "RANKED" -> "Ranked"
    "PRIVATE" -> "Private"
    "LOCAL" -> "Local"
    else -> mode
}
