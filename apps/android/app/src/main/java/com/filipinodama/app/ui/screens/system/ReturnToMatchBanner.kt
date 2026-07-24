package com.filipinodama.app.ui.screens.system

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Global "Return to match" strip. Shown across ALL screens (via AppNavHost)
 * whenever the player has a live online match but isn't currently on the match
 * screen — so re-entry is no longer Home-only. Tapping it resumes the match.
 *
 * Royal styling (purple gradient + gold border) to match the app's dialogs and
 * snackbar, distinct from the red OfflineBanner. Slides in/out.
 */
@Composable
fun ReturnToMatchBanner(
    visible: Boolean,
    opponentLabel: String,
    modeLabel: String,
    onResume: () -> Unit,
    modifier: Modifier = Modifier,
) {
    AnimatedVisibility(
        visible = visible,
        enter = slideInVertically(),
        exit = slideOutVertically(),
        modifier = modifier,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.verticalGradient(listOf(Color(0xFF2A1A42), Color(0xFF1C1030)))
                )
                .border(1.dp, Color(0x66E8B84B))
                .clickable { onResume() }
                .padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = "▶ Match in progress vs $opponentLabel · $modeLabel",
                color = Color(0xFFF4ECD6),
                fontSize = 13.sp,
                modifier = Modifier.weight(1f, fill = false),
            )
            Text(
                text = "Return ›",
                color = Color(0xFFE8B84B),
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(start = 12.dp),
            )
        }
    }
}
