package com.filipinodama.app.navigation

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.filipinodama.app.data.config.ConfigRepository
import com.filipinodama.app.data.config.MaintenanceState
import com.filipinodama.app.data.match.GameRepository
import com.filipinodama.app.data.match.MatchRepository
import com.filipinodama.app.data.rooms.RoomRepository
import com.filipinodama.app.data.system.ConnectivityObserver
import com.filipinodama.app.data.system.offlineBannerVisible
import com.filipinodama.app.ui.screens.HomeScreen
import com.filipinodama.app.ui.screens.OnboardingScreen
import com.filipinodama.app.ui.screens.profile.ProfileScreen
import com.filipinodama.app.ui.screens.SplashDestination
import com.filipinodama.app.ui.screens.SplashScreen
import com.filipinodama.app.ui.screens.StoreScreen
import com.filipinodama.app.ui.screens.auth.CreateAccountScreen
import com.filipinodama.app.ui.screens.auth.ForgotPasswordScreen
import com.filipinodama.app.ui.screens.auth.LoginScreen
import com.filipinodama.app.ui.screens.game.AiDifficultyScreen
import com.filipinodama.app.ui.screens.game.MatchmakingScreen
import com.filipinodama.app.ui.screens.game.ModeSelectScreen
import com.filipinodama.app.ui.screens.game.OfflineGameScreen
import com.filipinodama.app.ui.screens.game.OnlineMatchScreen
import com.filipinodama.app.ui.components.LoadingContext
import com.filipinodama.app.ui.components.LoadingOverlay
import com.filipinodama.app.ui.screens.rooms.LiveMatchBrowserScreen
import com.filipinodama.app.ui.screens.rooms.PrivateRoomScreen
import com.filipinodama.app.ui.screens.economy.DailyRewardsScreen
import com.filipinodama.app.ui.screens.economy.InventoryScreen
import com.filipinodama.app.ui.screens.economy.OrdersScreen
import com.filipinodama.app.ui.screens.economy.QuestsScreen
import com.filipinodama.app.ui.screens.economy.SeasonScreen
import com.filipinodama.app.ui.screens.economy.TournamentDetailScreen
import com.filipinodama.app.ui.screens.economy.TournamentsListScreen
import com.filipinodama.app.ui.screens.economy.WalletScreen
import com.filipinodama.app.ui.screens.leaderboard.LeaderboardScreen
import com.filipinodama.app.ui.screens.profile.AchievementsScreen
import com.filipinodama.app.ui.screens.profile.MatchDetailScreen
import com.filipinodama.app.ui.screens.profile.PublicProfileScreen
import com.filipinodama.app.ui.screens.profile.ReplayViewerScreen
import com.filipinodama.app.ui.screens.settings.LegalScreen
import com.filipinodama.app.ui.screens.settings.SettingsScreen
import com.filipinodama.app.ui.screens.system.MaintenanceScreen
import com.filipinodama.app.ui.screens.system.OfflineBanner
import com.filipinodama.app.ui.screens.system.SanctionBanner
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.ui.screens.social.DiscoverGuildsScreen
import com.filipinodama.app.ui.screens.social.DmConversationListScreen
import com.filipinodama.app.ui.screens.social.DmThreadScreen
import com.filipinodama.app.ui.screens.social.FriendsScreen
import com.filipinodama.app.ui.screens.social.GlobalSearchScreen
import com.filipinodama.app.ui.screens.social.GuildHallScreen
import com.filipinodama.app.ui.screens.social.NotificationsScreen
import kotlinx.coroutines.launch

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

/**
 * In-flow pre-match loader gate — mockup `playWithLoader(ctx, fn)` (Mobile.dc.html
 * line 2695): show [LoadingOverlay] for [durationMs] (2050, matching the
 * mockup) the moment a match destination is entered, then reveal [content].
 * [key] re-arms the gate per distinct navigation (e.g. a new matchId/mode),
 * so re-entering the same route (rematch, retry) shows the loader again just
 * like the mockup's fresh `playWithLoader` call per transition.
 */
@Composable
private fun MatchEntryGate(
    key: Any?,
    loadingContext: LoadingContext,
    durationMs: Int = 2050,
    content: @Composable () -> Unit
) {
    var showLoader by remember(key) { mutableStateOf(true) }
    if (showLoader) {
        LoadingOverlay(context = loadingContext, durationMs = durationMs, onFinished = { showLoader = false })
    } else {
        content()
    }
}

private val tabRoutes = setOf(
    AppDestinations.HOME,
    AppDestinations.STORE,
    AppDestinations.MODE_SELECT,
    AppDestinations.GUILD,
    AppDestinations.PROFILE
)

// showTabs gate (mobile-screen-inventory.md §1): hidden on board, matchmaking,
// aidiff. [showTabBar] below is opt-IN (only routes in [tabRoutes] show the
// bar), so the game-flow routes (AI_DIFFICULTY, AI_GAME, MATCHMAKING,
// ONLINE_MATCH) are hidden simply by never being added to [tabRoutes] — no
// separate exclusion list needed.

@Composable
fun AppNavHost() {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination
    val showTabBar = currentDestination?.hierarchy?.any { it.route in tabRoutes } == true
    // Tablet width cap (see TabletWidthCap.kt): centre + cap page content at
    // 640dp on large screens, except the game/board routes which must stay
    // full-width so the checkerboard fills the screen. No-op on phones.
    val fullWidthRoute = isFullWidthRoute(currentDestination?.route)

    /** Clears the whole back stack down to the graph root, then lands on [route]. */
    fun goClearingStack(route: String) {
        navController.navigate(route) {
            popUpTo(navController.graph.id) { inclusive = true }
        }
    }

    /**
     * ALL ONLINE matchmaking requires a REAL account. The realtime socket
     * rejects unauthenticated connections (server io.use guard), so a guest /
     * anonymous user who starts an online search would just sit in "Finding
     * opponent…" FOREVER — mm:join never reaches the server, no human match and
     * no AI-fallback ever fires (owner-reported: "quick match never pairs me,
     * and it doesn't ask me to log in"). So Quick Match (CASUAL) is gated exactly
     * like Ranked: no account → Login. Offline "Play vs AI" stays open to all.
     *
     * [mode] is "CASUAL" or "RANKED". Used by every online entry point (Home
     * cards, Mode Select cards, Guild play-ranked) so none can start a doomed
     * anonymous search.
     */
    fun playOnlineOrLogin(mode: String) {
        val u = AuthRepository.state.value.user
        val hasRealAccount = u != null && !u.isGuest
        if (hasRealAccount) navController.navigate(AppDestinations.matchmaking(mode))
        else navController.navigate(AppDestinations.LOGIN)
    }

    /** Ranked-specific shorthand (kept for existing call sites). */
    fun playRankedOrLogin() = playOnlineOrLogin("RANKED")

    // ── System states (Phase 7): maintenance gate + offline banner ──
    //
    // Maintenance takeover (SYSTEM_STATES.md z-index 380, highest full-screen
    // layer): re-checked on app start AND on every return to foreground
    // (ON_RESUME), matching the task spec's "app start + on foreground" gate
    // and apps/web AppLayout.tsx's own "purely additive, re-fetched" pattern
    // for the same GET /api/config/public endpoint. Blocks the ENTIRE app
    // (not just a dismissible banner like web's desktop nav banner) per
    // mobile-screen-inventory.md SCREEN 1 being a full-screen `sc-if` gate.
    val maintenance by ConfigRepository.maintenance.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val lifecycleOwner = LocalLifecycleOwner.current

    LaunchedEffect(Unit) { ConfigRepository.refresh() }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                scope.launch { ConfigRepository.refresh() }
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    // Offline strip (SYSTEM_STATES.md z-index 400 — "coexists above
    // everything", including the maintenance takeover). Pure boolean derived
    // from ConnectivityManager via ConnectivityObserver -> offlineBannerVisible.
    var isOnline by remember { mutableStateOf(true) }
    DisposableEffect(context) {
        var job: kotlinx.coroutines.Job? = null
        job = scope.launch {
            ConnectivityObserver.observe(context).collect { online -> isOnline = online }
        }
        onDispose { job?.cancel() }
    }

    if (maintenance is MaintenanceState.Active) {
        val message = (maintenance as MaintenanceState.Active).message
        Column(modifier = Modifier.fillMaxSize()) {
            OfflineBanner(visible = offlineBannerVisible(isOnline))
            Box(modifier = Modifier.fillMaxSize()) {
                MaintenanceScreen(
                    message = message,
                    onCheckAgain = { scope.launch { ConfigRepository.refresh() } }
                )
            }
        }
        return
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            // Edge-to-edge is on (MainActivity), so inset the whole app below the
            // status bar. The bottom nav-bar inset is handled inside BottomTabBar
            // (navigationBarsPadding) so the Scaffold owns its own bottom insets;
            // here we only claim the TOP so headers/banners clear the status bar.
            .statusBarsPadding()
    ) {
        OfflineBanner(visible = offlineBannerVisible(isOnline))
        SanctionBanner()
        Scaffold(
            // The tab bar handles its own navigation-bar inset; don't let the
            // Scaffold add the bottom system inset a second time (would push the
            // content up by the gesture-bar height and leave a gap).
            contentWindowInsets = WindowInsets(0, 0, 0, 0),
            bottomBar = {
                if (showTabBar) {
                    BottomTabBar(navController)
                }
            }
        ) { innerPadding ->
        TabletWidthCap(capEnabled = !fullWidthRoute) {
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
                // Login is reached two ways: (a) from Splash as the app's entry
                // when it's the start of the stack — then there's nothing behind
                // it, so no back chevron; (b) pushed on top of a browsable screen
                // by a gated ACTION (Ranked, claim reward, host room, join guild)
                // — then an anonymous user must be able to back out. previousBackStackEntry
                // is null only in case (a).
                val canGoBack = navController.previousBackStackEntry != null
                LoginScreen(
                    onLoginSuccess = {
                        // A returning, already-onboarded user goes straight to
                        // Home; onboarding only ever triggers right after a
                        // fresh registration (see OnboardingScreen kdoc).
                        goClearingStack(AppDestinations.HOME)
                    },
                    onCreateAccount = { navController.navigate(AppDestinations.CREATE_ACCOUNT) },
                    onForgotPassword = { navController.navigate(AppDestinations.FORGOT_PASSWORD) },
                    onBack = if (canGoBack) ({ navController.popBackStack() }) else null
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

            composable(AppDestinations.HOME) {
                HomeScreen(
                    onQuickMatch = { playOnlineOrLogin("CASUAL") },
                    onRanked = { playRankedOrLogin() },
                    onPlayAi = { navController.navigate(AppDestinations.AI_DIFFICULTY) },
                    onPlayFriend = { navController.navigate(AppDestinations.privateRoom()) },
                    onDailyReward = { navController.navigate(AppDestinations.DAILY_REWARD) },
                    onQuests = { navController.navigate(AppDestinations.QUESTS) },
                    onSeason = { navController.navigate(AppDestinations.SEASON) },
                    onTournaments = { navController.navigate(AppDestinations.TOURNAMENTS) },
                    onResumeMatch = { mode ->
                        navController.navigate(AppDestinations.onlineMatch(mode)) {
                            popUpTo(AppDestinations.HOME)
                        }
                    },
                    onOpenLeaderboard = { navController.navigate(AppDestinations.LEADERBOARD) },
                    onOpenNotifications = { navController.navigate(AppDestinations.NOTIFICATIONS) },
                    onOpenSearch = { navController.navigate(AppDestinations.GLOBAL_SEARCH) },
                    onOpenWallet = { navController.navigate(AppDestinations.WALLET) }
                )
            }
            composable(AppDestinations.STORE) {
                StoreScreen(
                    onOpenInventory = { navController.navigate(AppDestinations.INVENTORY) },
                    onRequireSignIn = { navController.navigate(AppDestinations.LOGIN) }
                )
            }
            composable(AppDestinations.GUILD) {
                GuildHallScreen(
                    onOpenProfile = { userId -> navController.navigate(AppDestinations.publicProfile(userId)) },
                    onOpenDiscover = { navController.navigate(AppDestinations.DISCOVER_GUILDS) },
                    onPlayRanked = { playRankedOrLogin() },
                    // Anonymous user acting (Create guild) — prompt sign-in.
                    onRequireSignIn = { navController.navigate(AppDestinations.LOGIN) }
                )
            }
            composable(AppDestinations.PROFILE) {
                ProfileScreen(
                    onSignedOut = {
                        goClearingStack(AppDestinations.LOGIN)
                    },
                    // Guest tapping "Sign In / Create Account" on the Overview:
                    // go to Login without clearing the stack, so a cancelled
                    // sign-in (back) returns them to their guest session.
                    onGoToSignIn = { navController.navigate(AppDestinations.LOGIN) },
                    onOpenMatch = { matchId -> navController.navigate(AppDestinations.matchDetail(matchId)) },
                    onOpenFriends = { navController.navigate(AppDestinations.FRIENDS) },
                    onOpenGuild = { navController.navigate(AppDestinations.GUILD) },
                    onOpenDiscoverGuilds = { navController.navigate(AppDestinations.DISCOVER_GUILDS) },
                    onOpenOrders = { navController.navigate(AppDestinations.ORDERS) },
                    onOpenInventory = { navController.navigate(AppDestinations.INVENTORY) },
                    // Owner round-3 fix: Profile's Settings TAB now renders
                    // inline (see ProfileScreen.kt kdoc) instead of navigating
                    // to AppDestinations.SETTINGS — onOpenLegal wires the
                    // inline tab's Support rows straight to the same real
                    // Legal destination the standalone SettingsScreen uses.
                    onOpenLegal = { doc -> navController.navigate(AppDestinations.legal(doc)) },
                    onOpenAchievements = { navController.navigate(AppDestinations.ACHIEVEMENTS) }
                )
            }
            composable(AppDestinations.ACHIEVEMENTS) {
                AchievementsScreen(onBack = { navController.popBackStack() })
            }
            composable(AppDestinations.WALLET) {
                WalletScreen(onBack = { navController.popBackStack() })
            }
            composable(AppDestinations.DISCOVER_GUILDS) {
                DiscoverGuildsScreen(
                    onBack = { navController.popBackStack() },
                    onRequireSignIn = { navController.navigate(AppDestinations.LOGIN) }
                )
            }

            // ---- Phase 7: settings, legal, delete account, system states ----
            composable(AppDestinations.SETTINGS) {
                SettingsScreen(
                    onBack = { navController.popBackStack() },
                    onSignedOut = { goClearingStack(AppDestinations.LOGIN) },
                    onOpenInventory = { navController.navigate(AppDestinations.INVENTORY) },
                    onOpenLegal = { doc -> navController.navigate(AppDestinations.legal(doc)) }
                )
            }
            composable(
                route = AppDestinations.LEGAL,
                arguments = listOf(navArgument("doc") { type = NavType.StringType })
            ) { backStackEntry ->
                val doc = backStackEntry.arguments?.getString("doc") ?: "terms"
                LegalScreen(initialKey = doc, onBack = { navController.popBackStack() })
            }

            // ---- Phase 6b: friends + DM, guilds, notifications, report flow ----
            composable(AppDestinations.FRIENDS) {
                FriendsScreen(
                    onBack = { navController.popBackStack() },
                    onOpenProfile = { userId -> navController.navigate(AppDestinations.publicProfile(userId)) },
                    onOpenChat = { userId -> navController.navigate(AppDestinations.dmThread(userId)) }
                )
            }
            composable(AppDestinations.NOTIFICATIONS) {
                NotificationsScreen(onBack = { navController.popBackStack() })
            }
            composable(AppDestinations.DM_LIST) {
                DmConversationListScreen(
                    onBack = { navController.popBackStack() },
                    onOpenThread = { userId -> navController.navigate(AppDestinations.dmThread(userId)) }
                )
            }
            composable(
                route = AppDestinations.DM_THREAD,
                arguments = listOf(navArgument("userId") { type = NavType.StringType })
            ) { backStackEntry ->
                val userId = backStackEntry.arguments?.getString("userId") ?: ""
                DmThreadScreen(userId = userId, onBack = { navController.popBackStack() })
            }

            // ---- Phase 6a: profile + social (replay viewer, public profiles, leaderboard) ----
            composable(
                route = AppDestinations.REPLAY,
                arguments = listOf(navArgument("matchId") { type = NavType.StringType })
            ) { backStackEntry ->
                val matchId = backStackEntry.arguments?.getString("matchId") ?: ""
                ReplayViewerScreen(matchId = matchId, onBack = { navController.popBackStack() })
            }

            // Match Detail (finding PROF-1) — the intermediate stats screen a
            // History row / Public Profile match row opens BEFORE the full
            // ReplayViewer. Its own "Watch replay" pushes AppDestinations.REPLAY
            // for the same matchId; its opponent row pushes PUBLIC_PROFILE.
            composable(
                route = AppDestinations.MATCH_DETAIL,
                arguments = listOf(navArgument("matchId") { type = NavType.StringType })
            ) { backStackEntry ->
                val matchId = backStackEntry.arguments?.getString("matchId") ?: ""
                MatchDetailScreen(
                    matchId = matchId,
                    onBack = { navController.popBackStack() },
                    onOpenProfile = { userId -> navController.navigate(AppDestinations.publicProfile(userId)) },
                    onWatchReplay = { id -> navController.navigate(AppDestinations.replay(id)) }
                )
            }

            composable(
                route = AppDestinations.PUBLIC_PROFILE,
                arguments = listOf(navArgument("userId") { type = NavType.StringType })
            ) { backStackEntry ->
                val userId = backStackEntry.arguments?.getString("userId") ?: ""
                val signedIn = AuthRepository.state.value.user != null
                PublicProfileScreen(
                    userId = userId,
                    onOpenMatch = { matchId -> navController.navigate(AppDestinations.matchDetail(matchId)) },
                    onOpenChat = { targetId -> navController.navigate(AppDestinations.dmThread(targetId)) },
                    signedIn = signedIn,
                    onRequireSignIn = { navController.navigate(AppDestinations.LOGIN) },
                    onBack = { navController.popBackStack() }
                )
            }

            composable(AppDestinations.LEADERBOARD) {
                LeaderboardScreen(
                    onOpenPublicProfile = { userId -> navController.navigate(AppDestinations.publicProfile(userId)) },
                    onBack = { navController.popBackStack() }
                )
            }
            composable(AppDestinations.GLOBAL_SEARCH) {
                GlobalSearchScreen(
                    onClose = { navController.popBackStack() },
                    onOpenProfile = { userId ->
                        navController.popBackStack()
                        navController.navigate(AppDestinations.publicProfile(userId))
                    }
                )
            }

            // ---- Phase 5: economy surfaces ----
            composable(AppDestinations.INVENTORY) {
                InventoryScreen(
                    onBrowseStore = {
                        navController.navigate(AppDestinations.STORE) { popUpTo(AppDestinations.HOME) }
                    },
                    onBack = { navController.popBackStack() }
                )
            }
            composable(AppDestinations.ORDERS) {
                OrdersScreen(
                    onBrowseStore = {
                        navController.navigate(AppDestinations.STORE) { popUpTo(AppDestinations.HOME) }
                    },
                    onBack = { navController.popBackStack() }
                )
            }
            composable(AppDestinations.DAILY_REWARD) {
                DailyRewardsScreen(
                    onBack = { navController.popBackStack() },
                    onRequireSignIn = { navController.navigate(AppDestinations.LOGIN) }
                )
            }
            composable(AppDestinations.QUESTS) {
                QuestsScreen(
                    onBack = { navController.popBackStack() },
                    onRequireSignIn = { navController.navigate(AppDestinations.LOGIN) }
                )
            }
            composable(AppDestinations.SEASON) {
                SeasonScreen(
                    onBack = { navController.popBackStack() },
                    onRequireSignIn = { navController.navigate(AppDestinations.LOGIN) }
                )
            }
            composable(AppDestinations.TOURNAMENTS) {
                TournamentsListScreen(
                    onBack = { navController.popBackStack() },
                    onOpenDetail = { id -> navController.navigate(AppDestinations.tournamentDetail(id)) }
                )
            }
            composable(
                route = AppDestinations.TOURNAMENT_DETAIL,
                arguments = listOf(navArgument("id") { type = NavType.StringType })
            ) { backStackEntry ->
                val id = backStackEntry.arguments?.getString("id") ?: ""
                TournamentDetailScreen(
                    tournamentId = id,
                    onBack = { navController.popBackStack() },
                    onRequireSignIn = { navController.navigate(AppDestinations.LOGIN) },
                    onWatchReplay = { matchId -> navController.navigate(AppDestinations.replay(matchId)) }
                )
            }

            // ---- Phase 3: gameplay core (Play tab) ----
            // Play tab -> Mode Select directly (go('mode') in the prototype).
            composable(AppDestinations.MODE_SELECT) {
                ModeSelectScreen(
                    onBack = { navController.popBackStack() },
                    onPlayAi = { navController.navigate(AppDestinations.AI_DIFFICULTY) },
                    onPlayCasual = { playOnlineOrLogin("CASUAL") },
                    onPlayRanked = { playRankedOrLogin() },
                    onPrivateRoom = { navController.navigate(AppDestinations.privateRoom()) },
                    onWatchLive = { navController.navigate(AppDestinations.LIVE_MATCH_BROWSER) },
                    onRankedGuestBlocked = {
                        // Owner policy: Ranked requires a real account. A guest or
                        // an anonymous user tapping Ranked is sent to Login to sign
                        // in / create an account (same as the Tournaments gate's
                        // onRequireSignIn just above).
                        navController.navigate(AppDestinations.LOGIN)
                    }
                )
            }

            composable(AppDestinations.AI_DIFFICULTY) {
                AiDifficultyScreen(
                    onBack = { navController.popBackStack() },
                    onStart = { difficulty -> navController.navigate(AppDestinations.aiGame(difficulty)) }
                )
            }

            composable(
                route = AppDestinations.AI_GAME,
                arguments = listOf(navArgument("difficulty") { type = NavType.StringType })
            ) { backStackEntry ->
                val difficulty = backStackEntry.arguments?.getString("difficulty") ?: "normal"
                // Mockup: startAI() -> playWithLoader('default', ...) before the
                // board shows (finding #1/#2 — was previously an instant jump).
                MatchEntryGate(key = backStackEntry.id, loadingContext = LoadingContext.DEFAULT) {
                    OfflineGameScreen(
                        difficulty = difficulty,
                        onChangeDifficulty = {
                            navController.navigate(AppDestinations.AI_DIFFICULTY) {
                                popUpTo(AppDestinations.MODE_SELECT)
                            }
                        },
                        onHome = {
                            GameRepository.reset()
                            navController.navigate(AppDestinations.HOME) {
                                popUpTo(navController.graph.findStartDestination().id)
                            }
                        }
                    )
                }
            }

            composable(
                route = AppDestinations.MATCHMAKING,
                arguments = listOf(navArgument("mode") { type = NavType.StringType })
            ) { backStackEntry ->
                val mode = backStackEntry.arguments?.getString("mode") ?: "CASUAL"
                MatchmakingScreen(
                    mode = mode,
                    onCancel = { navController.popBackStack() },
                    onEnteredMatch = {
                        navController.navigate(AppDestinations.onlineMatch(mode)) {
                            popUpTo(AppDestinations.MODE_SELECT)
                        }
                    }
                )
            }

            composable(
                route = AppDestinations.ONLINE_MATCH,
                arguments = listOf(navArgument("mode") { type = NavType.StringType })
            ) { backStackEntry ->
                val mode = backStackEntry.arguments?.getString("mode") ?: "CASUAL"
                // System/gesture back mid-match must not silently pop to whatever
                // was underneath (mirrors the "explicit back target per screen"
                // convention in the header doc) — route through Leave explicitly.
                BackHandler(enabled = true) {
                    MatchRepository.leaveQueue()
                    MatchRepository.reset()
                    navController.popBackStack(AppDestinations.MODE_SELECT, inclusive = false)
                }
                // Mockup: enterMatchmaking()/startRoomMatch()/submitJoin() all
                // funnel into playWithLoader(ctx, ...) before the board shows
                // (finding #1/#2). RANKED gets the crimson-tinted loader
                // context, everything else (CASUAL/PRIVATE/SPECTATE) the
                // matchmaking context — mirrors the mockup's ctx mapping.
                val loadingCtx = if (mode == "RANKED") LoadingContext.RANKED else LoadingContext.MATCHMAKING
                MatchEntryGate(key = backStackEntry.id, loadingContext = loadingCtx) {
                    OnlineMatchScreen(
                        mode = mode,
                        onExit = {
                            navController.popBackStack(AppDestinations.MODE_SELECT, inclusive = false)
                        },
                        onWatchReplay = { matchId -> navController.navigate(AppDestinations.replay(matchId)) },
                        onOpenSettings = { navController.navigate(AppDestinations.SETTINGS) }
                    )
                }
            }

            // ---- Phase 4: private rooms, in-match chat + emotes, spectate ----

            composable(
                route = AppDestinations.PRIVATE_ROOM,
                arguments = listOf(
                    navArgument("code") { type = NavType.StringType; nullable = true; defaultValue = null },
                    navArgument("spectate") { type = NavType.StringType; nullable = true; defaultValue = null }
                )
            ) { backStackEntry ->
                val code = backStackEntry.arguments?.getString("code")
                val spectateFlag = backStackEntry.arguments?.getString("spectate") == "1"
                BackHandler(enabled = true) {
                    RoomRepository.leave()
                    RoomRepository.reset()
                    navController.popBackStack(AppDestinations.MODE_SELECT, inclusive = false)
                }
                PrivateRoomScreen(
                    deepLinkCode = code,
                    deepLinkSpectate = spectateFlag,
                    onBack = {
                        navController.popBackStack(AppDestinations.MODE_SELECT, inclusive = false)
                    },
                    onRequireSignIn = { navController.navigate(AppDestinations.LOGIN) },
                    onEnterMatch = {
                        // The match/spectate state is already live in MatchRepository
                        // (RoomRepository's EV.roomStart handler called
                        // MatchRepository.enterFromRoom before this fires) — reuse the
                        // same online-match screen for both a player and a spectator,
                        // exactly like OnlineMatchScreen's myColor==null gating.
                        navController.navigate(AppDestinations.onlineMatch("PRIVATE")) {
                            popUpTo(AppDestinations.MODE_SELECT)
                        }
                    }
                )
            }

            composable(AppDestinations.LIVE_MATCH_BROWSER) {
                // Watch Live PAGE gate (owner directive 2026-07-12): the route
                // stays registered (hide, not removal) but backs out immediately
                // when WATCH_LIVE_ENABLED isn't "true" — safe-off, matching the
                // Mode Select card that is this screen's only entry point. Room/
                // match spectate flows (PRIVATE_ROOM spectate arg, spectate from
                // an invite) are NOT gated.
                val watchLiveEnabled by ConfigRepository.watchLiveEnabled.collectAsState()
                if (!watchLiveEnabled) {
                    LaunchedEffect(Unit) { navController.popBackStack() }
                    return@composable
                }
                LiveMatchBrowserScreen(
                    onWatchMatch = { matchId ->
                        MatchRepository.spectate(matchId)
                        navController.navigate(AppDestinations.onlineMatch("SPECTATE")) {
                            popUpTo(AppDestinations.MODE_SELECT)
                        }
                    },
                    onWatchRoom = { code ->
                        navController.navigate(AppDestinations.privateRoom(code = code, spectate = true)) {
                            popUpTo(AppDestinations.MODE_SELECT)
                        }
                    }
                )
            }
        }
        }
        }
    }
}
