package com.filipinodama.app.ui.screens.economy

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.unit.dp
import com.filipinodama.app.BuildConfig
import com.filipinodama.app.data.economy.EconomyRepository
import com.filipinodama.app.data.economy.EconomyResult
import com.filipinodama.app.data.economy.QuestDto
import com.filipinodama.app.ui.components.CurrencyAmount
import com.filipinodama.app.ui.components.CurrencyIconKind
import com.filipinodama.app.ui.components.LocalSnackbar
import com.filipinodama.app.ui.components.MockupBackButton
import com.filipinodama.app.ui.components.PullRefreshContainer
import com.filipinodama.app.ui.components.isAuthError
import com.filipinodama.app.ui.components.screenInsets
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel
import kotlinx.coroutines.launch

/**
 * Quests — mobile-screen-inventory.md SCREEN 23, rebuilt 1:1 against
 * handoffv3/FilipinoDama Mobile.dc.html lines 2570-2656 (Tier-2 UI-fidelity
 * pass). Daily + seasonal quest rows with per-quest ICON, gradient progress
 * bar, and gold-reward claim buttons, driven by real GET /api/quests
 * defs/progress (per-user, per-period). Claiming POSTs
 * /api/quests/{id}/claim and re-fetches so the row flips to Claimed.
 *
 * Per-quest icon: the server has no icon field on QuestDto (nor does the
 * seed data carry one — apps/server/prisma/seed.ts quest rows are
 * {id,scope,title,description,goal,rewardGold,trigger}). The mockup itself
 * (mockup-split line 4106-4127, `mkQuest`) hardcodes exactly 4 icon assets
 * (me-swords.png / me-crown.png / me-target.png / mc-ranked.png) picked by
 * quest METATYPE, not server data. This keyword-maps each quest's
 * title+description text to the same 4 assets (win/streak -> crown,
 * capture -> target, ranked -> ranked medallion, else/play -> swords) —
 * an honest CLIENT PRESENTATION choice mirroring the mockup's own
 * hardcoded mapping, not a fabrication of server data.
 */
@Composable
fun QuestsScreen(onBack: () -> Unit = {}, onRequireSignIn: () -> Unit = {}) {
    val scope = rememberCoroutineScope()
    val snackbar = LocalSnackbar.current
    val signedInUser = com.filipinodama.app.data.AuthRepository.state.collectAsState().value.user
    val signedIn = signedInUser != null && signedInUser.isGuest != true
    var daily by remember { mutableStateOf<List<QuestDto>>(emptyList()) }
    var seasonal by remember { mutableStateOf<List<QuestDto>>(emptyList()) }
    var loaded by remember { mutableStateOf(false) }
    var loadError by remember { mutableStateOf(false) }
    var claiming by remember { mutableStateOf<String?>(null) }

    suspend fun load() {
        when (val result = EconomyRepository.quests()) {
            is EconomyResult.Success -> {
                daily = result.data.daily
                seasonal = result.data.seasonal
                loadError = false
            }
            is EconomyResult.Failure -> loadError = true
        }
        loaded = true
    }

    LaunchedEffect(Unit) { load() }

    fun claim(id: String) {
        // Owner policy: claiming requires an account — anonymous → Login.
        if (!signedIn) { onRequireSignIn(); return }
        if (claiming != null) return
        claiming = id
        scope.launch {
            when (val r = EconomyRepository.claimQuest(id)) {
                is EconomyResult.Success -> load()
                is EconomyResult.Failure ->
                    if (isAuthError(r.code)) onRequireSignIn()
                    else snackbar.show(r.message)
            }
            claiming = null
        }
    }

    val goldReady = daily.count { it.claimable && !it.claimed } + seasonal.count { it.claimable && !it.claimed }

    Column(modifier = Modifier.fillMaxSize().screenInsets().background(MaterialTheme.colorScheme.background).padding(16.dp, 20.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            MockupBackButton(onClick = onBack)
            Row(
                modifier = Modifier
                    .background(Color(0x1AE8B84B), RoundedCornerShape(100.dp))
                    .border(1.dp, Color(0x47E8B84B), RoundedCornerShape(100.dp))
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                com.filipinodama.app.ui.components.CurrencyIcon(kind = CurrencyIconKind.COIN, size = 15.dp)
                Text(goldReady.toString(), color = Color(0xFFF0CF72), style = MaterialTheme.typography.labelMedium)
            }
        }
        Text("✦ Progression ✦", color = Color(0xFFC79A4E), style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 12.dp))
        Text("Quests", color = Color(0xFFF4D886), style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 6.dp, bottom = 4.dp))
        Text(
            "Complete goals to earn gold. Daily quests reset at midnight; seasonal goals run all season.",
            color = Color(0xFF9A8BBF),
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(bottom = 20.dp)
        )

        if (!signedIn) {
            // Anonymous user (owner policy) — quests are account-bound; show a
            // clean sign-in prompt instead of a load error.
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth().padding(top = 40.dp)) {
                Text("Sign in to track quests", color = GoldLt, style = MaterialTheme.typography.titleMedium)
                Text(
                    "Complete quests and claim gold once you have an account.",
                    color = Ink2,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(top = 8.dp, bottom = 16.dp),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                )
                Box(
                    modifier = Modifier
                        .clickable(onClick = onRequireSignIn)
                        .background(Gold, RoundedCornerShape(12.dp))
                        .padding(horizontal = 28.dp, vertical = 13.dp)
                ) { Text("Sign In", color = Color(0xFF2A1607), style = MaterialTheme.typography.titleMedium) }
            }
        } else if (!loaded) {
            Box(Modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Gold) }
        } else if (loadError) {
            Box(Modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.Center) {
                Text("Couldn't load your quests — try again.", color = Ink2, style = MaterialTheme.typography.bodyMedium)
            }
        } else {
            // Pull down to RE-FETCH quests from the server (load() — the same
            // call the entry LaunchedEffect runs), not a cosmetic spinner.
            PullRefreshContainer(onRefresh = { load() }) {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                val dailyReady = daily.count { it.claimable && !it.claimed }
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                        Text("Daily Quests", color = Color(0xFFF4D886), style = MaterialTheme.typography.titleMedium)
                        if (dailyReady > 0) {
                            Box(
                                modifier = Modifier
                                    .background(androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Color(0xFFF7E2A0), Color(0xFFD5A63A))), RoundedCornerShape(100.dp))
                                    .padding(horizontal = 8.dp, vertical = 3.dp)
                            ) { Text("$dailyReady Ready", color = Color(0xFF2A1A06), style = MaterialTheme.typography.labelSmall) }
                        }
                    }
                    Box(modifier = Modifier.border(1.dp, Color(0x33E8B84B), RoundedCornerShape(100.dp)).padding(horizontal = 9.dp, vertical = 3.dp)) {
                        Text("RESETS AT MIDNIGHT", color = Color(0xFF6F5F92), style = MaterialTheme.typography.labelSmall)
                    }
                }
                Box(Modifier.height(12.dp))
                if (daily.isEmpty()) {
                    Text("No daily quests right now — check back soon.", color = Ink2, style = MaterialTheme.typography.bodyMedium)
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(11.dp)) {
                        daily.forEach { q -> QuestRow(q, busy = claiming == q.id, onClaim = { claim(q.id) }) }
                    }
                }

                Box(Modifier.height(26.dp))

                val seasonReady = seasonal.count { it.claimable && !it.claimed }
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                        Text("Seasonal Goals", color = Color(0xFFF4D886), style = MaterialTheme.typography.titleMedium)
                        if (seasonReady > 0) {
                            Box(
                                modifier = Modifier
                                    .background(androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Color(0xFFF7E2A0), Color(0xFFD5A63A))), RoundedCornerShape(100.dp))
                                    .padding(horizontal = 8.dp, vertical = 3.dp)
                            ) { Text("$seasonReady Ready", color = Color(0xFF2A1A06), style = MaterialTheme.typography.labelSmall) }
                        }
                    }
                    Box(modifier = Modifier.border(1.dp, Color(0x4DE8B84B), RoundedCornerShape(100.dp)).padding(horizontal = 9.dp, vertical = 3.dp)) {
                        Text("SEASON OF THE RAJAH", color = Color(0xFFC79A4E), style = MaterialTheme.typography.labelSmall)
                    }
                }
                Box(Modifier.height(12.dp))
                if (seasonal.isEmpty()) {
                    Text("No seasonal goals right now — check back soon.", color = Ink2, style = MaterialTheme.typography.bodyMedium)
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(11.dp)) {
                        seasonal.forEach { q -> QuestRow(q, busy = claiming == q.id, onClaim = { claim(q.id) }) }
                    }
                }
                Box(Modifier.height(24.dp))
            }
            } // PullRefreshContainer
        }
    }
}

/** Keyword-maps a quest's title+description to the mockup's 4 hardcoded quest icon assets (mockup-split line 4106-4127). */
private fun questIconUrl(q: QuestDto): String {
    val text = "${q.title} ${q.description ?: ""}".lowercase()
    val file = when {
        "ranked" in text -> "mc-ranked.png"
        "win" in text || "streak" in text || "victory" in text -> "me-crown.png"
        "capture" in text -> "me-target.png"
        else -> "me-swords.png"
    }
    return "${BuildConfig.WEB_ORIGIN}/assets/$file"
}

@Composable
private fun QuestRow(q: QuestDto, busy: Boolean, onClaim: () -> Unit) {
    val cur = q.value.coerceAtMost(q.goal)
    val pct = if (q.goal > 0) (cur * 100 / q.goal).coerceIn(2, 100) else 2
    val rowBg = if (q.claimed) Color(0x0F3FBF6F) else Color(0xB31B1030)
    val rowBorder = if (q.claimed) Color(0x333FBF6F) else Color(0x24E8B84B)

    Row(
        modifier = Modifier.fillMaxWidth().background(rowBg, RoundedCornerShape(16.dp)).border(1.dp, rowBorder, RoundedCornerShape(16.dp)).padding(14.dp),
        horizontalArrangement = Arrangement.spacedBy(13.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        coil.compose.AsyncImage(model = questIconUrl(q), contentDescription = null, modifier = Modifier.size(38.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(q.title, color = Color(0xFFF2E9D2), style = MaterialTheme.typography.titleSmall)
            if (q.description != null) {
                Text(q.description, color = Color(0xFF9A8BBF), style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 2.dp, bottom = 8.dp))
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(7.dp)
                        .background(Color.Black.copy(alpha = 0.4f), RoundedCornerShape(4.dp))
                        .border(1.dp, Color(0x1AE8B84B), RoundedCornerShape(4.dp))
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(pct / 100f)
                            .fillMaxHeight()
                            .background(
                                if (q.completed) androidx.compose.ui.graphics.Brush.horizontalGradient(listOf(Color(0xFFF7E2A0), Color(0xFFD5A63A)))
                                else androidx.compose.ui.graphics.Brush.horizontalGradient(listOf(Color(0xFFEFC25A), Color(0xFFD97A3A))),
                                RoundedCornerShape(4.dp)
                            )
                    )
                }
                Text("$cur / ${q.goal}", color = Color(0xFFC9B8E8), style = MaterialTheme.typography.labelSmall)
            }
        }
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(7.dp)) {
            CurrencyAmount(kind = CurrencyIconKind.COIN, text = q.rewardGold.toString(), prefix = "+", color = Color(0xFFF0CF72), style = MaterialTheme.typography.labelMedium)
            val (label, enabled, bg, fg) = when {
                q.claimed -> QuestButtonState("Claimed", false, Color(0xFF2F8F5B).copy(alpha = 0.16f), Color(0xFF7EE6A4))
                q.claimable -> QuestButtonState(if (busy) "…" else "Claim", !busy, Gold, Color(0xFF2A1607))
                else -> QuestButtonState("$cur/${q.goal}", false, Color(0xFF0F0820).copy(alpha = 0.5f), Ink2)
            }
            Box(
                modifier = Modifier
                    .clickable(enabled = enabled, onClick = onClaim)
                    .background(bg, RoundedCornerShape(10.dp))
                    .padding(horizontal = 14.dp, vertical = 8.dp)
            ) {
                Text(label, color = fg, style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

private data class QuestButtonState(val label: String, val enabled: Boolean, val background: Color, val foreground: Color)
