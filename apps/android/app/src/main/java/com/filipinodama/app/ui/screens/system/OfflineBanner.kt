package com.filipinodama.app.ui.screens.system

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.filipinodama.app.ui.theme.Red

/**
 * Top offline strip — SYSTEM_STATES.md `isOffline` (z-index 400, "top strip,
 * coexists above everything"). Copy matches the spec verbatim: "You're
 * offline — reconnecting…" with a pulsing dot; auto-clears on reconnect
 * (driven purely by [visible], which the caller derives from
 * [com.filipinodama.app.data.system.offlineBannerVisible]).
 */
@Composable
fun OfflineBanner(visible: Boolean, modifier: Modifier = Modifier) {
    AnimatedVisibility(
        visible = visible,
        enter = slideInVertically(),
        exit = slideOutVertically(),
        modifier = modifier
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Red)
                .padding(vertical = 8.dp, horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            androidx.compose.foundation.layout.Box(
                modifier = Modifier.size(7.dp).background(Color.White, CircleShape)
            )
            Text(
                text = "You're offline — reconnecting…",
                color = Color.White,
                fontSize = 12.sp,
                modifier = Modifier.padding(start = 10.dp)
            )
        }
    }
}
