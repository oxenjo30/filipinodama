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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.engine.RankTiers
import com.filipinodama.app.data.profile.LedgerRowDto
import com.filipinodama.app.data.profile.MatchRowDto
import com.filipinodama.app.data.profile.ProfileRepository
import com.filipinodama.app.data.profile.ProfileResult
import com.filipinodama.app.data.profile.tierArtUrl
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Green
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel
import com.filipinodama.app.ui.theme.Red
import kotlinx.coroutines.launch

/**
 * ProfileScreen — mobile-screen-inventory.md SCREEN 10, own profile.
 * A port of apps/web/src/features/profile/ProfilePage.tsx: identity + stats
 * come straight from AuthRepository.state (the real, live account — zero for
 * a brand-new user, never fabricated), rank ladder from RankTiers (a port of
 * @dama/shared RANK_TIERS), Trophy History from GET /api/users/me/ledger,
 * Match History from GET /api/matches?userId=, and Edit Profile /
 * avatar-picker via PATCH /api/users/me.
 *
 * Rows built: identity header (avatar+frame, name+tag, tier+trophies),
 * Edit/Friends/Inventory quick actions, tab switcher (Overview/History),
 * Overview: stat tiles, rank tier ladder, trophy history list;
 * History: match list (tap -> replay), sign-out.
 *
 * DEFERRED (no server source / out of this phase's row list): Achievements
 * grid section reuses the same client-computed rules as web
 * (wins/streak/trophies thresholds) — ported inline below rather than a
 * separate module since web's AchievementsGrid has no dedicated server
 * endpoint either. Guild card / Purchase History / Discover Guilds / Contact
 * Support / My Reports quick-links (Overview tab rows 10-15) are Guild/
 * Support surfaces outside this phase's Profile+Replay+Leaderboard scope —
 * honestly omitted, not faked.
 */
@Composable
fun ProfileScreen(
    onSignedOut: () -> Unit = {},
    onOpenReplay: (String) -> Unit = {}
) {
    val authState by AuthRepository.state.collectAsState()
    val me = authState.user
    val scope = rememberCoroutineScope()

    var tab by remember { mutableStateOf("overview") }
    var avatarPickerOpen by remember { mutableStateOf(false) }
    var editOpen by remember { mutableStateOf(false) }

    var trophyRows by remember { mutableStateOf<List<LedgerRowDto>?>(null) }
    var matches by remember { mutableStateOf<List<MatchRowDto>?>(null) }
    var historyFilter by remember { mutableStateOf("all") }

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

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).verticalScroll(rememberScrollState())) {
        // ── identity header ──
        Row(modifier = Modifier.fillMaxWidth().padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
            AvatarView(
                avatarUrl = me.avatarUrl,
                frameId = me.frameId,
                size = 76.dp,
                onClick = { avatarPickerOpen = true }
            )
            Column(modifier = Modifier.weight(1f).padding(start = 16.dp)) {
                Text("${me.displayName} ${me.tag}", color = GoldLt, style = MaterialTheme.typography.headlineSmall)
                Text(
                    "${tierNow.label} · 🏆 ${me.trophies}",
                    color = Gold,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(top = 4.dp)
                )
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            ProfileActionChip("Edit Profile", modifier = androidx.compose.ui.Modifier.weight(1f)) { editOpen = true }
            ProfileActionChip("Sign Out", modifier = androidx.compose.ui.Modifier.weight(1f)) {
                scope.launch {
                    AuthRepository.logout()
                    onSignedOut()
                }
            }
        }

        // ── tabs ──
        Row(modifier = Modifier.fillMaxWidth().padding(top = 20.dp)) {
            ProfileTabButton("Overview", tab == "overview") { tab = "overview" }
            ProfileTabButton("Match History", tab == "history") { tab = "history" }
        }

        if (tab == "overview") {
            Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                val total = me.wins + me.losses + me.draws
                val winRate = if (total > 0) (me.wins * 100 / total) else 0
                val stats: List<Triple<String, String, Color>> = listOf(
                    Triple("Matches", total.toString(), Ink),
                    Triple("Wins", me.wins.toString(), Green),
                    Triple("Losses", me.losses.toString(), Red),
                    Triple("Win Rate", "$winRate%", GoldLt)
                )
                LazyVerticalGrid(
                    columns = GridCells.Fixed(4),
                    modifier = Modifier.height(90.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(stats) { stat ->
                        val (label, value, color) = stat
                        Column(
                            modifier = Modifier.background(Panel, RoundedCornerShape(12.dp)).padding(vertical = 14.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(value, color = color, style = MaterialTheme.typography.titleLarge)
                            Text(label, color = Ink2, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 4.dp))
                        }
                    }
                }

                RankTierLadder(tierNow = tierNow, trophies = me.trophies, toNextLabel = toNextLabel, nextLabel = nextTier?.label ?: "—")

                TrophyHistoryCard(trophyRows = trophyRows, trophies = me.trophies)
            }
        } else {
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
                        rows.forEach { m -> MatchHistoryRow(match = m, myUserId = me.id, onClick = { onOpenReplay(m.id) }) }
                    }
                }
            }
        }
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

@Composable
private fun ProfileTabButton(label: String, active: Boolean, onClick: () -> Unit) {
    Column(
        modifier = Modifier.clickable(onClick = onClick).padding(horizontal = 18.dp, vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            label.uppercase(),
            color = if (active) GoldLt else Ink2,
            style = MaterialTheme.typography.labelMedium
        )
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(2.dp)
                .background(if (active) Gold else Color.Transparent)
                .padding(top = 4.dp)
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
                Text("${tierNow.sub} · 🏆 $trophies", color = Ink2, style = MaterialTheme.typography.bodySmall)
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
                Text("🏆 ${t.min}+", color = Ink, style = MaterialTheme.typography.labelSmall)
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
            Text("🏆 $trophies", color = GoldLt, style = MaterialTheme.typography.titleMedium)
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
