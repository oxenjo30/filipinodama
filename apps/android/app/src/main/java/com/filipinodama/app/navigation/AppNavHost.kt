package com.filipinodama.app.navigation

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
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
import com.filipinodama.app.data.match.ActiveMatchStore
import com.filipinodama.app.data.match.PublicUserDto
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
import com.filipinodama.app.data.play.PlayScreenRequests
import com.filipinodama.app.ui.screens.game.BattleScreen
import com.filipinodama.app.ui.screens.game.AiDifficultyScreen
import com.filipinodama.app.ui.screens.game.MatchmakingScreen
import com.filipinodama.app.ui.screens.game.OfflineGameScreen
import com.filipinodama.app.ui.screens.game.OnlineMatchScreen
import com.filipinodama.app.ui.components.LoadingContext
import com.filipinodama.app.ui.components.LoadingOverlay
import com.filipinodama.app.ui.components.LocalSnackbar
import com.filipinodama.app.ui.components.rememberSnackbarController
import com.filipinodama.app.ui.components.UpdateAvailableDialog
import com.filipinodama.app.ui.components.openPlayStoreListing
import com.filipinodama.app.ui.screens.rooms.LiveMatchBrowserScreen
import com.filipinodama.app.ui.screens.rooms.PrivateRoomScreen
import com.filipinodama.app.ui.screens.economy.DailyRewardsScreen
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
import com.filipinodama.app.ui.screens.settings.MyTicketsScreen
import com.filipinodama.app.ui.screens.settings.SettingsScreen
import com.filipinodama.app.ui.screens.system.MaintenanceScreen
import com.filipinodama.app.ui.screens.system.OfflineBanner
import com.filipinodama.app.ui.screens.system.ReturnToMatchBanner
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
 *
 * The "already loaded" flag is [rememberSaveable] (NOT plain remember): pushing
 * a screen ON TOP of the match (e.g. opening Settings mid-match) removes the
 * match composable from composition, and popping back re-composes it. With
 * plain remember that reset showLoader to true and the ~2s loading screen
 * replayed every time you closed Settings mid-rank-match. rememberSaveable keyed
 * by the same [key] persists the flag across that round-trip, so the loader
 * shows once per real match entry and NOT when returning from an overlay screen.
 * A genuinely new match still gets a new [key] → fresh loader.
 */
@Composable
private fun MatchEntryGate(
    key: Any?,
    loadingContext: LoadingContext,
    durationMs: Int = 2050,
    content: @Composable () -> Unit
) {
    var showLoader by rememberSaveable(key) { mutableStateOf(true) }
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
     * The single way out of the private-room / online-match flow — the back
     * gesture, the header chevron and the lobby's Leave button all route here.
     *
     * popBackStack(MODE_SELECT, inclusive = false) is a NO-OP that merely
     * returns false when MODE_SELECT is not on the back stack (Navigation logs
     * "Ignoring popBackStack to route ... as it was not found on the current
     * back stack"). Every App Links entry lands exactly there: a cold invite
     * resolves Splash -> goClearingStack(HOME) and then pushes the room, so the
     * stack is [graph, HOME, ROOM] with no MODE_SELECT anywhere. Back and the
     * chevron therefore did NOTHING, and the only way out of a deep-linked room
     * was swiping the app away from Recents.
     *
     * Deliberately NOT "fall back to goClearingStack(MODE_SELECT)": that wipes
     * the stack, throws away the HOME the player actually came from, and
     * silently changes where Exit lands on the ordinary Home -> Quick Match
     * path — the app's most common online flow, which has no MODE_SELECT on the
     * stack either and would therefore be re-routed too. Popping ONE level
     * instead preserves whatever is genuinely underneath (HOME for a cold
     * invite, LOGIN for a signed-out one) and only clears to HOME in the
     * otherwise-unrecoverable case where the room is the sole entry.
     *
     * The MODE_SELECT pop is attempted FIRST so the normal Play-tab path
     * (MODE_SELECT -> room) keeps behaving exactly as it does today.
     */
    fun exitRoomFlow() {
        if (navController.popBackStack(AppDestinations.MODE_SELECT, inclusive = false)) return
        if (navController.popBackStack()) return
        goClearingStack(AppDestinations.HOME)
    }

    /**
     * Android App Links hand-off (DeepLinks.kt): a tapped
     * https://filipinodama.com/rooms?code=X opens the app here.
     *
     * Deliberately gated on having left SPLASH. Splash resolves the session and
     * then goClearingStack()s to Home/Login/Onboarding, which would wipe a room
     * route navigated any earlier — so the link is parked in DeepLinks and
     * replayed once the entry destination has settled. Keying the effect on the
     * current route means a cold start (link arrives first, Splash finishes
     * later) and a warm one (onNewIntent while Home is showing) both land.
     *
     * consume() BEFORE navigate() so a recomposition can't double-navigate and
     * stack two copies of the room.
     */
    val pendingDeepLink by DeepLinks.pending.collectAsStateWithLifecycle()
    LaunchedEffect(pendingDeepLink, currentDestination?.route) {
        val route = pendingDeepLink ?: return@LaunchedEffect
        val current = currentDestination?.route ?: return@LaunchedEffect
        if (current == AppDestinations.SPLASH) return@LaunchedEffect
        DeepLinks.consume()
        navController.navigate(route) {
            // Pop any room we're already sitting on FIRST, so a second invite
            // lands on a genuinely fresh destination.
            //
            // launchSingleTop alone is not safe here: it can reuse the entry
            // that is already on top, and PrivateRoomScreen auto-joins from
            // LaunchedEffect(deepLinkCode) — with a reused entry holding the
            // OLD code that key never changes, the effect never re-fires, and
            // tapping a friend's invite while already in a room would leave you
            // sitting in the previous one. Popping guarantees new arguments.
            //
            // popUpTo on a route that is not in the stack is a no-op, so the
            // ordinary "not in a room yet" path is unaffected.
            popUpTo(AppDestinations.PRIVATE_ROOM) { inclusive = true }
            launchSingleTop = true
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

    /**
     * Send the player to the Play tab with the Loadout drawer pending. This is
     * where board/piece-skin equipping lives now that the Inventory screen is
     * gone; the Battle screen opens the drawer on arrival and clears the flag.
     */
    fun goToLoadout() {
        PlayScreenRequests.requestLoadout()
        navController.navigate(AppDestinations.MODE_SELECT) { launchSingleTop = true }
    }

    // ── System states (Phase 7): maintenance gate + offline banner ──
    //
    // Maintenance takeover (SYSTEM_STATES.md z-index 380, highest full-screen
    // layer): re-checked on app start AND on every return to foreground
    // (ON_RESUME), matching the task spec's "app start + on foreground" gate
    // and apps/web AppLayout.tsx's own "purely additive, re-fetched" pattern
    // for the same GET /api/config/public endpoint. Blocks the ENTIRE app
    // (not just a dismissible banner like web's desktop nav banner) per
    // mobile-screen-inventory.md SCREEN 1 being a full-screen `sc-if` gate.
    val maintenance by ConfigRepository.maintenance.collectAsStateWithLifecycle()
    // "Update available" nudge (once per process): a plain `remember` — NOT
    // keyed, NOT reset on ON_RESUME below — so it survives resume/foreground
    // and only resets on cold start, matching the spec's once-per-process cadence.
    val updateAvailable by ConfigRepository.updateAvailable.collectAsStateWithLifecycle()
    // Dismissed state lives on the ConfigRepository object (process-scoped), NOT a
    // composable remember — so "once per process" survives Activity recreation
    // (rotation, system dark-mode toggle, font/locale change) instead of re-nagging.
    val updateDismissed by ConfigRepository.updateNudgeDismissed.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    // App-wide transient feedback — one host, provided to the whole NavHost so any
    // screen can `LocalSnackbar.current.show(...)` instead of a per-screen toast.
    val snackbar = rememberSnackbarController(scope)
    val lifecycleOwner = LocalLifecycleOwner.current

    LaunchedEffect(Unit) { ConfigRepository.refresh() }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                scope.launch { ConfigRepository.refresh() }
                // Refresh the global "Return to match" banner on foreground so a
                // match started/left while backgrounded surfaces (or a finished
                // one clears).
                scope.launch { ActiveMatchStore.refresh() }
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    // Global "Return to match" banner state. Re-fetch GET /api/matches/active
    // whenever the visible route changes (so leaving the match screen, or
    // landing on any tab, refreshes it) and on foreground (above). Only shown
    // when a live match exists AND we're not already on the match screen.
    val activeMatch by ActiveMatchStore.active.collectAsStateWithLifecycle()
    val onMatchRoute = currentDestination?.route == AppDestinations.ONLINE_MATCH
    LaunchedEffect(currentDestination?.route) {
        // Skip refreshing while on the match screen itself (we're already there);
        // refresh on every other route so the banner is current everywhere else.
        if (!onMatchRoute) ActiveMatchStore.refresh()
    }

    // Offline strip (SYSTEM_STATES.md z-index 400 — "coexists above
    // everything", including the maintenance takeover). Pure boolean derived
    // from ConnectivityManager via ConnectivityObserver -> offlineBannerVisible.
    var isOnline by remember { mutableStateOf(true) }
    DisposableEffect(context) {
        var job: kotlinx.coroutines.Job? = null
        job = scope.launch {
            // observeOnline (not observe): suppresses the brief "reconnecting…"
            // flash caused by Android's network-validation lag on app open, while
            // still surfacing a real, sustained outage and clearing instantly on
            // reconnect. See ConnectivityObserver.observeOnline.
            ConnectivityObserver.observeOnline(context).collect { online -> isOnline = online }
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
        // Global "Return to match" strip — lets a player jump back into a live
        // online match from ANY screen (not just the Home card), fixing "I
        // clicked away and there's no way back". Hidden on the match screen
        // itself. The match keeps running server-side, so tapping resyncs it.
        run {
            val am = activeMatch
            val myId = AuthRepository.state.value.user?.id
            val myColor = when {
                am == null -> null
                am.red?.id == myId -> "red"
                am.blue?.id == myId -> "blue"
                else -> null
            }
            val opponentDto = if (am == null) null else if (myColor == "red") am.blue else am.red
            ReturnToMatchBanner(
                visible = am != null && myId != null && !onMatchRoute,
                opponentLabel = opponentDto?.displayName ?: "Opponent",
                modeLabel = matchModeLabel(am?.mode),
                onResume = {
                    // am/myId are non-null whenever the banner is visible (the
                    // only time this fires); resume the live match by resync.
                    if (am != null) {
                        MatchRepository.enterFromRoom(
                            matchId = am.id,
                            yourColor = myColor,
                            opponent = opponentDto?.let {
                                PublicUserDto(
                                    id = it.id,
                                    username = it.username,
                                    displayName = it.displayName,
                                    tag = it.tag,
                                    avatarUrl = it.avatarUrl,
                                    trophies = it.trophies,
                                    rankTier = it.rankTier
                                )
                            }
                        )
                        navController.navigate(AppDestinations.onlineMatch(am.mode)) {
                            popUpTo(AppDestinations.HOME)
                        }
                    }
                },
            )
        }
        Scaffold(
            // The tab bar handles its own navigation-bar inset; don't let the
            // Scaffold add the bottom system inset a second time (would push the
            // content up by the gesture-bar height and leave a gap).
            contentWindowInsets = WindowInsets(0, 0, 0, 0),
            // On-brand snackbar (owner: the default grey Material toast jammed at
            // the very bottom edge was barely visible + off-design). Royal purple
            // panel, gold border + gold text, rounded, and lifted clear of the
            // system nav/gesture bar.
            snackbarHost = {
                SnackbarHost(snackbar.hostState) { data ->
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .navigationBarsPadding()
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        contentAlignment = Alignment.BottomCenter
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(
                                    Brush.verticalGradient(listOf(Color(0xFF241638), Color(0xFF1A0F2C))),
                                    RoundedCornerShape(14.dp)
                                )
                                .border(1.dp, Color(0x66E8B84B), RoundedCornerShape(14.dp))
                                .padding(horizontal = 16.dp, vertical = 13.dp)
                        ) {
                            Text(
                                data.visuals.message,
                                color = Color(0xFFF4ECD6),
                                style = MaterialTheme.typography.bodyMedium,
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                }
            },
            bottomBar = {
                if (showTabBar) {
                    BottomTabBar(navController)
                }
            }
        ) { innerPadding ->
        CompositionLocalProvider(LocalSnackbar provides snackbar) {
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
                        //
                        // Home is still laid down first even when resuming, so
                        // backing out of the room lands somewhere sensible
                        // rather than on the auth form we just cleared.
                        val resume = DeepLinks.takeAfterAuth()
                        goClearingStack(AppDestinations.HOME)
                        if (resume != null) navController.navigate(resume)
                    },
                    onCreateAccount = { navController.navigate(AppDestinations.CREATE_ACCOUNT) },
                    onForgotPassword = { navController.navigate(AppDestinations.FORGOT_PASSWORD) },
                    onBack = if (canGoBack) ({
                        // Abandoning sign-in abandons the invite with it.
                        DeepLinks.clearAfterAuth()
                        navController.popBackStack()
                    }) else null
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
                    onFinished = {
                        // Resumes here too, not just from Login: a player who
                        // arrives on an invite with no account signs UP, and
                        // that path is Login → CreateAccount → Onboarding →
                        // here, never touching onLoginSuccess. Missing this
                        // would strand exactly the new player the invite was
                        // meant to bring in.
                        val resume = DeepLinks.takeAfterAuth()
                        goClearingStack(AppDestinations.HOME)
                        if (resume != null) navController.navigate(resume)
                    }
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
                    onOpenWallet = { navController.navigate(AppDestinations.WALLET) },
                    onOpenMessages = { navController.navigate(AppDestinations.DM_LIST) }
                )
            }
            composable(AppDestinations.STORE) {
                StoreScreen(
                    onOpenLoadout = { goToLoadout() },
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
                        // Signing out abandons any invite parked for post-auth
                        // resume — otherwise it survives into the NEXT sign-in.
                        DeepLinks.clearAfterAuth()
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
                    // Owner round-3 fix: Profile's Settings TAB now renders
                    // inline (see ProfileScreen.kt kdoc) instead of navigating
                    // to AppDestinations.SETTINGS — onOpenLegal wires the
                    // inline tab's Support rows straight to the same real
                    // Legal destination the standalone SettingsScreen uses.
                    onOpenLegal = { doc -> navController.navigate(AppDestinations.legal(doc)) },
                    onOpenAchievements = { navController.navigate(AppDestinations.ACHIEVEMENTS) },
                    onOpenMessages = { navController.navigate(AppDestinations.DM_LIST) }
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
                    onOpenLoadout = { goToLoadout() },
                    onSignedOut = {
                        // Same as Profile's sign-out: drop any parked invite.
                        DeepLinks.clearAfterAuth()
                        goClearingStack(AppDestinations.LOGIN)
                    },
                    onOpenLegal = { doc -> navController.navigate(AppDestinations.legal(doc)) },
                    onOpenTickets = { navController.navigate(AppDestinations.MY_TICKETS) }
                )
            }
            composable(AppDestinations.MY_TICKETS) {
                MyTicketsScreen(onBack = { navController.popBackStack() })
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
                    onOpenChat = { userId -> navController.navigate(AppDestinations.dmThread(userId)) },
                    onRequireSignIn = { navController.navigate(AppDestinations.LOGIN) }
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
                DmThreadScreen(
                    userId = userId,
                    onBack = { navController.popBackStack() },
                    onOpenProfile = { id -> navController.navigate(AppDestinations.publicProfile(id)) }
                )
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
                    onWatchReplay = { matchId -> navController.navigate(AppDestinations.replay(matchId)) },
                    onEnterMatch = { matchMode ->
                        // Both competitors readied and the SERVER started the
                        // match; TournamentLiveRepository already handed it to
                        // MatchRepository (same handoff PrivateRoomScreen's
                        // onEnterMatch relies on), so this only navigates.
                        //
                        // Pass the CUP'S OWN mode (Tournament.matchMode) rather
                        // than a "TOURNAMENT" literal: OnlineMatchScreen keys its
                        // ranked chrome and the end card's trophy pill off this
                        // string, so a RANKED Cup — which really does move
                        // trophies server-side — must not render as casual.
                        navController.navigate(AppDestinations.onlineMatch(matchMode)) {
                            popUpTo(AppDestinations.MODE_SELECT)
                        }
                    }
                )
            }

            // ---- Phase 3: gameplay core (Play tab) ----
            // Play tab -> Mode Select directly (go('mode') in the prototype).
            // Screens that used to deep-link to the Inventory route now hand
            // off into the Play tab's Loadout drawer.
            composable(AppDestinations.MODE_SELECT) {
                // Owner-approved redesign: the Play tab is now the Battle
                // screen. Game Modes lives in a drawer behind the trophy
                // button and ARMS this button, so BATTLE dispatches straight to
                // the armed mode instead of pushing a mode-select screen.
                // AI goes directly to the game at the remembered difficulty —
                // AiDifficultyScreen is no longer on the Play path (its route
                // stays registered; nothing routes to it today).
                BattleScreen(
                    onPlayCasual = { playOnlineOrLogin("CASUAL") },
                    onPlayRanked = { playRankedOrLogin() },
                    onPlayAi = { difficulty -> navController.navigate(AppDestinations.aiGame(difficulty)) },
                    onPrivateRoom = { navController.navigate(AppDestinations.privateRoom()) },
                    onTournaments = { navController.navigate(AppDestinations.TOURNAMENTS) },
                    onQuests = { navController.navigate(AppDestinations.QUESTS) },
                    onDailyReward = { navController.navigate(AppDestinations.DAILY_REWARD) },
                    onWatchLive = { navController.navigate(AppDestinations.LIVE_MATCH_BROWSER) },
                    // Board themes + piece skins are equipped from Inventory
                    // today; an in-drawer picker is a later phase.
                    onBrowseStore = { navController.navigate(AppDestinations.STORE) },
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
                // Back handling now lives INSIDE OnlineMatchScreen (it shows a
                // "Leave the match?" confirm for a live game before exiting, then
                // calls onExit below). No BackHandler here — the screen's own one
                // takes priority while it's on top, and duplicating it risked a
                // double-pop that skipped the confirm.
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
                            exitRoomFlow()
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
                    exitRoomFlow()
                }
                PrivateRoomScreen(
                    deepLinkCode = code,
                    deepLinkSpectate = spectateFlag,
                    onBack = {
                        exitRoomFlow()
                    },
                    onRequireSignIn = {
                        // Remember the room so signing in RETURNS here. Joining
                        // needs a real account and an invite is how a new player
                        // usually arrives, so without this the commonest path
                        // through App Links ends on Home with the code gone and
                        // the invite needing to be found and tapped again.
                        // Only when the code is known — a bare visit to the room
                        // screen has nothing worth returning to.
                        if (code != null) {
                            DeepLinks.parkForAuth(AppDestinations.privateRoom(code, spectateFlag))
                        }
                        navController.navigate(AppDestinations.LOGIN)
                    },
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
                val watchLiveEnabled by ConfigRepository.watchLiveEnabled.collectAsStateWithLifecycle()
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

        if (updateAvailable && !updateDismissed) {
            UpdateAvailableDialog(
                onUpdate = {
                    openPlayStoreListing(context)
                    ConfigRepository.dismissUpdateNudge()
                },
                onDismiss = { ConfigRepository.dismissUpdateNudge() }
            )
        }
    }
}

/** Short mode label for the global "Return to match" banner. */
private fun matchModeLabel(mode: String?): String = when (mode) {
    "CASUAL" -> "Casual"
    "RANKED" -> "Ranked"
    "PRIVATE" -> "Private"
    "AI" -> "vs AI"
    "LOCAL" -> "Local"
    null -> "Match"
    else -> mode
}
