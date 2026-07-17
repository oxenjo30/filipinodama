package com.filipinodama.app.ui.screens.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.ui.components.MockupBackButton
import com.filipinodama.app.ui.components.screenInsets
import com.filipinodama.app.ui.theme.GoldLt

/**
 * Achievements — full screen, mobile-screen-inventory.md SCREEN 30
 * (`FilipinoDama Mobile.dc.html` isAchievements block, lines 2323-2343).
 * Row-by-row:
 *   2326  `‹` MockupBackButton -> back to Profile (mockup achBack -> go('profile')).
 *   2327  Eyebrow "✦ MILESTONES ✦" + title "Achievements" (Cinzel).
 *   2328  Completed-count pill (mockup achDoneLabel, e.g. "4 / 8 unlocked") —
 *         computed from the REAL unlocked count, not the mockup's hardcoded
 *         "4 / 8" literal.
 *   2331-2340  Vertical list of 8 rows: icon, name, "Unlocked" badge (green)
 *         when done, else a progress bar where a numeric progress is
 *         meaningful; description below. Unlocked rows brighter, locked
 *         rows dimmed — mirrors the mockup's opacity/grayscale treatment.
 *
 * Data source: the SAME shared [Achievements.ALL] list Profile Overview's
 * 4-tile grid uses (see that file's kdoc) — this screen just renders all 8
 * instead of the first 4, so the two surfaces can never drift out of sync.
 * All 8 are derived from the current user's real wins/streak/trophies
 * (AuthRepository.state.user) — no new backend, no fabricated stats.
 */
@Composable
fun AchievementsScreen(onBack: () -> Unit = {}) {
    val authState by AuthRepository.state.collectAsState()
    val me = authState.user

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).screenInsets().padding(16.dp)) {
        if (me == null) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                MockupBackButton(onClick = onBack)
            }
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Sign in to view your achievements", color = GoldLt, style = MaterialTheme.typography.titleMedium)
            }
            return@Column
        }

        val wins = me.wins
        val streak = me.streak
        val trophies = me.trophies
        val defs = Achievements.ALL
        val doneCount = defs.count { it.unlocked(wins, streak, trophies) }

        Row(verticalAlignment = Alignment.CenterVertically) {
            MockupBackButton(onClick = onBack)
            Column(modifier = Modifier.weight(1f).padding(start = 10.dp)) {
                Text(
                    "✦ MILESTONES ✦",
                    color = Color(0xFFC79A4E),
                    style = MaterialTheme.typography.labelSmall,
                    letterSpacing = 2.5.sp
                )
                Text(
                    "Achievements",
                    color = Color(0xFFF4D886),
                    style = MaterialTheme.typography.headlineSmall,
                    modifier = Modifier.padding(top = 2.dp)
                )
            }
            Box(
                modifier = Modifier
                    .background(Color(0x1FF0CF72), RoundedCornerShape(100.dp))
                    .border(1.dp, Color(0x47F0CF72), RoundedCornerShape(100.dp))
                    .padding(horizontal = 12.dp, vertical = 7.dp)
            ) {
                Text(
                    "$doneCount / ${defs.size} unlocked",
                    color = Color(0xFFF0CF72),
                    style = MaterialTheme.typography.labelSmall
                )
            }
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(top = 16.dp),
            verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(10.dp)
        ) {
            items(defs) { a ->
                val unlocked = a.unlocked(wins, streak, trophies)
                val pct = if (!unlocked) a.progress?.invoke(wins, streak, trophies) else null
                AchievementRow(def = a, unlocked = unlocked, progress = pct)
            }
        }
    }
}

@Composable
private fun AchievementRow(def: AchievementDef, unlocked: Boolean, progress: Float?) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xCC1B1030), RoundedCornerShape(16.dp))
            .border(1.dp, Color(0x1FE8B84B), RoundedCornerShape(16.dp))
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        AsyncImage(
            model = "${com.filipinodama.app.BuildConfig.WEB_ORIGIN}/assets/${def.assetFile}",
            contentDescription = null,
            modifier = Modifier.size(44.dp).then(if (!unlocked) Modifier.alpha(0.5f) else Modifier)
        )
        Column(modifier = Modifier.weight(1f).padding(start = 14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    def.name,
                    color = Color(0xFFF4ECD6),
                    style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.padding(end = 7.dp)
                )
                if (unlocked) {
                    Box(
                        modifier = Modifier
                            .background(Color(0x293FBF6F), RoundedCornerShape(5.dp))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(
                            "UNLOCKED",
                            color = Color(0xFF7FE0A3),
                            style = MaterialTheme.typography.labelSmall,
                            fontSize = 8.sp
                        )
                    }
                }
            }
            Text(
                def.desc,
                color = Color(0xFF9A8BBF),
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.padding(top = 4.dp)
            )
            if (!unlocked && progress != null) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(6.dp)
                        .padding(top = 9.dp)
                        .background(Color(0x59000000), RoundedCornerShape(3.dp))
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(progress.coerceIn(0f, 1f))
                            .height(6.dp)
                            .background(
                                androidx.compose.ui.graphics.Brush.horizontalGradient(
                                    listOf(Color(0xFFEFC25A), Color(0xFFC9971F))
                                ),
                                RoundedCornerShape(3.dp)
                            )
                    )
                }
            }
        }
    }
}
