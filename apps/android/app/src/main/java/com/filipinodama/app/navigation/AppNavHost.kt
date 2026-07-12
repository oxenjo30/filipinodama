package com.filipinodama.app.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.filipinodama.app.ui.screens.GuildScreen
import com.filipinodama.app.ui.screens.HomeScreen
import com.filipinodama.app.ui.screens.PlayScreen
import com.filipinodama.app.ui.screens.ProfileScreen
import com.filipinodama.app.ui.screens.SplashScreen
import com.filipinodama.app.ui.screens.StoreScreen

/**
 * NAVIGATION NOTES (see tasks/handoffv3-audit/mobile-screen-inventory.md,
 * "NAVIGATION MODEL" section, for the full source-of-truth breakdown):
 *
 * The prototype (`FilipinoDama Mobile.dc.html`) has NO browser back-stack —
 * it's a single `state.screen` string with explicit `‹` back buttons per
 * screen calling `this.go('target')`. There is no history.pushState /
 * popstate handling anywhere in the source.
 *
 * This Android build intentionally does NOT replicate that with a generic
 * back-stack for everything. The 5 tab-bar destinations below (Home, Store,
 * Play, Guild, Profile) are wired as standard top-level Navigation-Compose
 * destinations — back from a tab exits the app via NavHost's default back
 * handling, which is standard/expected Android behavior and does not need
 * special-casing in Phase 1.
 *
 * FUTURE PHASES: when the 33 real (non-tab) screens are added, each one
 * must be wired with an EXPLICIT back target (mirroring the prototype's
 * `go(target)` convention) rather than relying on NavHost's generic back
 * stack — e.g. a "Room" screen's back button should navigate directly to
 * "Mode Select", not merely pop whatever happened to be pushed before it.
 * Do not silently switch this convention to a generic back-stack model when
 * those screens are built.
 */

private val tabRoutes = setOf(
    AppDestinations.HOME,
    AppDestinations.STORE,
    AppDestinations.PLAY,
    AppDestinations.GUILD,
    AppDestinations.PROFILE
)

@Composable
fun AppNavHost() {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination
    val showTabBar = currentDestination?.hierarchy?.any { it.route in tabRoutes } == true

    Scaffold(
        bottomBar = {
            if (showTabBar) {
                BottomTabBar(navController)
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = AppDestinations.SPLASH,
            modifier = Modifier.padding(innerPadding)
        ) {
            composable(AppDestinations.SPLASH) {
                SplashScreen(
                    onEnter = {
                        navController.navigate(AppDestinations.HOME) {
                            // Splash is a one-time gate, not a real back target:
                            // pop it off so back-from-home exits the app instead
                            // of returning to splash.
                            popUpTo(AppDestinations.SPLASH) { inclusive = true }
                        }
                    }
                )
            }
            composable(AppDestinations.HOME) { HomeScreen() }
            composable(AppDestinations.STORE) { StoreScreen() }
            composable(AppDestinations.PLAY) { PlayScreen() }
            composable(AppDestinations.GUILD) { GuildScreen() }
            composable(AppDestinations.PROFILE) { ProfileScreen() }
        }
    }
}
