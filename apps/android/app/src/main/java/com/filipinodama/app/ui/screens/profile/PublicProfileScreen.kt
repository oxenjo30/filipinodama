package com.filipinodama.app.ui.screens.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.filipinodama.app.data.profile.ProfileExtrasResponse
import com.filipinodama.app.data.profile.ProfileRepository
import com.filipinodama.app.data.profile.ProfileResult
import com.filipinodama.app.data.profile.PublicUserProfileDto
import com.filipinodama.app.data.profile.RecentMatchDto
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Green
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel
import com.filipinodama.app.ui.theme.Red

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
 * DEFERRED: Add Friend / Message / Report actions — these are Friends/
 * Moderation surfaces outside this phase's Profile+Replay+Leaderboard scope
 * (no Friends screen exists in this phase to navigate to/from), honestly
 * omitted rather than wired to a dead target.
 */
@Composable
fun PublicProfileScreen(userId: String, onOpenReplay: (String) -> Unit) {
    var user by remember { mutableStateOf<PublicUserProfileDto?>(null) }
    var notFound by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf(false) }
    var extras by remember { mutableStateOf<ProfileExtrasResponse?>(null) }

    LaunchedEffect(userId) {
        user = null
        notFound = false
        error = false
        when (val result = ProfileRepository.publicUser(userId)) {
            is ProfileResult.Success -> user = result.data.user
            is ProfileResult.Failure -> {
                if (result.code == "USER_NOT_FOUND") notFound = true else error = true
            }
        }
    }

    LaunchedEffect(userId) {
        extras = null
        when (val result = ProfileRepository.profileExtras(userId)) {
            is ProfileResult.Success -> extras = result.data
            // A failed/unauthorized fetch must not leave extras stuck at "Loading…"
            // forever — fall to an honest empty state (mirrors PublicProfilePage.tsx).
            is ProfileResult.Failure -> extras = ProfileExtrasResponse()
        }
    }

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).verticalScroll(rememberScrollState())) {
        when {
            notFound -> Box(Modifier.fillMaxSize().padding(40.dp), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Player not found", color = GoldLt, style = MaterialTheme.typography.titleLarge)
                    Text("This player doesn't exist or has left the realm.", color = Ink2, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 8.dp))
                }
            }
            error -> Box(Modifier.fillMaxSize().padding(40.dp), contentAlignment = Alignment.Center) {
                Text("Couldn't load this profile.", color = Ink2, style = MaterialTheme.typography.bodyMedium)
            }
            user == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Gold) }
            else -> {
                val u = user!!
                val total = u.wins + u.losses + u.draws
                val winRate = if (total > 0) (u.wins * 100 / total) else 0

                Row(modifier = Modifier.fillMaxWidth().padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
                    AvatarView(avatarUrl = u.avatarUrl, frameId = u.frameId, size = 76.dp)
                    Column(modifier = Modifier.weight(1f).padding(start = 16.dp)) {
                        Text(u.displayName, color = androidx.compose.ui.graphics.Color.White, style = MaterialTheme.typography.headlineSmall)
                        Text(u.tag, color = Ink2, style = MaterialTheme.typography.labelMedium)
                        Text(u.tier.label, color = Gold, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 4.dp))
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
            }
        }
    }
}

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
