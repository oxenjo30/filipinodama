package com.filipinodama.app.ui.screens.game

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/**
 * The Battle screen's bottom drawer — an overlay, not a route push. Shared
 * shell for both sheets the dock opens: Game Modes (right slot) and Loadout
 * (left slot).
 *
 * Deliberate deviation from the reference: the drawer stops above the bottom
 * tab bar instead of covering it. Clash Royale covers its nav strip, but the
 * tab bar here is owned by the Scaffold in AppNavHost (outside every screen
 * composable), and more importantly an Android user expects the tab bar to
 * persist. Losing it would make the drawer feel like a screen you have to back
 * out of, which is exactly what this replaces.
 */
@Composable
fun BoxScope.PlayDrawer(
    visible: Boolean,
    onDismiss: () -> Unit,
    content: @Composable ColumnScope.() -> Unit
) {
    BackHandler(enabled = visible, onBack = onDismiss)

    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(tween(220)),
        exit = fadeOut(tween(200)),
        modifier = Modifier.matchParentSize()
    ) {
        // Scrim. Uses an interaction source with no indication so dismissing by
        // tapping outside does not flash a ripple across the whole screen.
        val interaction = remember { MutableInteractionSource() }
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(SCRIM)
                .clickable(interactionSource = interaction, indication = null, onClick = onDismiss)
        )
    }

    AnimatedVisibility(
        visible = visible,
        enter = slideInVertically(tween(360)) { it },
        exit = slideOutVertically(tween(300)) { it },
        modifier = Modifier.align(Alignment.BottomCenter)
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            // Grab handle — the same wooden tab the reference uses to say
            // "this pulls back down", and a second dismiss target next to the
            // scrim and the system back gesture.
            Box(
                modifier = Modifier
                    .align(Alignment.CenterHorizontally)
                    .width(96.dp)
                    .height(30.dp)
                    .clip(RoundedCornerShape(topStart = 14.dp, topEnd = 14.dp))
                    .background(Brush.verticalGradient(listOf(Color(0xFFC08A4A), Color(0xFF8A5A28))))
                    .clickable(onClick = onDismiss),
                contentAlignment = Alignment.Center
            ) {
                Text("⌄", color = Color(0xFFFFF0CE), style = MaterialTheme.typography.titleLarge)
            }
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(topStart = 18.dp, topEnd = 18.dp))
                    .background(Brush.verticalGradient(listOf(Color(0xFF1E1338), Color(0xFF160B28))))
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp)
                    .padding(top = 14.dp, bottom = 20.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                content = content
            )
        }
    }
}

/** Dim behind the drawer — dark enough to push the Battle screen back without hiding it. */
private val SCRIM = Color(0xA80A0518)

/** Section divider inside the drawer, e.g. "COMPETITIVE MODES". */
@Composable
fun ModeSectionHeader(label: String, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier.fillMaxWidth().padding(top = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Box(modifier = Modifier.weight(1f).height(1.dp).background(Color(0x4DE8B84B)))
        Text(label, color = Color(0xFFC79A4E), style = MaterialTheme.typography.labelSmall)
        Box(modifier = Modifier.weight(1f).height(1.dp).background(Color(0x4DE8B84B)))
    }
}

/** Drawer title banner. */
@Composable
fun DrawerTitle(text: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text,
            color = Color(0xFFF6E7BC),
            style = MaterialTheme.typography.headlineSmall
        )
        Box(
            modifier = Modifier
                .padding(top = 8.dp)
                .fillMaxWidth(0.74f)
                .height(2.dp)
                .background(
                    Brush.horizontalGradient(
                        listOf(Color.Transparent, Color(0x8CE8B84B), Color.Transparent)
                    )
                )
        )
        Box(modifier = Modifier.size(2.dp))
    }
}
