package com.filipinodama.app.ui.screens.social

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * SwipeRevealRow — horizontal swipe-to-reveal actions, a Compose port of the
 * prototype's `_fswDown/_fswMove/_fswUp` (Friends rows) and
 * `_nswDown/_nswMove/_nswUp` (Notifications rows) drag mechanics
 * (mobile-screen-inventory.md DATA/BEHAVIOR §3.2): drag left reveals an
 * action tray behind the row content; snaps open past a drag threshold,
 * otherwise springs closed. Only ONE row is open at a time — callers pass
 * [isOpen]/[onOpenChange] wired to a single "which row is open" id so opening
 * a new row auto-closes the previous one, matching `_fswOpen` tracking.
 *
 * [revealWidth] mirrors the prototype's fixed 132px action tray width
 * (converted dp-for-px 1:1, matching this scaffold's existing dp==handoff-px
 * convention elsewhere, e.g. the 78px tab bar height -> 78.dp).
 */
@Composable
fun SwipeRevealRow(
    isOpen: Boolean,
    onOpenChange: (Boolean) -> Unit,
    revealWidth: Dp = 132.dp,
    actions: @Composable () -> Unit,
    content: @Composable () -> Unit
) {
    val revealPx = with(androidx.compose.ui.platform.LocalDensity.current) { revealWidth.toPx() }
    var dragOffset by remember(isOpen) { mutableFloatStateOf(if (isOpen) -revealPx else 0f) }
    val animatedOffset by animateFloatAsState(
        targetValue = dragOffset,
        animationSpec = tween(durationMillis = 220),
        label = "swipeReveal"
    )

    val dragState = rememberDraggableState { delta ->
        dragOffset = (dragOffset + delta).coerceIn(-revealPx, 0f)
    }

    Box(modifier = Modifier.fillMaxSize()) {
        // Action tray sits behind the content.
        Box(modifier = Modifier.fillMaxSize()) {
            actions()
        }
        Box(
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer { translationX = animatedOffset }
                .draggable(
                    state = dragState,
                    orientation = Orientation.Horizontal,
                    onDragStopped = {
                        // Snap open past -66px drag (half the 132px tray), matching
                        // the prototype's threshold; otherwise spring closed.
                        val open = dragOffset < -revealPx / 2
                        dragOffset = if (open) -revealPx else 0f
                        onOpenChange(open)
                    }
                )
        ) {
            content()
        }
    }
}
