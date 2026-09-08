package com.filipinodama.app.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.widthIn
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * Tablet content-width cap (phone-first, no visual change on phones).
 *
 * Every screen renders inside the app's single [androidx.navigation.compose.NavHost]
 * as a `fillMaxWidth`/`fillMaxSize` layout. On a phone that is exactly right. On
 * a large screen (a 10" tablet is ~800–1600dp wide) the same layout stretches a
 * login form, a settings list, or a profile card edge-to-edge, which reads as a
 * blown-up phone app rather than a tablet layout.
 *
 * This wraps the NavHost content once so the fix lands on all 38 screens without
 * editing any of them:
 *  - When the available width is <= [CONTENT_MAX_WIDTH_DP] (every phone, portrait),
 *    the child fills the full width — byte-for-byte the current behavior.
 *  - When wider (tablets, large foldables, desktop-mode windows), the child is
 *    centered and capped at [CONTENT_MAX_WIDTH_DP], giving comfortable side
 *    margins instead of stretch.
 *
 * The board/game routes are the deliberate exception (see [isFullWidthRoute]):
 * their checkerboard is a `fillMaxSize` square that must use the whole screen,
 * so capping them would squash the board into a narrow strip. Those routes opt
 * out and keep full width on every device.
 *
 * 640dp is the standard Compose "expanded"/tablet breakpoint boundary — below it
 * a device is treated as a phone (compact/medium width class), so the cap only
 * ever engages on genuinely large screens.
 */
const val CONTENT_MAX_WIDTH_DP = 640

/**
 * Routes whose content SHOULD fill the full screen width on every device and must
 * NOT be width-capped — the game board (a fillMaxSize square) and the pre-board
 * loader/matchmaking flows that transition into it. Matched against the raw route
 * template (with `{arg}` placeholders) so parameterized routes still resolve.
 */
fun isFullWidthRoute(route: String?): Boolean =
    route != null && route in fullWidthRoutes

private val fullWidthRoutes = setOf(
    AppDestinations.AI_GAME,
    AppDestinations.ONLINE_MATCH,
    AppDestinations.MATCHMAKING,
    AppDestinations.PRIVATE_ROOM,
    AppDestinations.SPECTATE_MATCH
)

/**
 * Center [content] and cap its width at [CONTENT_MAX_WIDTH_DP] on wide screens;
 * a no-op (full-width) on phones and on any screen where [capEnabled] is false.
 *
 * @param capEnabled pass `false` for full-width routes (see [isFullWidthRoute]).
 */
@Composable
fun TabletWidthCap(
    capEnabled: Boolean = true,
    content: @Composable () -> Unit
) {
    if (!capEnabled) {
        content()
        return
    }
    Box(modifier = Modifier.fillMaxSize()) {
        // On phones maxWidth <= the cap, so widthIn(max=cap) is inert and the
        // child fills the full width exactly as before. On tablets the child is
        // centered and stops growing past the cap.
        Box(
            modifier = Modifier
                .fillMaxSize()
                .widthIn(max = CONTENT_MAX_WIDTH_DP.dp),
            contentAlignment = Alignment.TopCenter
        ) {
            Box(modifier = Modifier.fillMaxWidth()) {
                content()
            }
        }
    }
}
