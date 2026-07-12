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
import com.filipinodama.app.data.economy.QuestDto
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel
import kotlinx.coroutines.launch

/**
 * Quests — mobile-screen-inventory.md SCREEN 23. Daily + seasonal quest rows
 * with progress bars and gold-reward claim buttons, driven by real
 * GET /api/quests defs/progress (per-user, per-period). Claiming POSTs
 * /api/quests/{id}/claim and re-fetches so the row flips to Claimed.
 */
@Composable
fun QuestsScreen(onBack: () -> Unit = {}) {
    val scope = rememberCoroutineScope()
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
        if (claiming != null) return
        claiming = id
        scope.launch {
            when (EconomyRepository.claimQuest(id)) {
                is EconomyResult.Success -> load()
                is EconomyResult.Failure -> { /* the row's own claim button will simply remain visible; server message not surfaced as a toast in this scaffold's screen-local model */ }
            }
            claiming = null
        }
    }

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(20.dp)) {
        Text("✦ Progression ✦", color = Gold, style = MaterialTheme.typography.labelMedium)
        Text("Quests", color = GoldLt, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 6.dp, bottom = 4.dp))
        Text(
            "Complete goals to earn gold. Daily quests reset at midnight; seasonal goals run all season.",
            color = Ink,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(bottom = 16.dp)
        )

        if (!loaded) {
            Box(Modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Gold) }
        } else if (loadError) {
            Box(Modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.Center) {
                Text("Couldn't load your quests — try again.", color = Ink2, style = MaterialTheme.typography.bodyMedium)
            }
        } else {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                Text("Daily Quests", color = GoldLt, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(bottom = 10.dp))
                if (daily.isEmpty()) {
                    Text("No daily quests right now — check back soon.", color = Ink2, style = MaterialTheme.typography.bodyMedium)
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        daily.forEach { q -> QuestRow(q, busy = claiming == q.id, onClaim = { claim(q.id) }) }
                    }
                }

                Box(Modifier.height(24.dp))

                Text("Seasonal Goals", color = GoldLt, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(bottom = 10.dp))
                if (seasonal.isEmpty()) {
                    Text("No seasonal goals right now — check back soon.", color = Ink2, style = MaterialTheme.typography.bodyMedium)
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        seasonal.forEach { q -> QuestRow(q, busy = claiming == q.id, onClaim = { claim(q.id) }) }
                    }
                }
                Box(Modifier.height(24.dp))
            }
        }
    }
}

@Composable
private fun QuestRow(q: QuestDto, busy: Boolean, onClaim: () -> Unit) {
    val cur = q.value.coerceAtMost(q.goal)
    val pct = if (q.goal > 0) (cur * 100 / q.goal).coerceIn(2, 100) else 2

    Row(
        modifier = Modifier.fillMaxWidth().background(Panel, RoundedCornerShape(12.dp)).padding(14.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(q.title, color = Color(0xFFF2E9D2), style = MaterialTheme.typography.titleSmall)
            if (q.description != null) {
                Text(q.description, color = Ink2, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 2.dp, bottom = 6.dp))
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 6.dp)) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(8.dp)
                        .background(Color.Black.copy(alpha = 0.4f), RoundedCornerShape(6.dp))
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(pct / 100f)
                            .height(8.dp)
                            .background(if (q.completed) Color(0xFF2F8F5B) else Color(0xFF7A5BD6), RoundedCornerShape(6.dp))
                    )
                }
                Text("$cur / ${q.goal}", color = Ink, style = MaterialTheme.typography.labelSmall)
            }
        }
        Column(horizontalAlignment = Alignment.End) {
            Text("+${q.rewardGold} 🪙", color = Color(0xFFF2D493), style = MaterialTheme.typography.labelMedium)
            Box(Modifier.height(8.dp))
            val (label, enabled, bg, fg) = when {
                q.claimed -> QuestButtonState("Claimed", false, Color(0xFF2F8F5B).copy(alpha = 0.16f), Color(0xFF7EE6A4))
                q.claimable -> QuestButtonState(if (busy) "…" else "Claim", !busy, Gold, Color(0xFF2A1607))
                else -> QuestButtonState("Locked", false, Color(0xFF0F0820).copy(alpha = 0.5f), Ink2)
            }
            Box(
                modifier = Modifier
                    .clickable(enabled = enabled, onClick = onClaim)
                    .background(bg, RoundedCornerShape(9.dp))
                    .padding(horizontal = 15.dp, vertical = 8.dp)
            ) {
                Text(label, color = fg, style = MaterialTheme.typography.labelMedium)
            }
        }
    }
}

private data class QuestButtonState(val label: String, val enabled: Boolean, val background: Color, val foreground: Color)
