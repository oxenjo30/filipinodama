package com.filipinodama.app.ui.screens.economy

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel
import kotlinx.coroutines.launch

/**
 * Daily Reward — mobile-screen-inventory.md SCREEN 24, driven by the REAL
 * admin-configurable ladder (GET /api/rewards/daily-login trackFull), exactly
 * mirroring apps/web DailyLoginBonusModal.tsx's gold/gem/chest row rendering
 * (a day can be {type:"gold",amt}, {type:"gem",amt}, or day-7's
 * {type:"chest",gold,gem}) rather than assuming a fixed 7-gold-day track.
 */
@Composable
fun DailyRewardsScreen(onBack: () -> Unit = {}) {
    val scope = rememberCoroutineScope()
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
        if (claiming) return
        claiming = true
        scope.launch {
            when (val result = EconomyRepository.claimDailyLogin()) {
                is EconomyResult.Success -> {
                    justClaimed = result.data
                    status = status?.copy(claimedToday = true)
                }
                is EconomyResult.Failure -> error = result.message
            }
            claiming = false
        }
    }

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(20.dp)) {
        Text("✦ Login Streak ✦", color = Gold, style = MaterialTheme.typography.labelMedium)
        Text("Daily Reward", color = GoldLt, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 6.dp, bottom = 4.dp))
        Text(
            "Log in every day to claim escalating rewards. Miss a day and the streak restarts at Day 1.",
            color = Ink,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(bottom = 20.dp)
        )

        when {
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
                LazyVerticalGrid(
                    columns = GridCells.Fixed(3),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    val rows = if (s.trackFull.isNotEmpty()) s.trackFull else s.track.map { DailyRewardRowDto(type = "gold", amt = it) }
                    items(rows.size) { i ->
                        val day = i + 1
                        DailyRewardDay(row = rows[i], day = day, isToday = day == s.day, isPast = day < s.day)
                    }
                }

                Box(Modifier.height(24.dp))

                val claimable = !s.claimedToday
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(enabled = claimable && !claiming, onClick = ::claim)
                        .background(if (claimable) Gold else Panel, RoundedCornerShape(12.dp))
                        .padding(vertical = 16.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = when {
                            claiming -> "Claiming…"
                            s.claimedToday -> "Claimed — come back tomorrow"
                            else -> {
                                val parts = mutableListOf<String>()
                                if (s.rewardToday > 0) parts.add("${s.rewardToday} 🪙")
                                if (s.rewardGemsToday > 0) parts.add("${s.rewardGemsToday} 💎")
                                "Claim ${parts.joinToString(" + ")}"
                            }
                        },
                        color = if (claimable) Color(0xFF2A1607) else Ink2,
                        style = MaterialTheme.typography.titleMedium
                    )
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
                Text("🎁", style = MaterialTheme.typography.displaySmall)
                Text("Day ${c.day} Claimed!", color = GoldLt, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 8.dp))
                val parts = mutableListOf<String>()
                if (c.rewardGold > 0) parts.add("+${c.rewardGold} 🪙")
                if (c.rewardGems > 0) parts.add("+${c.rewardGems} 💎")
                Text(parts.joinToString(" · "), color = Color(0xFFF2D493), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 4.dp, bottom = 16.dp))
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
                Text("💎", style = MaterialTheme.typography.titleMedium)
                Text("${row.amt ?: 0}", color = Color(0xFFF2D493), style = MaterialTheme.typography.labelMedium)
            }
            "chest" -> {
                Text("🎁", style = MaterialTheme.typography.titleMedium)
                Text("${row.gold ?: 0}🪙", color = Color(0xFFF2D493), style = MaterialTheme.typography.labelSmall)
                if ((row.gem ?: 0) > 0) Text("${row.gem}💎", color = Color(0xFFF2D493), style = MaterialTheme.typography.labelSmall)
            }
            else -> {
                Text("🪙", style = MaterialTheme.typography.titleMedium)
                Text("${row.amt ?: 0}", color = Color(0xFFF2D493), style = MaterialTheme.typography.labelMedium)
            }
        }
        if (isPast) Text("✓", color = Color(0xFF8CE0AD), style = MaterialTheme.typography.labelSmall)
    }
}
