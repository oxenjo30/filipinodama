package com.filipinodama.app.ui.screens

import androidx.compose.runtime.Composable

/**
 * Placeholder for the Play tab. In the approved handoff, tapping Play
 * routes to Mode Select (`go('mode')`), not a dedicated "play" screen — see
 * NAVIGATION MODEL notes in AppNavHost.kt. This placeholder stands in for
 * that future Mode Select destination until Phase 2.
 */
@Composable
fun PlayScreen() {
    PlaceholderScreen(title = "Play", phaseNote = "Coming in Phase 2")
}
