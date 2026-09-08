package com.filipinodama.app.navigation

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.currentBackStackEntryAsState
import com.filipinodama.app.R
import com.filipinodama.app.ui.components.brightIconFilter
import com.filipinodama.app.ui.components.iconGlow
import com.filipinodama.app.ui.components.idlePulse
import com.filipinodama.app.ui.components.rememberMotionBudget
import com.filipinodama.app.ui.theme.TabActiveGold
import com.filipinodama.app.ui.theme.TabInactiveViolet

/**
 * Bottom tab bar — rebuilt 1:1 from the mockup's actual DOM/CSS
 * (`handoffv3/FilipinoDama Mobile.dc.html`, split-file lines 3504-3514,
 * "BOTTOM TAB BAR", + script `tabDefs`/`tabs` mapping ~lines 4081-4094).
 *
 * This supersedes the prior Material [androidx.compose.material3.NavigationBar]
 * re-skin (M3 filled-indicator pill, generic vector icons, a filled gold
 * circle behind the Play icon) — none of that exists in the mockup. The real
 * design is a plain flex row of 5 equal-width icon+label buttons on a
 * blurred glass strip, real handoff art (sb-modes.png / ic-chest.png /
 * logo-sun.png / me-guild.png / sb-players.png), gold `#f0cf72` when active,
 * muted violet `#6f5f92` + reduced opacity/grayscale when inactive, and the
 * center Play icon always carries a gold glow drop-shadow regardless of
 * active state (mockup script line 4092) — no filled circle badge.
 */
private data class TabItem(
    val route: String,
    val label: String,
    val icon: Int
)

private val tabItems = listOf(
    TabItem(AppDestinations.HOME, "Home", R.drawable.sb_modes),
    TabItem(AppDestinations.STORE, "Store", R.drawable.ic_chest),
    TabItem(AppDestinations.MODE_SELECT, "Play", R.drawable.logo_sun),
    TabItem(AppDestinations.GUILD, "Guild", R.drawable.me_guild),
    TabItem(AppDestinations.PROFILE, "Profile", R.drawable.sb_players)
)

@Composable
fun BottomTabBar(navController: NavHostController) {
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination
    // Same motion policy the Play screen uses, so the whole app backs off together.
    val budget = rememberMotionBudget()

    Row(
        modifier = Modifier
            .fillMaxWidth()
            // The app draws edge-to-edge (MainActivity.enableEdgeToEdge), so the
            // system gesture/nav bar sits UNDER this strip. Pad by its inset
            // BEFORE the fixed height so the tab row lifts fully above the
            // gesture bar instead of being overlapped by it (the background
            // still extends behind the nav bar for a seamless look).
            .background(Brush.verticalGradient(listOf(Color(0xFF0F0720).copy(alpha = 0.5f), Color(0xFF120A22))))
            .navigationBarsPadding()
            .height(78.dp)
            .padding(horizontal = 8.dp)
            .padding(bottom = 14.dp),
        horizontalArrangement = Arrangement.SpaceAround,
        verticalAlignment = Alignment.CenterVertically
    ) {
        tabItems.forEach { item ->
            val selected = currentDestination?.hierarchy?.any { it.route == item.route } == true
            val isPlayTab = item.route == AppDestinations.MODE_SELECT
            val tint = if (selected) TabActiveGold else TabInactiveViolet

            Column(
                modifier = Modifier
                    .weight(1f)
                    .clickable {
                        navController.navigate(item.route) {
                            popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                            launchSingleTop = true
                            restoreState = true
                        }
                    }
                    .padding(vertical = 8.dp, horizontal = 6.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                // Inactive, non-center icons were opacity .5 + grayscale(.4), a 1:1
                // port of the mockup's iconStyle (script line 4092). Owner
                // directive 2026-08-04 supersedes that row: on device they read as
                // disabled controls. They are LIFTED, not equalised — .78/.15
                // instead of .5/.4 — so the bar still reads as a tab bar, and the
                // selected tab keeps its gold tint plus a glow and a slow pulse.
                val dimInactive = !selected && !isPlayTab
                Image(
                    painter = painterResource(id = item.icon),
                    contentDescription = item.label,
                    colorFilter = if (dimInactive) {
                        ColorFilter.colorMatrix(partialGrayscale(0.15f))
                    } else {
                        brightIconFilter()
                    },
                    modifier = Modifier
                        .size(26.dp)
                        .then(if (selected) Modifier.idlePulse(budget, peak = 1.05f) else Modifier)
                        .then(if (selected) Modifier.iconGlow(alpha = 0.4f) else Modifier)
                        .alpha(if (dimInactive) 0.78f else 1f)
                )
                Text(item.label, color = tint, style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

/**
 * Partial grayscale color matrix (0f = no effect, 1f = full grayscale) — the
 * Compose equivalent of CSS `filter:grayscale(.4)` on the inactive tab
 * icons, since Compose has no partial-grayscale primitive built in.
 */
private fun partialGrayscale(amount: Float): ColorMatrix {
    val saturation = 1f - amount
    return ColorMatrix().apply { setToSaturation(saturation) }
}
