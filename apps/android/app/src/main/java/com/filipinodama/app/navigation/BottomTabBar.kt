package com.filipinodama.app.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Store
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.currentBackStackEntryAsState
import com.filipinodama.app.ui.theme.Bg2
import com.filipinodama.app.ui.theme.Panel
import com.filipinodama.app.ui.theme.TabActiveGold
import com.filipinodama.app.ui.theme.TabInactiveViolet

/**
 * 5-item bottom tab bar per NAVIGATION MODEL (mobile-screen-inventory.md
 * lines ~32-51): Home, Store, Play (center, visually primary), Guild,
 * Profile, in that exact order. Active = gold (#f0cf72), inactive = muted
 * violet (#6f5f92).
 */
private data class TabItem(
    val route: String,
    val label: String,
    val icon: ImageVector
)

private val tabItems = listOf(
    TabItem(AppDestinations.HOME, "Home", Icons.Filled.Home),
    TabItem(AppDestinations.STORE, "Store", Icons.Filled.Store),
    TabItem(AppDestinations.PLAY, "Play", Icons.Filled.PlayArrow),
    TabItem(AppDestinations.GUILD, "Guild", Icons.Filled.Shield),
    TabItem(AppDestinations.PROFILE, "Profile", Icons.Filled.Person)
)

@Composable
fun BottomTabBar(navController: NavHostController) {
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination

    NavigationBar(containerColor = Panel) {
        tabItems.forEach { item ->
            val selected = currentDestination?.hierarchy?.any { it.route == item.route } == true
            val isPlayTab = item.route == AppDestinations.PLAY

            NavigationBarItem(
                selected = selected,
                onClick = {
                    navController.navigate(item.route) {
                        // Tabs are top-level destinations: popping to the graph's
                        // start destination avoids stacking duplicate tab entries
                        // while switching between them.
                        popUpTo(navController.graph.findStartDestination().id) {
                            saveState = true
                        }
                        launchSingleTop = true
                        restoreState = true
                    }
                },
                icon = {
                    if (isPlayTab) {
                        // Play is visually the center/primary item: a filled
                        // gold circle behind the icon, always glowing regardless
                        // of active state (matches prototype's constant gold
                        // drop-shadow on the center Play icon).
                        Icon(
                            imageVector = item.icon,
                            contentDescription = item.label,
                            tint = Bg2,
                            modifier = Modifier
                                .background(TabActiveGold, CircleShape)
                                .size(32.dp)
                        )
                    } else {
                        Icon(imageVector = item.icon, contentDescription = item.label)
                    }
                },
                label = { androidx.compose.material3.Text(item.label) },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = if (isPlayTab) Bg2 else TabActiveGold,
                    selectedTextColor = TabActiveGold,
                    unselectedIconColor = TabInactiveViolet,
                    unselectedTextColor = TabInactiveViolet,
                    indicatorColor = Panel
                )
            )
        }
    }
}
