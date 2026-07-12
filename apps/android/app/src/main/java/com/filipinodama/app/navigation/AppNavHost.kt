package com.filipinodama.app.navigation

import androidx.activity.compose.BackHandler
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
import com.filipinodama.app.ui.screens.OnboardingScreen
import com.filipinodama.app.ui.screens.PlayScreen
import com.filipinodama.app.ui.screens.ProfileScreen
import com.filipinodama.app.ui.screens.SplashDestination
import com.filipinodama.app.ui.screens.SplashScreen
import com.filipinodama.app.ui.screens.StoreScreen
import com.filipinodama.app.ui.screens.auth.CreateAccountScreen
import com.filipinodama.app.ui.screens.auth.ForgotPasswordScreen
import com.filipinodama.app.ui.screens.auth.LoginScreen

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
 *
 * PHASE 2 AUTH SHELL back-stack rules (explicit per this phase's task spec):
 *  - Splash is a one-time gate: whichever destination it resolves to
 *    (Login / Onboarding / Home) pops Splash off the back stack, so back
 *    from that destination exits the app instead of returning to Splash.
 *  - Create Account / Forgot Password each get an explicit back CHEVRON
 *    (AuthBackButton) that returns to Login — matching the inventory's `‹`
 *    convention — AND the system back gesture pops the same way since they
 *    are pushed on top of Login in the back stack (no popUpTo trickery
 *    needed there, a plain `navigate()` push is correct).
 *  - Onboarding must NOT be back-navigable into Splash or Login: it is
 *    reached via popUpTo(...){ inclusive = true } from Splash/Login (never
 *    pushed on top), and system back is intercepted with a no-op
 *    BackHandler while on Onboarding so there is nothing behind it to
 *    return to.
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

    /** Clears the whole back stack down to the graph root, then lands on [route]. */
    fun goClearingStack(route: String) {
        navController.navigate(route) {
            popUpTo(navController.graph.id) { inclusive = true }
        }
    }

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
                    onResolved = { destination ->
                        val target = when (destination) {
                            SplashDestination.Home -> AppDestinations.HOME
                            SplashDestination.Onboarding -> AppDestinations.ONBOARDING
                            SplashDestination.Auth -> AppDestinations.LOGIN
                        }
                        goClearingStack(target)
                    }
                )
            }

            composable(AppDestinations.LOGIN) {
                LoginScreen(
                    onLoginSuccess = {
                        // A returning, already-onboarded user goes straight to
                        // Home; onboarding only ever triggers right after a
                        // fresh registration (see OnboardingScreen kdoc).
                        goClearingStack(AppDestinations.HOME)
                    },
                    onGuestSuccess = {
                        // Guests skip onboarding entirely (mirrors the web
                        // client: OnboardingFlow only triggers for a
                        // non-guest justRegistered session).
                        goClearingStack(AppDestinations.HOME)
                    },
                    onCreateAccount = { navController.navigate(AppDestinations.CREATE_ACCOUNT) },
                    onForgotPassword = { navController.navigate(AppDestinations.FORGOT_PASSWORD) }
                )
            }

            composable(AppDestinations.CREATE_ACCOUNT) {
                CreateAccountScreen(
                    onBack = { navController.popBackStack() },
                    onAccountCreated = {
                        // Fresh non-guest registration: route to onboarding,
                        // clearing Login/CreateAccount off the stack so back
                        // from Onboarding can't return to the auth forms.
                        goClearingStack(AppDestinations.ONBOARDING)
                    }
                )
            }

            composable(AppDestinations.FORGOT_PASSWORD) {
                ForgotPasswordScreen(onBack = { navController.popBackStack() })
            }

            composable(AppDestinations.ONBOARDING) {
                // Intercept system/gesture back entirely — there is nothing
                // behind Onboarding in the stack to return to (Splash/Login
                // were cleared via popUpTo when navigating here).
                BackHandler(enabled = true) { /* no-op: onboarding is not back-navigable */ }
                OnboardingScreen(
                    onFinished = { goClearingStack(AppDestinations.HOME) }
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
