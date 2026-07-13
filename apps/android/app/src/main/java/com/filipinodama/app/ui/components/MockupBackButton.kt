package com.filipinodama.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/**
 * The `‹` back button used across nearly every non-tab mockup screen
 * (Inventory, Orders, Quests, Daily Reward, Season, Mode Select, AI
 * Difficulty, Private Room, Guild, Notifications, etc. — the UI-fidelity
 * sweep found this exact chrome missing/re-styled on all of them).
 *
 * Mockup spec (mobile-split.txt, recurring across screens, e.g. lines
 * 949-951 Inventory, 2220-2223 Private Room): 40x40dp box, radius 12dp,
 * border 1px solid rgba(232,184,75,.16-.25) (screens vary slightly;
 * .2 is the common middle value), background rgba(27,16,48,.7), glyph
 * `‹` in #f4d886 at 700/20sp.
 */
@Composable
fun MockupBackButton(onClick: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .size(40.dp)
            .clickable(onClick = onClick)
            .background(Color(0xB31B1030), RoundedCornerShape(12.dp))
            .border(1.dp, Color(0x33E8B84B), RoundedCornerShape(12.dp)),
        contentAlignment = Alignment.Center
    ) {
        Text(
            "‹",
            color = Color(0xFFF4D886),
            style = MaterialTheme.typography.titleLarge
        )
    }
}
