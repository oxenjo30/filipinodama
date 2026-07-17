package com.filipinodama.app.ui.screens.economy

import androidx.compose.foundation.Image
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.filipinodama.app.data.economy.EconomyRepository
import com.filipinodama.app.data.economy.EconomyResult
import com.filipinodama.app.data.economy.SeasonCurrentResponse
import com.filipinodama.app.data.economy.SeasonEndStatusResponse
import com.filipinodama.app.data.economy.SeasonRewardDto
import com.filipinodama.app.data.economy.SeasonTierDto
import com.filipinodama.app.data.leaderboard.LbRowDto
import com.filipinodama.app.data.leaderboard.LeaderboardRepository
import com.filipinodama.app.data.leaderboard.LeaderboardResult
import com.filipinodama.app.ui.screens.profile.AvatarView
import com.filipinodama.app.R
import com.filipinodama.app.ui.components.CurrencyAmount
import com.filipinodama.app.ui.components.CurrencyIcon
import com.filipinodama.app.ui.components.CurrencyIconKind
import com.filipinodama.app.ui.components.LocalSnackbar
import com.filipinodama.app.ui.components.MockupBackButton
import com.filipinodama.app.ui.components.PullRefreshContainer
import com.filipinodama.app.ui.components.screenInsets
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
fun SeasonScreen(onBack: () -> Unit = {}, onRequireSignIn: () -> Unit = {}) {
    val scope = rememberCoroutineScope()
    val snackbar = LocalSnackbar.current
    val signedInUser = com.filipinodama.app.data.AuthRepository.state.collectAsState().value.user
    val signedIn = signedInUser != null && signedInUser.isGuest != true
    var data by remember { mutableStateOf<SeasonCurrentResponse?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var busyTier by remember { mutableStateOf<Int?>(null) }
    var buyingPass by remember { mutableStateOf(false) }
    // Season-end reward (parity with web's "Claim All Rewards"). Only rendered
    // when the current season has ended and the one-time placement bonus is
    // unclaimed. Null until the end-status probe returns.
    var endStatus by remember { mutableStateOf<SeasonEndStatusResponse?>(null) }
    var claimingEnd by remember { mutableStateOf(false) }
    // Standings tab (mockup seasonTabRanking) — real GET /api/leaderboard
    // global rows, the same endpoint web's LeaderboardPage uses.
    var tab by remember { mutableStateOf("rewards") }
    var standings by remember { mutableStateOf<List<LbRowDto>?>(null) }
    var standingsMe by remember { mutableStateOf<LbRowDto?>(null) }
    var standingsError by remember { mutableStateOf(false) }

    LaunchedEffect(tab) {
        if (tab == "standings" && standings == null) {
            when (val r = LeaderboardRepository.leaderboard("global")) {
                is LeaderboardResult.Success -> {
                    standings = r.data.rows
                    standingsMe = r.data.me
                }
                is LeaderboardResult.Failure -> standingsError = true
            }
        }
    }

    suspend fun load() {
        when (val result = EconomyRepository.seasonCurrent()) {
            is EconomyResult.Success -> { data = result.data; error = null }
            is EconomyResult.Failure -> error = result.message
        }
    }

    // Shared claim handler for BOTH the free and premium (Royal) tier buttons.
    // The server's POST /api/season/claim { tier } grants the free reward AND the
    // premium reward together when the user owns the pass (seasons.ts), so a single
    // call per tier covers both tracks — the premium button just triggers the same
    // claim. Previously the premium button was wired to an empty lambda (dead: a
    // paid reward couldn't be collected) and the free path discarded its result.
    suspend fun loadEndStatus() {
        when (val r = EconomyRepository.seasonEndStatus()) {
            is EconomyResult.Success -> endStatus = r.data
            is EconomyResult.Failure -> { /* non-blocking: the end banner just stays hidden */ }
        }
    }

    // Claim the one-time season-end placement reward (parity with web).
    fun claimEnd() {
        if (!signedIn) { onRequireSignIn(); return }
        if (claimingEnd) return
        claimingEnd = true
        scope.launch {
            when (val r = EconomyRepository.claimSeasonEnd()) {
                is EconomyResult.Success -> {
                    snackbar.show("Season rewards claimed!")
                    loadEndStatus()
                }
                is EconomyResult.Failure ->
                    if (com.filipinodama.app.ui.components.isAuthError(r.code)) onRequireSignIn()
                    else snackbar.show(r.message)
            }
            claimingEnd = false
        }
    }

    fun claimTier(tier: Int) {
        // Owner policy: claiming requires an account.
        if (!signedIn) { onRequireSignIn(); return }
        if (busyTier != null) return
        busyTier = tier
        scope.launch {
            when (val r = EconomyRepository.claimSeasonTier(tier)) {
                is EconomyResult.Success -> load()
                is EconomyResult.Failure ->
                    if (com.filipinodama.app.ui.components.isAuthError(r.code)) onRequireSignIn()
                    else snackbar.show(r.message)
            }
            busyTier = null
        }
    }

    LaunchedEffect(Unit) { load(); loadEndStatus() }

    Box(modifier = Modifier.fillMaxSize().screenInsets()) {
    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(20.dp)) {
        MockupBackButton(onClick = onBack)
        Text("✦ RANKED SEASON ✦", color = Gold, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 12.dp))

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

                // Pull down to RE-FETCH season progress + end-status from the
                // server (load() + loadEndStatus() — the same calls the entry
                // LaunchedEffect runs), not a cosmetic spinner.
                PullRefreshContainer(onRefresh = { load(); loadEndStatus() }) {
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

                    // Tab row — mockup "⚔ Reward Track" / "🏆 Standings".
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(bottom = 16.dp)) {
                        SeasonTab("⚔ Reward Track", tab == "rewards") { tab = "rewards" }
                        SeasonTab("🏆 Standings", tab == "standings") { tab = "standings" }
                    }

                    if (tab == "standings") {
                        Text("Season Standings", color = Color(0xFFF4D886), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(bottom = 12.dp))
                        when {
                            standingsError -> Text("Couldn't load standings — try again shortly.", color = Ink2, style = MaterialTheme.typography.bodyMedium)
                            standings == null -> Box(Modifier.fillMaxWidth().padding(vertical = 24.dp), contentAlignment = Alignment.Center) {
                                CircularProgressIndicator(color = Gold)
                            }
                            else -> {
                                Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                                    standings!!.forEach { r -> StandingsRow(r) }
                                }
                                standingsMe?.let { meRow -> StandingsYouRow(meRow) }
                            }
                        }
                        Box(Modifier.height(24.dp))
                        return@Column
                    }

                    // Season-end reward banner (parity with web "Claim All Rewards").
                    // Only when the season has ended and the one-time placement
                    // bonus is unclaimed. `endStatus.ended` also implies the reward
                    // is present per the server contract.
                    endStatus?.let { es ->
                        if (es.ended && es.reward != null) {
                            SeasonEndBanner(
                                reward = es.reward!!,
                                claimed = es.claimed,
                                busy = claimingEnd,
                                onClaim = { claimEnd() }
                            )
                            Box(Modifier.height(16.dp))
                        }
                    }

                    if (!s.hasPass) {
                        RoyalPassBanner(
                            price = s.passPrice,
                            currency = s.passCurrency,
                            busy = buyingPass,
                            onUnlock = {
                                // Mirror the claim button's gate: an anonymous user
                                // must sign in first instead of the purchase
                                // silently doing nothing.
                                if (!signedIn) { onRequireSignIn() } else {
                                    buyingPass = true
                                    scope.launch {
                                        when (val result = EconomyRepository.buySeasonPass()) {
                                            is EconomyResult.Success -> load()
                                            is EconomyResult.Failure -> {
                                                if (com.filipinodama.app.ui.components.isAuthError(result.code)) {
                                                    onRequireSignIn()
                                                } else {
                                                    snackbar.show(result.message)
                                                }
                                            }
                                        }
                                        buyingPass = false
                                    }
                                }
                            }
                        )
                    } else {
                        Row(
                            modifier = Modifier.fillMaxWidth().background(Color(0xFF2F8F5B).copy(alpha = 0.14f), RoundedCornerShape(12.dp)).padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Image(painter = painterResource(id = R.drawable.me_crown), contentDescription = null, modifier = Modifier.size(18.dp))
                            Text("Royal Pass Active", color = Color(0xFF7EE6A4), style = MaterialTheme.typography.titleSmall)
                        }
                    }

                    Text("Reward Track", color = GoldLt, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 20.dp, bottom = 10.dp))
                    Row(modifier = Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        s.tiers.forEach { tier ->
                            SeasonTierCard(
                                tier = tier,
                                hasPass = s.hasPass,
                                busy = busyTier == tier.tier,
                                onClaim = { claimTier(tier.tier) }
                            )
                        }
                    }
                }
                } // PullRefreshContainer
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
private fun SeasonTab(label: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clickable(onClick = onClick)
            .background(
                if (selected) androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Color(0xFFEFC25A), Color(0xFFC9971F)))
                else androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Color(0xB31B1030), Color(0xB31B1030))),
                RoundedCornerShape(100.dp)
            )
            .padding(horizontal = 15.dp, vertical = 9.dp)
    ) {
        Text(label, color = if (selected) Color(0xFF2A1608) else Color(0xFF9A8BBF), style = MaterialTheme.typography.labelMedium)
    }
}

/**
 * Standings row — mockup seasonBoard row (mobile-split.txt lines 3446-3466):
 * medal image for top 3 / mono rank number otherwise, avatar, name,
 * tier label in the tier's accent color, trophy count.
 */
@Composable
private fun StandingsRow(r: LbRowDto) {
    val tierColor = try {
        Color(android.graphics.Color.parseColor(r.rankTier.accent))
    } catch (_: Exception) {
        Ink2
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xD91B1030), RoundedCornerShape(14.dp))
            .padding(horizontal = 13.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Box(modifier = Modifier.width(30.dp), contentAlignment = Alignment.Center) {
            when (r.rank) {
                1 -> Image(painterResource(R.drawable.medal_1), contentDescription = null, modifier = Modifier.size(26.dp))
                2 -> Image(painterResource(R.drawable.medal_2), contentDescription = null, modifier = Modifier.size(26.dp))
                3 -> Image(painterResource(R.drawable.medal_3), contentDescription = null, modifier = Modifier.size(26.dp))
                else -> Text("#${r.rank}", color = Color(0xFF8B7CAE), style = MaterialTheme.typography.labelLarge)
            }
        }
        AvatarView(avatarUrl = r.avatarUrl, size = 40.dp, frameId = r.frameId, ring = false)
        Column(modifier = Modifier.weight(1f)) {
            Text(r.displayName, color = Color(0xFFF2E9D2), style = MaterialTheme.typography.titleSmall, maxLines = 1)
            Text(r.rankTier.label, color = tierColor, style = MaterialTheme.typography.labelSmall)
        }
        CurrencyAmount(kind = CurrencyIconKind.TROPHY, text = r.trophies.toString(), color = Color(0xFFF2D493), style = MaterialTheme.typography.labelLarge)
    }
}

/** Pinned "your row" — gold-bordered card with the YOU badge (mockup seasonYou). */
@Composable
private fun StandingsYouRow(r: LbRowDto) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 12.dp)
            .background(
                androidx.compose.ui.graphics.Brush.linearGradient(listOf(Color(0x29E8B84B), Color(0x1A0F0820))),
                RoundedCornerShape(14.dp)
            )
            .border(1.dp, Color(0xFFE8B84B), RoundedCornerShape(14.dp))
            .padding(13.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("#${r.rank}", color = Color(0xFFF4D886), style = MaterialTheme.typography.labelLarge, modifier = Modifier.width(30.dp))
        AvatarView(avatarUrl = r.avatarUrl, size = 40.dp, frameId = r.frameId, ring = false)
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                Text(r.displayName, color = Color(0xFFF4D886), style = MaterialTheme.typography.titleSmall, maxLines = 1)
                Box(
                    modifier = Modifier
                        .background(
                            androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Color(0xFFF7E2A0), Color(0xFFD5A63A))),
                            RoundedCornerShape(100.dp)
                        )
                        .padding(horizontal = 7.dp, vertical = 2.dp)
                ) { Text("YOU", color = Color(0xFF1A0F2E), style = MaterialTheme.typography.labelSmall) }
            }
            Text(r.rankTier.label, color = Color(0xFFC9A4FF), style = MaterialTheme.typography.labelSmall)
        }
        CurrencyAmount(kind = CurrencyIconKind.TROPHY, text = r.trophies.toString(), color = Color(0xFFF2D493), style = MaterialTheme.typography.labelLarge)
    }
}

/**
 * Season-end reward banner — mirrors web's end-of-season "Claim All Rewards".
 * Shows final placement + the gold (and diamonds, if any) payout with a claim
 * button; once claimed, a passive confirmation. Rendered only when the season
 * has ended and the placement reward exists.
 */
@Composable
private fun SeasonEndBanner(
    reward: com.filipinodama.app.data.economy.SeasonEndRewardDto,
    claimed: Boolean,
    busy: Boolean,
    onClaim: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Color(0x33E8B84B), Color(0x140F0820))),
                RoundedCornerShape(14.dp)
            )
            .border(1.dp, Color(0x55E8B84B), RoundedCornerShape(14.dp))
            .padding(16.dp)
    ) {
        Text("🏆 Season Ended", color = GoldLt, style = MaterialTheme.typography.titleMedium)
        Text(
            "Final placement: #${reward.rank}",
            color = Ink,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(top = 4.dp)
        )
        Row(
            modifier = Modifier.padding(top = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (reward.gold > 0) {
                CurrencyAmount(kind = CurrencyIconKind.COIN, text = reward.gold.toString(), color = GoldLt, style = MaterialTheme.typography.titleSmall)
            }
            if (reward.diamonds > 0) {
                CurrencyAmount(kind = CurrencyIconKind.GEM, text = reward.diamonds.toString(), color = Color(0xFF8FD0FF), style = MaterialTheme.typography.titleSmall)
            }
        }
        Box(Modifier.height(12.dp))
        if (claimed) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text("✓ Season rewards claimed", color = Color(0xFF7EE6A4), style = MaterialTheme.typography.labelLarge)
            }
        } else {
            Box(
                modifier = Modifier
                    .clickable(enabled = !busy, onClick = onClaim)
                    .background(Gold, RoundedCornerShape(10.dp))
                    .padding(horizontal = 20.dp, vertical = 12.dp)
            ) {
                Text(
                    if (busy) "…" else "Claim All Rewards",
                    color = Color(0xFF2A1607),
                    style = MaterialTheme.typography.labelLarge
                )
            }
        }
    }
}

@Composable
private fun RoyalPassBanner(price: Int, currency: String, busy: Boolean, onUnlock: () -> Unit) {
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
            if (busy) {
                Text("…", color = Color(0xFF2A1607), style = MaterialTheme.typography.labelLarge)
            } else {
                CurrencyAmount(
                    kind = if (currency == "DIAMONDS") CurrencyIconKind.GEM else CurrencyIconKind.COIN,
                    text = price.toString(),
                    prefix = "Unlock · ",
                    color = Color(0xFF2A1607),
                    style = MaterialTheme.typography.labelLarge
                )
            }
        }
    }
}

@Composable
private fun SeasonTierCard(tier: SeasonTierDto, hasPass: Boolean, busy: Boolean, onClaim: () -> Unit) {
    Column(
        modifier = Modifier.width(140.dp).background(Panel, RoundedCornerShape(12.dp)).padding(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("Lvl ${tier.tier}", color = GoldLt, style = MaterialTheme.typography.labelLarge)
        Box(Modifier.height(8.dp))
        // FREE track — tag pill + reward + claim (mockup: each track tile is
        // labelled FREE / ROYAL above its reward cell).
        TrackTagPill(label = "FREE", premium = false)
        Box(Modifier.height(5.dp))
        RewardCell(reward = tier.freeReward, premium = false)
        Box(Modifier.height(6.dp))
        TierActionButton(
            unlocked = tier.unlocked,
            claimed = tier.claimed,
            busy = busy,
            onClaim = onClaim
        )
        Box(Modifier.height(12.dp))
        // ROYAL (premium) track.
        TrackTagPill(label = "ROYAL", premium = true)
        Box(Modifier.height(5.dp))
        RewardCell(reward = tier.premiumReward, premium = true)
        Box(Modifier.height(6.dp))
        if (!hasPass) {
            // Locked until the Royal Pass is owned — a real locked action state,
            // not a bare label (mockup shows a lock affordance on premium tiles).
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0x14E8B84B), RoundedCornerShape(9.dp))
                    .border(1.dp, Color(0x33E8B84B), RoundedCornerShape(9.dp))
                    .padding(vertical = 7.dp),
                contentAlignment = Alignment.Center
            ) {
                Text("🔒 Royal", color = Color(0xFFC79A4E), style = MaterialTheme.typography.labelSmall)
            }
        } else {
            // Premium (Royal) claim — was a dead empty lambda. Routes to the SAME
            // claim as the free button: one POST /api/season/claim grants both
            // tracks when the pass is owned. `busy` is shared so both buttons show
            // the spinner during the in-flight claim.
            TierActionButton(unlocked = tier.unlocked, claimed = tier.claimed, busy = busy, onClaim = onClaim)
        }
    }
}

/** Small FREE / ROYAL track tag pill above each reward cell (mockup). */
@Composable
private fun TrackTagPill(label: String, premium: Boolean) {
    val color = if (premium) Color(0xFFF0CF72) else Color(0xFF8FB3FF)
    Box(
        modifier = Modifier
            .background(color.copy(alpha = 0.12f), RoundedCornerShape(100.dp))
            .padding(horizontal = 9.dp, vertical = 2.dp)
    ) {
        Text(label, color = color, style = MaterialTheme.typography.labelSmall, letterSpacing = 1.sp)
    }
}

/** Reward-cell icon: either a bundled currency icon or the crown (premium/royal reward). */
private sealed class RewardIcon {
    data class Currency(val kind: CurrencyIconKind) : RewardIcon()
    object Crown : RewardIcon()
    object Chest : RewardIcon()
}

@Composable
private fun RewardCell(reward: SeasonRewardDto?, premium: Boolean) {
    val (icon, label) = rewardIconAndLabel(reward, premium)
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        when (icon) {
            is RewardIcon.Currency -> CurrencyIcon(kind = icon.kind, size = 22.dp)
            RewardIcon.Crown -> Image(painter = painterResource(id = R.drawable.me_crown), contentDescription = null, modifier = Modifier.size(22.dp))
            RewardIcon.Chest -> CurrencyIcon(kind = CurrencyIconKind.CHEST, size = 22.dp)
        }
        Text(label, color = Ink, style = MaterialTheme.typography.labelSmall)
    }
}

private fun rewardIconAndLabel(r: SeasonRewardDto?, premium: Boolean): Pair<RewardIcon, String> {
    if (r == null) return if (premium) RewardIcon.Crown to "Royal Reward" else RewardIcon.Chest to "Reward"
    if ((r.trophies ?: 0) > 0) return RewardIcon.Currency(CurrencyIconKind.TROPHY) to "${r.trophies} Trophies"
    if ((r.diamonds ?: 0) > 0) return RewardIcon.Currency(CurrencyIconKind.GEM) to "${r.diamonds} Diamonds"
    if ((r.gold ?: 0) > 0) return RewardIcon.Currency(CurrencyIconKind.COIN) to "${r.gold} Gold"
    return if (premium) RewardIcon.Crown to "Royal Reward" else RewardIcon.Chest to "Reward"
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
