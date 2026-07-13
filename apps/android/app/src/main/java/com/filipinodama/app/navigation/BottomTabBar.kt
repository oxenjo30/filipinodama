package com.filipinodama.app.navigation

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(78.dp)
            .background(Brush.verticalGradient(listOf(Color(0xFF0F0720).copy(alpha = 0.5f), Color(0xFF120A22))))
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
                // Inactive, non-center icons: opacity .5 + grayscale(.4), mirroring
                // the mockup's iconStyle exactly (script line 4092). The center
                // Play icon never grayscales/dims regardless of active state.
                val dimInactive = !selected && !isPlayTab
                Image(
                    painter = painterResource(id = item.icon),
                    contentDescription = item.label,
                    colorFilter = if (dimInactive) ColorFilter.colorMatrix(partialGrayscale(0.4f)) else null,
                    modifier = Modifier
                        .size(26.dp)
                        .alpha(if (dimInactive) 0.5f else 1f)
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
