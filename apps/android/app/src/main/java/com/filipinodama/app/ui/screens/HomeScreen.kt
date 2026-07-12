package com.filipinodama.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import com.filipinodama.app.data.economy.ActiveMatchDto
import com.filipinodama.app.data.economy.EconomyRepository
import com.filipinodama.app.data.economy.EconomyResult
import com.filipinodama.app.data.economy.QuestDto
import com.filipinodama.app.data.match.MatchRepository
import com.filipinodama.app.data.match.PublicUserDto
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel

/**
 * Home hub — mobile-screen-inventory.md SCREEN 5. Rows built this phase:
 *   1. Currency header (gold + diamonds from AuthRepository, refreshed via
 *      GET /api/auth/me on Splash and patched live after any economy action).
 *   2. Continue Playing resume card (GET /api/matches/active) — tap resumes
 *      via MatchRepository.enterFromRoom, same resync path RoomRepository
 *      uses when a room-started match hands off to the online match screen.
 *   3. "Ready to climb?" quick play CTA -> onQuickMatch.
 *   4. Daily Reward strip -> onDailyReward.
 *   5. Daily Quests mini-list (top 2 from GET /api/quests) -> onQuests.
 *   6. Season Pass banner -> onSeason.
 *
 * DEFERRED (not in this phase's scope — no server-authoritative source and/or
 * out of the Phase 5 task list): tournaments strip, live-events admin section,
 * "Watch Live" strip (Phase 4 already ships a dedicated Live Match Browser
 * reachable from Mode Select; duplicating the entry point here isn't part of
 * this task's row list), search/notifications icons (Profile/Notifications
 * screens are a later phase). Honest omission, not a silent drop — Profile
 * tab already exists as a placeholder and nothing here fakes those rows.
 */
@Composable
fun HomeScreen(
    onQuickMatch: () -> Unit = {},
    onDailyReward: () -> Unit = {},
    onQuests: () -> Unit = {},
    onSeason: () -> Unit = {},
    onResumeMatch: (mode: String) -> Unit = {}
) {
    val authState by AuthRepository.state.collectAsState()
    val me = authState.user

    var activeMatch by remember { mutableStateOf<ActiveMatchDto?>(null) }
    var loadingActive by remember { mutableStateOf(true) }
    var homeQuests by remember { mutableStateOf<List<QuestDto>>(emptyList()) }

    LaunchedEffect(me?.id) {
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
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        CurrencyHeader(gold = me?.gold ?: 0, diamonds = me?.diamonds ?: 0)

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
            }
        }

        HeroPlayCard(onClick = onQuickMatch)

        DailyRewardStrip(onClick = onDailyReward)

        if (homeQuests.isNotEmpty()) {
            DailyQuestsCard(quests = homeQuests, onClick = onQuests)
        }

        SeasonPassBanner(onClick = onSeason)
    }
}

@Composable
private fun CurrencyHeader(gold: Int, diamonds: Int) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        CurrencyChip(icon = "🪙", value = gold, color = "#F2D493".toColor(), modifier = Modifier.weight(1f))
        CurrencyChip(icon = "💎", value = diamonds, color = "#FF9AA8".toColor(), modifier = Modifier.weight(1f))
    }
}

@Composable
private fun CurrencyChip(icon: String, value: Int, color: androidx.compose.ui.graphics.Color, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .background(Panel, RoundedCornerShape(100.dp))
            .padding(horizontal = 14.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(icon, style = MaterialTheme.typography.titleMedium)
        Text(value.toString(), color = color, style = MaterialTheme.typography.titleMedium)
    }
}

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

@Composable
private fun HeroPlayCard(onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .background(Panel, RoundedCornerShape(16.dp))
            .padding(20.dp)
    ) {
        Text("✦ RANKED SEASON ✦", color = Gold, style = MaterialTheme.typography.labelMedium)
        Text("Ready to climb?", color = GoldLt, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 6.dp))
        Text("Quick Match", color = Ink, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 4.dp))
    }
}

@Composable
private fun DailyRewardStrip(onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .background(Panel, RoundedCornerShape(14.dp))
            .padding(16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text("🎁", style = MaterialTheme.typography.titleLarge)
        Column(modifier = Modifier.weight(1f)) {
            Text("Daily Reward", color = GoldLt, style = MaterialTheme.typography.titleMedium)
            Text("Log in every day for escalating rewards", color = Ink2, style = MaterialTheme.typography.bodySmall)
        }
        Text("›", color = Gold, style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
private fun DailyQuestsCard(quests: List<QuestDto>, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .background(Panel, RoundedCornerShape(14.dp))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text("Daily Quests", color = GoldLt, style = MaterialTheme.typography.titleMedium)
        quests.forEach { q ->
            val pct = if (q.goal > 0) (q.value.coerceAtMost(q.goal) * 100 / q.goal) else 0
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(q.title, color = Ink, style = MaterialTheme.typography.bodyMedium)
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 4.dp)
                            .background(androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.4f), RoundedCornerShape(6.dp))
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(pct / 100f)
                                .background(Gold, RoundedCornerShape(6.dp))
                        ) {
                            Text("", modifier = Modifier.padding(vertical = 3.dp))
                        }
                    }
                }
                Text("+${q.rewardGold} 🪙", color = "#F2D493".toColor(), style = MaterialTheme.typography.labelMedium)
            }
        }
    }
}

@Composable
private fun SeasonPassBanner(onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .background(Panel, RoundedCornerShape(14.dp))
            .padding(16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text("👑", style = MaterialTheme.typography.titleLarge)
        Column(modifier = Modifier.weight(1f)) {
            Text("Season Pass", color = GoldLt, style = MaterialTheme.typography.titleMedium)
            Text("View your reward track", color = Ink2, style = MaterialTheme.typography.bodySmall)
        }
        Text("›", color = Gold, style = MaterialTheme.typography.titleMedium)
    }
}

private fun String.toColor(): androidx.compose.ui.graphics.Color =
    androidx.compose.ui.graphics.Color(android.graphics.Color.parseColor(this))
