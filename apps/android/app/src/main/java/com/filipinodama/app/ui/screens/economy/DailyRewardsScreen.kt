package com.filipinodama.app.ui.screens.economy

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
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
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.economy.DailyLoginStatusResponse
import com.filipinodama.app.data.economy.DailyRewardRowDto
import com.filipinodama.app.data.economy.EconomyRepository
import com.filipinodama.app.data.economy.EconomyResult
import com.filipinodama.app.ui.components.CurrencyAmount
import com.filipinodama.app.ui.components.CurrencyIcon
import com.filipinodama.app.ui.components.CurrencyIconKind
import com.filipinodama.app.ui.components.MockupBackButton
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel
import kotlinx.coroutines.launch

/**
 * Daily Reward — mobile-screen-inventory.md SCREEN 24, rebuilt 1:1 against
 * handoffv3/FilipinoDama Mobile.dc.html lines 2658-2725 (Tier-2 UI-fidelity
 * pass). Driven by the REAL admin-configurable ladder (GET
 * /api/rewards/daily-login trackFull), exactly mirroring apps/web
 * DailyLoginBonusModal.tsx's gold/gem/chest row rendering (a day can be
 * {type:"gold",amt}, {type:"gem",amt}, or day-7's {type:"chest",gold,gem}).
 * Mockup layout the prior build was missing: a streak PROGRESS BAR above the
 * grid (gradient fill, day/track fraction) plus a header progress pill; days
 * 1-6 in a 3-col grid; Day 7 rendered as its OWN distinct wide "Grand
 * Reward" card below the grid (chest art, title, gold+gem amounts,
 * checkmark/Today badge) rather than folded into the uniform grid.
 */
@Composable
fun DailyRewardsScreen(onBack: () -> Unit = {}, onRequireSignIn: () -> Unit = {}) {
    val scope = rememberCoroutineScope()
    val signedIn = com.filipinodama.app.data.AuthRepository.state.collectAsState().value.user != null
    var status by remember { mutableStateOf<DailyLoginStatusResponse?>(null) }
    var claiming by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var justClaimed by remember { mutableStateOf<com.filipinodama.app.data.economy.DailyLoginClaimResponse?>(null) }
    // Phase 7 retry affordance: bump to re-run the initial load below.
    var retryTick by remember { mutableStateOf(0) }

    LaunchedEffect(retryTick) {
        when (val result = EconomyRepository.dailyLoginStatus()) {
            is EconomyResult.Success -> status = result.data
            is EconomyResult.Failure -> error = result.message
        }
    }

    fun claim() {
        // Owner policy: claiming a reward requires an account. An anonymous
        // user (no session) is sent to Login instead of silently 401ing.
        if (!signedIn) { onRequireSignIn(); return }
        if (claiming) return
        claiming = true
        scope.launch {
            when (val result = EconomyRepository.claimDailyLogin()) {
                is EconomyResult.Success -> {
                    justClaimed = result.data
                    status = status?.copy(claimedToday = true)
                }
                // Universal rule: an auth failure (session expired between load
                // and claim) routes to the guided sign-in prompt, not a generic
                // error message.
                is EconomyResult.Failure ->
                    if (com.filipinodama.app.ui.components.isAuthError(result.code)) onRequireSignIn()
                    else error = result.message
            }
            claiming = false
        }
    }

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(16.dp, 20.dp)) {
        val statusNow = status
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            MockupBackButton(onClick = onBack)
            if (statusNow != null) {
                val trackSize = if (statusNow.trackFull.isNotEmpty()) statusNow.trackFull.size else statusNow.track.size.coerceAtLeast(1)
                // Mockup drProgLabel = daysClaimed + ' / 7 days' (days already
                // claimed this cycle, not the current day index).
                val daysClaimed = (statusNow.day - 1 + if (statusNow.claimedToday) 1 else 0).coerceIn(0, trackSize)
                Box(
                    modifier = Modifier
                        .border(1.dp, Color(0x4DE8B84B), RoundedCornerShape(100.dp))
                        .padding(horizontal = 11.dp, vertical = 5.dp)
                ) { Text("$daysClaimed / $trackSize days", color = Color(0xFFC79A4E), style = MaterialTheme.typography.labelSmall) }
            }
        }
        Text("✦ Login Streak ✦", color = Color(0xFFC79A4E), style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 12.dp))
        Text("Daily Reward", color = Color(0xFFF4D886), style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 6.dp, bottom = 4.dp))
        Text(
            "Log in every day to claim escalating rewards. Miss a day and the streak restarts at Day 1.",
            color = Color(0xFF9A8BBF),
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(bottom = 20.dp)
        )

        when {
            // Anonymous user (owner policy: no auto-guest) — the reward track is
            // account-bound, so show a clean "sign in to claim" state instead of
            // the raw "Not authenticated" 401 error.
            !signedIn -> Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth().padding(top = 40.dp)) {
                Text("Sign in to claim your daily reward", color = GoldLt, style = MaterialTheme.typography.titleMedium)
                Text(
                    "Daily login bonuses are saved to your account.",
                    color = Ink2,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(top = 8.dp, bottom = 16.dp)
                )
                Box(
                    modifier = Modifier
                        .clickable(onClick = onRequireSignIn)
                        .background(Gold, RoundedCornerShape(12.dp))
                        .padding(horizontal = 28.dp, vertical = 13.dp)
                ) { Text("Sign In", color = Color(0xFF2A1607), style = MaterialTheme.typography.titleMedium) }
            }
            // Only the INITIAL load failing (status still null) gets a full
            // retry affordance here — a claim() failure with status already
            // loaded is surfaced inline near the claim button below instead,
            // where its own re-tap already IS the retry action.
            error != null && status == null -> Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth().padding(top = 20.dp)) {
                Text(error ?: "", color = Ink2, style = MaterialTheme.typography.bodyMedium)
                Text(
                    "Retry",
                    color = GoldLt,
                    style = MaterialTheme.typography.labelLarge,
                    modifier = Modifier.padding(top = 12.dp).clickable { error = null; retryTick++ }
                )
            }
            status == null -> Box(Modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Gold) }
            else -> {
                val s = status!!
                val rows = if (s.trackFull.isNotEmpty()) s.trackFull else s.track.map { DailyRewardRowDto(type = "gold", amt = it) }
                val trackSize = rows.size.coerceAtLeast(1)
                val gridRows = rows.take(trackSize - 1) // Day 7 (last) rendered as its own grand card below
                val grandRow = rows.lastOrNull()
                val grandDay = trackSize

                // Streak progress bar (mockup drProgPct/drStreakLabel).
                Row(modifier = Modifier.fillMaxWidth().padding(bottom = 22.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(
                        modifier = Modifier.weight(1f).height(8.dp)
                            .background(Color(0x66000000), RoundedCornerShape(5.dp))
                            .border(1.dp, Color(0x24E8B84B), RoundedCornerShape(5.dp))
                    ) {
                        val pct = (s.day.toFloat() / trackSize.toFloat()).coerceIn(0f, 1f)
                        Box(
                            modifier = Modifier.fillMaxHeight().fillMaxWidth(pct)
                                .background(androidx.compose.ui.graphics.Brush.horizontalGradient(listOf(Color(0xFFC98B2E), Color(0xFFF7E2A0))), RoundedCornerShape(5.dp))
                        )
                    }
                    // Mockup drStreakLabel: "Cycle complete — resets tomorrow"
                    // when the whole 7-day cycle is claimed, else "Day N of 7".
                    val cycleDone = s.claimedToday && s.day >= trackSize
                    val streakLabel = if (cycleDone) "Cycle complete — resets tomorrow" else "Day ${s.day} of $trackSize"
                    Text(streakLabel, color = Color(0xFFC9B8E8), style = MaterialTheme.typography.labelSmall)
                }

                LazyVerticalGrid(
                    columns = GridCells.Fixed(3),
                    horizontalArrangement = Arrangement.spacedBy(11.dp),
                    verticalArrangement = Arrangement.spacedBy(11.dp),
                    modifier = Modifier.fillMaxWidth().height((((gridRows.size + 2) / 3) * 110).dp)
                ) {
                    items(gridRows.size) { i ->
                        val day = i + 1
                        DailyRewardDay(row = gridRows[i], day = day, isToday = day == s.day, isPast = day < s.day)
                    }
                }

                if (grandRow != null) {
                    Box(Modifier.height(12.dp))
                    GrandRewardCard(row = grandRow, day = grandDay, isToday = grandDay == s.day, isClaimed = grandDay < s.day)
                }

                Box(Modifier.height(22.dp))

                val claimable = !s.claimedToday
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(enabled = claimable && !claiming, onClick = ::claim)
                        .background(if (claimable) Gold else Panel, RoundedCornerShape(14.dp))
                        .padding(vertical = 16.dp),
                    contentAlignment = Alignment.Center
                ) {
                    when {
                        claiming -> Text("Claiming…", color = if (claimable) Color(0xFF2A1607) else Ink2, style = MaterialTheme.typography.titleMedium)
                        s.claimedToday -> Text("Claimed — come back tomorrow", color = if (claimable) Color(0xFF2A1607) else Ink2, style = MaterialTheme.typography.titleMedium)
                        else -> {
                            val textColor = if (claimable) Color(0xFF2A1607) else Ink2
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text("Claim", color = textColor, style = MaterialTheme.typography.titleMedium)
                                if (s.rewardToday > 0) {
                                    CurrencyAmount(kind = CurrencyIconKind.COIN, text = s.rewardToday.toString(), color = textColor, style = MaterialTheme.typography.titleMedium)
                                }
                                if (s.rewardToday > 0 && s.rewardGemsToday > 0) Text("+", color = textColor, style = MaterialTheme.typography.titleMedium)
                                if (s.rewardGemsToday > 0) {
                                    CurrencyAmount(kind = CurrencyIconKind.GEM, text = s.rewardGemsToday.toString(), color = textColor, style = MaterialTheme.typography.titleMedium)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (justClaimed != null) {
        val c = justClaimed!!
        Box(
            modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.6f)).clickable { justClaimed = null },
            contentAlignment = Alignment.Center
        ) {
            Column(
                modifier = Modifier.background(Panel, RoundedCornerShape(18.dp)).padding(28.dp).clickable(enabled = false) {},
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                CurrencyIcon(kind = CurrencyIconKind.CHEST, size = 40.dp)
                Text("Day ${c.day} Claimed!", color = GoldLt, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 8.dp))
                Row(
                    modifier = Modifier.padding(top = 4.dp, bottom = 16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    if (c.rewardGold > 0) {
                        CurrencyAmount(kind = CurrencyIconKind.COIN, text = c.rewardGold.toString(), prefix = "+", color = Color(0xFFF2D493), style = MaterialTheme.typography.titleMedium)
                    }
                    if (c.rewardGems > 0) {
                        CurrencyAmount(kind = CurrencyIconKind.GEM, text = c.rewardGems.toString(), prefix = "+", color = Color(0xFFF2D493), style = MaterialTheme.typography.titleMedium)
                    }
                }
                Box(
                    modifier = Modifier.clickable { justClaimed = null }.background(Gold, RoundedCornerShape(10.dp)).padding(horizontal = 24.dp, vertical = 12.dp)
                ) { Text("Collect", color = Color(0xFF2A1607), style = MaterialTheme.typography.labelLarge) }
            }
        }
    }
}

@Composable
private fun DailyRewardDay(row: DailyRewardRowDto, day: Int, isToday: Boolean, isPast: Boolean) {
    Column(
        modifier = Modifier
            .aspectRatio(0.85f)
            .background(
                if (isToday) Gold.copy(alpha = 0.18f) else if (isPast) Color(0xFF8CE0AD).copy(alpha = 0.1f) else Color(0xFF0F0820).copy(alpha = 0.5f),
                RoundedCornerShape(10.dp)
            )
            .padding(6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("DAY $day", color = if (isToday) GoldLt else Ink2, style = MaterialTheme.typography.labelSmall)
        when (row.type) {
            "gem" -> {
                CurrencyIcon(kind = CurrencyIconKind.GEM, size = 18.dp)
                Text("${row.amt ?: 0}", color = Color(0xFFF2D493), style = MaterialTheme.typography.labelMedium)
            }
            "chest" -> {
                CurrencyIcon(kind = CurrencyIconKind.CHEST, size = 18.dp)
                CurrencyAmount(kind = CurrencyIconKind.COIN, text = "${row.gold ?: 0}", color = Color(0xFFF2D493), style = MaterialTheme.typography.labelSmall)
                if ((row.gem ?: 0) > 0) CurrencyAmount(kind = CurrencyIconKind.GEM, text = "${row.gem}", color = Color(0xFFF2D493), style = MaterialTheme.typography.labelSmall)
            }
            else -> {
                CurrencyIcon(kind = CurrencyIconKind.COIN, size = 18.dp)
                Text("${row.amt ?: 0}", color = Color(0xFFF2D493), style = MaterialTheme.typography.labelMedium)
            }
        }
        if (isPast) Text("✓", color = Color(0xFF8CE0AD), style = MaterialTheme.typography.labelSmall)
    }
}

/**
 * Day 7 · Grand Reward — mockup's `drGrand` (lines 2696-2720): a distinct
 * wide card below the 1-6 grid, chest art, title + checkmark/Today badge,
 * gold+gem amounts. Never folded into the uniform 3-col grid.
 */
@Composable
private fun GrandRewardCard(row: DailyRewardRowDto, day: Int, isToday: Boolean, isClaimed: Boolean) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                if (isToday) androidx.compose.ui.graphics.Brush.linearGradient(listOf(Color(0x33E8B84B), Color(0xE61B1030)))
                else androidx.compose.ui.graphics.Brush.linearGradient(listOf(Color(0xCC1B1030), Color(0xCC1B1030))),
                RoundedCornerShape(16.dp)
            )
            .border(1.dp, if (isToday) Color(0x80E8B84B) else Color(0x24E8B84B), RoundedCornerShape(16.dp))
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        CurrencyIcon(kind = CurrencyIconKind.CHEST, size = 58.dp)
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Day $day · Grand Reward", color = Color(0xFFF4D886), style = MaterialTheme.typography.titleMedium)
                if (isClaimed) {
                    Box(modifier = Modifier.size(18.dp).background(Color(0xE63FBF6F), androidx.compose.foundation.shape.CircleShape), contentAlignment = Alignment.Center) {
                        Text("✓", color = Color(0xFF08210F), style = MaterialTheme.typography.labelSmall)
                    }
                } else if (isToday) {
                    Box(
                        modifier = Modifier
                            .background(androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Color(0xFFF7E2A0), Color(0xFFD5A63A))), RoundedCornerShape(100.dp))
                            .padding(horizontal = 7.dp, vertical = 2.dp)
                    ) { Text("Today", color = Color(0xFF2A1A06), style = MaterialTheme.typography.labelSmall) }
                }
            }
            Row(modifier = Modifier.padding(top = 7.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                CurrencyAmount(kind = CurrencyIconKind.COIN, text = "${row.gold ?: row.amt ?: 0}", color = Color(0xFFF0CF72), style = MaterialTheme.typography.titleSmall)
                if ((row.gem ?: 0) > 0) {
                    CurrencyAmount(kind = CurrencyIconKind.GEM, text = "${row.gem}", color = Color(0xFF8FD0FF), style = MaterialTheme.typography.titleSmall)
                }
            }
        }
    }
}
