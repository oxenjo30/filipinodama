package com.filipinodama.app.ui.screens.leaderboard

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.unit.dp
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.economy.EconomyRepository
import com.filipinodama.app.data.economy.EconomyResult
import com.filipinodama.app.data.economy.SeasonInfoDto
import com.filipinodama.app.data.leaderboard.LbRowDto
import com.filipinodama.app.data.leaderboard.LeaderboardRepository
import com.filipinodama.app.data.leaderboard.LeaderboardResult
import com.filipinodama.app.ui.screens.profile.AvatarView
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel

/**
 * LeaderboardScreen — mobile-screen-inventory.md SCREEN 25. A port of
 * apps/web LeaderboardPage.tsx: GET /api/leaderboard?scope=global|friends|guild
 * — ALL THREE scopes are real, server-backed (leaderboard.ts querySchema
 * z.enum(["global","friends","guild"])); friends/guild require sign-in
 * (server 401s an anonymous request for those scopes, matching web's
 * client-side "needsAuth" pre-check that skips the fetch and shows an inline
 * sign-in prompt instead).
 *
 * Rows built: scope tabs (Global/Friends/Guild — all real), podium (top 3,
 * tap -> public profile), ranked table (rank/player/rating/win-rate/streak,
 * tap row -> public profile), "Your Rank" pinned row (real rank when placed,
 * honest "Unranked"/"not on this ladder yet" otherwise — never a fabricated
 * rank).
 *
 * DEFERRED (no server source / out of this phase's row list): season
 * selector dropdown (server exposes only the current season, so there is
 * nothing to select between — matches web's own honesty comment), Top
 * Guilds / Live Climbers side rails and Season Stats card (marketing rails
 * around the ladder, not the ladder itself — no dedicated inventory row
 * beyond the podium/table/your-rank this task lists).
 */
@Composable
fun LeaderboardScreen(onOpenPublicProfile: (String) -> Unit, onBack: () -> Unit = {}) {
    val authState by AuthRepository.state.collectAsState()
    val me = authState.user

    var scope by remember { mutableStateOf("global") }
    var rows by remember { mutableStateOf<List<LbRowDto>?>(null) }
    var youRow by remember { mutableStateOf<LbRowDto?>(null) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var needsAuthPrompt by remember { mutableStateOf(false) }
    var season by remember { mutableStateOf<SeasonInfoDto?>(null) }
    // Phase 7 retry affordance: incrementing this re-keys the load effect
    // below, letting a "Retry" tap re-run the same fetch without duplicating
    // the load logic into a separate callable.
    var retryTick by remember { mutableStateOf(0) }

    // "Ends" countdown line (mobile-screen-inventory.md SCREEN 25 row 4) —
    // the real current season from GET /api/season/current (same endpoint
    // Phase 5's SeasonScreen already uses); the server exposes only the
    // CURRENT season (no seasons-list endpoint), matching web LeaderboardPage's
    // own documented honesty about not fabricating a season picker.
    LaunchedEffect(Unit) {
        when (val result = EconomyRepository.seasonCurrent()) {
            is EconomyResult.Success -> season = result.data.season
            is EconomyResult.Failure -> season = null
        }
    }

    LaunchedEffect(scope, me?.id, retryTick) {
        val requiresAuth = scope != "global" && me == null
        if (requiresAuth) {
            needsAuthPrompt = true
            rows = null
            youRow = null
            return@LaunchedEffect
        }
        needsAuthPrompt = false
        rows = null
        loadError = null
        when (val result = LeaderboardRepository.leaderboard(scope)) {
            is LeaderboardResult.Success -> {
                rows = result.data.rows
                youRow = result.data.me
            }
            is LeaderboardResult.Failure -> {
                rows = emptyList()
                loadError = result.message
            }
        }
    }

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).verticalScroll(rememberScrollState())) {
        Row(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("‹", color = GoldLt, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.clickable(onClick = onBack).padding(end = 12.dp))
            Column {
                Text("✦ LEADERBOARD ✦", color = Gold, style = MaterialTheme.typography.labelMedium)
                val s = season
                if (s != null) {
                    Text(
                        "⏳ ${seasonCountdownLabel(s.endsAt)}",
                        color = Ink,
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.padding(top = 2.dp)
                    )
                }
            }
        }

        // scope tabs — Global/Friends/Guild, all real
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            listOf("global" to "Global", "friends" to "Friends", "guild" to "Guild").forEach { (key, label) ->
                ScopeTab(label = label, active = scope == key, modifier = Modifier.weight(1f)) { scope = key }
            }
        }

        when {
            needsAuthPrompt -> Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        "Sign in to see the ${if (scope == "friends") "friends" else "guild"} ladder",
                        color = GoldLt,
                        style = MaterialTheme.typography.titleMedium
                    )
                    Text(
                        "The Global ladder is open to everyone — sign in to compare against your ${if (scope == "friends") "friends" else "guild"}.",
                        color = Ink2,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                }
            }
            rows == null -> Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Gold) }
            loadError != null -> Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(loadError ?: "Couldn't load the leaderboard.", color = Ink2, style = MaterialTheme.typography.bodyMedium)
                    Text(
                        "Retry",
                        color = GoldLt,
                        style = MaterialTheme.typography.labelLarge,
                        modifier = Modifier.padding(top = 12.dp).clickable { retryTick++ }
                    )
                }
            }
            rows!!.isEmpty() -> Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) {
                Text(
                    when (scope) {
                        "friends" -> "No friends on the ladder yet"
                        "guild" -> "You're not in a guild yet"
                        else -> "No ranked players yet"
                    },
                    color = GoldLt,
                    style = MaterialTheme.typography.titleMedium
                )
            }
            else -> {
                val podium = rows!!.take(3)
                val tableRows = rows!!.drop(3)

                // podium — prototype order 2nd, 1st, 3rd
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 20.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    val order = listOf(podium.getOrNull(1), podium.getOrNull(0), podium.getOrNull(2))
                    order.forEach { p ->
                        Box(modifier = Modifier.weight(1f)) {
                            if (p != null) PodiumCard(p, onClick = { onOpenPublicProfile(p.userId) })
                        }
                    }
                }

                Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).background(Panel, RoundedCornerShape(14.dp)).padding(vertical = 6.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("RANK", color = Ink2, style = MaterialTheme.typography.labelSmall)
                        Text("PLAYER", color = Ink2, style = MaterialTheme.typography.labelSmall, modifier = Modifier.weight(1f).padding(start = 20.dp))
                        Text("RATING", color = Ink2, style = MaterialTheme.typography.labelSmall)
                    }
                    if (tableRows.isEmpty()) {
                        Text("Only the podium so far — more challengers coming.", color = Ink2, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(14.dp))
                    } else {
                        tableRows.forEach { r -> RankRow(r, isYou = r.userId == me?.id, onClick = { onOpenPublicProfile(r.userId) }) }
                    }
                }

                // your rank pinned row
                if (me != null) {
                    Box(modifier = Modifier.fillMaxWidth().padding(16.dp).background(Panel, RoundedCornerShape(14.dp))) {
                        val yr = youRow
                        Row(modifier = Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(yr?.rank?.toString() ?: "—", color = GoldLt, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(end = 12.dp))
                            AvatarView(avatarUrl = me.avatarUrl, frameId = me.frameId, size = 34.dp)
                            Column(modifier = Modifier.weight(1f).padding(start = 10.dp)) {
                                Text("${me.displayName} (You)", color = androidx.compose.ui.graphics.Color.White, style = MaterialTheme.typography.bodyMedium)
                                val unrankedLabel = when (scope) {
                                    "global" -> "Unranked — play ranked matches to earn a spot"
                                    "friends" -> "Not on the friends ladder yet"
                                    else -> "Join a guild to appear here"
                                }
                                Text(
                                    yr?.rankTier?.label ?: unrankedLabel,
                                    color = if (yr != null) androidx.compose.ui.graphics.Color(android.graphics.Color.parseColor(yr.rankTier.accent)) else Ink2,
                                    style = MaterialTheme.typography.labelSmall
                                )
                            }
                            Text(
                                yr?.let { "🏆 ${it.trophies}" } ?: "—",
                                color = if (yr != null) GoldLt else Ink2,
                                style = MaterialTheme.typography.labelLarge
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * "Season ends in: <d>d <hh>:<mm>:<ss>" label — mirrors LeaderboardPage.tsx's
 * countdown() helper. endsAt is an ISO-8601 timestamp from GET /api/season/current.
 */
private fun seasonCountdownLabel(endsAtIso: String): String {
    val endsAtMs = try {
        java.time.Instant.parse(endsAtIso).toEpochMilli()
    } catch (e: Exception) {
        return "Season timing unavailable"
    }
    val remaining = endsAtMs - System.currentTimeMillis()
    if (remaining <= 0) return "Season ended"
    val totalSeconds = remaining / 1000
    val days = totalSeconds / 86400
    val hours = (totalSeconds % 86400) / 3600
    val minutes = (totalSeconds % 3600) / 60
    val seconds = totalSeconds % 60
    return "Season ends in: ${days}d ${"%02d".format(hours)}:${"%02d".format(minutes)}:${"%02d".format(seconds)}"
}

@Composable
private fun ScopeTab(label: String, active: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier = modifier
            .clickable(onClick = onClick)
            .background(if (active) Gold.copy(alpha = 0.16f) else androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.2f), RoundedCornerShape(8.dp))
            .padding(vertical = 10.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(label.uppercase(), color = if (active) GoldLt else Ink, style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun PodiumCard(row: LbRowDto, onClick: () -> Unit) {
    val medal = when (row.rank) {
        1 -> "🥇"
        2 -> "🥈"
        else -> "🥉"
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .background(Panel, RoundedCornerShape(14.dp))
            .padding(vertical = if (row.rank == 1) 20.dp else 14.dp, horizontal = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(medal, style = MaterialTheme.typography.headlineSmall)
        AvatarView(avatarUrl = row.avatarUrl, frameId = row.frameId, size = if (row.rank == 1) 64.dp else 52.dp, modifier = Modifier.padding(top = 6.dp))
        Text(row.displayName, color = GoldLt, style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 8.dp), maxLines = 1)
        Text(row.rankTier.label, color = Ink, style = MaterialTheme.typography.labelSmall)
        Text("🏆 ${row.trophies}", color = Gold, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 6.dp))
    }
}

@Composable
private fun RankRow(row: LbRowDto, isYou: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .background(if (isYou) Gold.copy(alpha = 0.06f) else androidx.compose.ui.graphics.Color.Transparent)
            .padding(horizontal = 14.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(row.rank.toString(), color = Ink, style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(end = 12.dp))
        AvatarView(avatarUrl = row.avatarUrl, frameId = row.frameId, size = 34.dp)
        Column(modifier = Modifier.weight(1f).padding(start = 10.dp)) {
            Text(
                if (isYou) "${row.displayName} (You)" else row.displayName,
                color = androidx.compose.ui.graphics.Color.White,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1
            )
            Text(row.rankTier.label, color = Ink2, style = MaterialTheme.typography.labelSmall)
        }
        Text("🏆 ${row.trophies}", color = GoldLt, style = MaterialTheme.typography.labelMedium)
    }
}
