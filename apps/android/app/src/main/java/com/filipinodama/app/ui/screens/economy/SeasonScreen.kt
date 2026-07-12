package com.filipinodama.app.ui.screens.economy

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.filipinodama.app.data.economy.EconomyRepository
import com.filipinodama.app.data.economy.EconomyResult
import com.filipinodama.app.data.economy.SeasonCurrentResponse
import com.filipinodama.app.data.economy.SeasonRewardDto
import com.filipinodama.app.data.economy.SeasonTierDto
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel
import kotlinx.coroutines.launch

/**
 * Season Pass — mobile-screen-inventory.md SCREEN 33. Reward Track tab (free
 * + premium tiers, Royal Pass unlock) built this phase; Standings tab is
 * deferred (leaderboard is a later profile-adjacent phase, not in this
 * task's row list). Pass purchase honors GET /api/season/current's real
 * passCurrency/passPrice (gold today under the gold-only economy) — NEVER a
 * hardcoded diamond price, per task instructions.
 */
@Composable
fun SeasonScreen(onBack: () -> Unit = {}) {
    val scope = rememberCoroutineScope()
    var data by remember { mutableStateOf<SeasonCurrentResponse?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var busyTier by remember { mutableStateOf<Int?>(null) }
    var buyingPass by remember { mutableStateOf(false) }

    suspend fun load() {
        when (val result = EconomyRepository.seasonCurrent()) {
            is EconomyResult.Success -> { data = result.data; error = null }
            is EconomyResult.Failure -> error = result.message
        }
    }

    LaunchedEffect(Unit) { load() }

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(20.dp)) {
        Text("✦ Ranked Season ✦", color = Gold, style = MaterialTheme.typography.labelMedium)

        when {
            error != null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(error ?: "", color = Ink2, style = MaterialTheme.typography.bodyMedium)
                    Text(
                        "Retry",
                        color = GoldLt,
                        style = MaterialTheme.typography.labelLarge,
                        modifier = Modifier.padding(top = 12.dp).clickable { scope.launch { load() } }
                    )
                }
            }
            data == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Gold) }
            else -> {
                val s = data!!
                Text(s.season.name, color = GoldLt, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 6.dp, bottom = 4.dp))
                Text("Ends ${endsInLabel(s.season.endsAt)}", color = Ink2, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(bottom = 16.dp))

                Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                    // Level bar — XP against the highest tier gate present.
                    val maxXp = s.tiers.maxOfOrNull { it.xp } ?: 1
                    val pct = (s.xp.toFloat() / maxXp.coerceAtLeast(1)).coerceIn(0f, 1f)
                    Text("${s.xp} XP", color = Ink, style = MaterialTheme.typography.labelMedium)
                    Box(
                        modifier = Modifier.fillMaxWidth().height(10.dp).padding(top = 6.dp, bottom = 20.dp)
                            .background(Color.Black.copy(alpha = 0.4f), RoundedCornerShape(6.dp))
                    ) {
                        Box(modifier = Modifier.fillMaxWidth(pct).height(10.dp).background(Gold, RoundedCornerShape(6.dp)))
                    }

                    if (!s.hasPass) {
                        RoyalPassBanner(
                            price = s.passPrice,
                            currency = s.passCurrency,
                            busy = buyingPass,
                            onUnlock = {
                                buyingPass = true
                                scope.launch {
                                    EconomyRepository.buySeasonPass()
                                    load()
                                    buyingPass = false
                                }
                            }
                        )
                    } else {
                        Box(
                            modifier = Modifier.fillMaxWidth().background(Color(0xFF2F8F5B).copy(alpha = 0.14f), RoundedCornerShape(12.dp)).padding(14.dp)
                        ) {
                            Text("👑 Royal Pass Active", color = Color(0xFF7EE6A4), style = MaterialTheme.typography.titleSmall)
                        }
                    }

                    Text("Reward Track", color = GoldLt, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 20.dp, bottom = 10.dp))
                    Row(modifier = Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        s.tiers.forEach { tier ->
                            SeasonTierCard(
                                tier = tier,
                                hasPass = s.hasPass,
                                busy = busyTier == tier.tier,
                                onClaimFree = {
                                    busyTier = tier.tier
                                    scope.launch { EconomyRepository.claimSeasonTier(tier.tier); load(); busyTier = null }
                                }
                            )
                        }
                    }
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

@Composable
private fun RoyalPassBanner(price: Int, currency: String, busy: Boolean, onUnlock: () -> Unit) {
    val cur = if (currency == "DIAMONDS") "💎" else "🪙"
    Column(
        modifier = Modifier.fillMaxWidth().background(Panel, RoundedCornerShape(14.dp)).padding(16.dp)
    ) {
        Text("Unlock the Royal Pass", color = GoldLt, style = MaterialTheme.typography.titleMedium)
        Text(
            "Claim the premium reward on every level — exclusive skins, frames & bonus rewards.",
            color = Ink,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.padding(top = 4.dp, bottom = 12.dp)
        )
        Box(
            modifier = Modifier
                .clickable(enabled = !busy, onClick = onUnlock)
                .background(Gold, RoundedCornerShape(10.dp))
                .padding(horizontal = 20.dp, vertical = 12.dp)
        ) {
            Text(if (busy) "…" else "Unlock · $cur $price", color = Color(0xFF2A1607), style = MaterialTheme.typography.labelLarge)
        }
    }
}

@Composable
private fun SeasonTierCard(tier: SeasonTierDto, hasPass: Boolean, busy: Boolean, onClaimFree: () -> Unit) {
    Column(
        modifier = Modifier.width(140.dp).background(Panel, RoundedCornerShape(12.dp)).padding(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("Lvl ${tier.tier}", color = GoldLt, style = MaterialTheme.typography.labelLarge)
        Box(Modifier.height(8.dp))
        RewardCell(reward = tier.freeReward, premium = false)
        Box(Modifier.height(6.dp))
        TierActionButton(
            unlocked = tier.unlocked,
            claimed = tier.claimed,
            busy = busy,
            onClaim = onClaimFree
        )
        Box(Modifier.height(10.dp))
        RewardCell(reward = tier.premiumReward, premium = true)
        Box(Modifier.height(6.dp))
        if (!hasPass) {
            Text("Royal Pass", color = Ink2, style = MaterialTheme.typography.labelSmall)
        } else {
            TierActionButton(unlocked = tier.unlocked, claimed = tier.claimed, busy = false, onClaim = {})
        }
    }
}

@Composable
private fun RewardCell(reward: SeasonRewardDto?, premium: Boolean) {
    val (icon, label) = rewardLabel(reward, premium)
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(icon, style = MaterialTheme.typography.titleMedium)
        Text(label, color = Ink, style = MaterialTheme.typography.labelSmall)
    }
}

private fun rewardLabel(r: SeasonRewardDto?, premium: Boolean): Pair<String, String> {
    if (r == null) return if (premium) "👑" to "Royal Reward" else "🎁" to "Reward"
    if ((r.trophies ?: 0) > 0) return "🏆" to "${r.trophies} Trophies"
    if ((r.diamonds ?: 0) > 0) return "💎" to "${r.diamonds} Diamonds"
    if ((r.gold ?: 0) > 0) return "🪙" to "${r.gold} Gold"
    return if (premium) "👑" to "Royal Reward" else "🎁" to "Reward"
}

private data class TierButtonState(val label: String, val enabled: Boolean, val background: Color, val foreground: Color)

@Composable
private fun TierActionButton(unlocked: Boolean, claimed: Boolean, busy: Boolean, onClaim: () -> Unit) {
    val (label, enabled, bg, fg) = when {
        claimed -> TierButtonState("Claimed", false, Color(0xFF2F8F5B).copy(alpha = 0.16f), Color(0xFF7EE6A4))
        unlocked -> TierButtonState(if (busy) "…" else "Claim", !busy, Gold, Color(0xFF2A1607))
        else -> TierButtonState("Locked", false, Color(0xFF0F0820).copy(alpha = 0.5f), Ink2)
    }
    Box(
        modifier = Modifier
            .clickable(enabled = enabled, onClick = onClaim)
            .background(bg, RoundedCornerShape(8.dp))
            .padding(horizontal = 10.dp, vertical = 6.dp)
    ) {
        Text(label, color = fg, style = MaterialTheme.typography.labelSmall)
    }
}
