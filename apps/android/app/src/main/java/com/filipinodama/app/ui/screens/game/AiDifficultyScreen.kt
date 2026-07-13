package com.filipinodama.app.ui.screens.game

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.filipinodama.app.R
import com.filipinodama.app.data.engine.AiDifficulties
import com.filipinodama.app.ui.components.MockupBackButton
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink

private data class DifficultyLevel(
    val key: String,
    val label: String,
    val desc: String,
    val dots: Int,
    /** Real handoff difficulty crest (diff-easy/normal/hard.webp), mirrors
     *  apps/web/src/lib/emblems.ts DIFF_EMBLEMS + AiSetupPage.tsx placement. */
    val emblem: Int,
    /** Mockup per-level accent (mobile-split.txt aiLevels): easy #3fbf6f,
     *  normal #e8b84b, hard #d63b52 — drives the selected border/glow + pips. */
    val accent: androidx.compose.ui.graphics.Color
)

/**
 * "Play vs AI" difficulty select — inventory SCREEN 18 (AI Difficulty):
 * eyebrow "Train offline", 3 difficulty cards, "Start Match" CTA. Mirrors
 * apps/web/src/features/play/AiSetupPage.tsx's copy and card shape (dots
 * strength indicator, description text) exactly.
 */
@Composable
fun AiDifficultyScreen(onBack: () -> Unit, onStart: (String) -> Unit) {
    var selected by remember { mutableStateOf(AiDifficulties.NORMAL) }

    val levels = listOf(
        DifficultyLevel(AiDifficulties.EASY, "Easy", "A gentle opponent. Great for learning the ropes and trying new tactics.", 1, R.drawable.diff_easy, androidx.compose.ui.graphics.Color(0xFF3FBF6F)),
        DifficultyLevel(AiDifficulties.NORMAL, "Normal", "A balanced challenge that punishes loose moves. A fair, steady fight.", 2, R.drawable.diff_normal, androidx.compose.ui.graphics.Color(0xFFE8B84B)),
        DifficultyLevel(AiDifficulties.HARD, "Hard", "A ruthless tactician that hunts every capture. Bring your best game.", 3, R.drawable.diff_hard, androidx.compose.ui.graphics.Color(0xFFD63B52))
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Start) {
            MockupBackButton(onClick = onBack)
        }
        // Mockup eyebrow color for this screen is green (#3fbf6f), not gold.
        Text("TRAIN OFFLINE", color = androidx.compose.ui.graphics.Color(0xFF3FBF6F), style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 12.dp))
        Text(
            "Play vs AI",
            color = androidx.compose.ui.graphics.Color(0xFFF4D886),
            style = MaterialTheme.typography.headlineMedium,
            modifier = Modifier.padding(top = 8.dp, bottom = 4.dp)
        )
        Text("Choose your opponent's strength, then start the match.", color = androidx.compose.ui.graphics.Color(0xFF9A8BBF), style = MaterialTheme.typography.bodyMedium)

        Column(modifier = Modifier.padding(top = 24.dp).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            levels.forEach { level ->
                DifficultyCard(level = level, selected = selected == level.key, onClick = { selected = level.key })
            }
        }

        GameButton(
            text = "⚔ Start Match · ${levels.first { it.key == selected }.label}",
            onClick = { onStart(selected) },
            variant = GameButtonVariant.RED,
            modifier = Modifier.padding(top = 26.dp)
        )
    }
}

@Composable
private fun DifficultyCard(level: DifficultyLevel, selected: Boolean, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .background(
                if (selected) level.accent.copy(alpha = 0.08f) else androidx.compose.ui.graphics.Color(0xFF0F0820).copy(alpha = 0.5f),
                RoundedCornerShape(16.dp)
            )
            .border(
                1.5.dp,
                if (selected) level.accent.copy(alpha = 0.5f) else Gold.copy(alpha = 0.16f),
                RoundedCornerShape(16.dp)
            )
            .padding(18.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Image(
            painter = painterResource(id = level.emblem),
            contentDescription = null,
            modifier = Modifier
                .size(58.dp)
                .padding(bottom = 4.dp)
        )
        Text(level.label, color = GoldLt, style = MaterialTheme.typography.titleLarge)
        Text(
            level.desc,
            color = Ink,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.padding(top = 5.dp),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center
        )
        Row(modifier = Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            repeat(3) { i ->
                androidx.compose.foundation.layout.Box(
                    modifier = Modifier
                        .size(8.dp)
                        .background(
                            if (i < level.dots) level.accent else Gold.copy(alpha = 0.18f),
                            CircleShape
                        )
                )
            }
        }
    }
}
