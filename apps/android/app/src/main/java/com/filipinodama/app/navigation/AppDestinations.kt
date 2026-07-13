package com.filipinodama.app.navigation

/** Route constants for AppNavHost. Kept separate so BottomTabBar can reference
 * them without a circular import against AppNavHost.kt. */
object AppDestinations {
    const val SPLASH = "splash"

    // Auth shell (Phase 2): mirrors mobile-screen-inventory.md §2 Screen 4
    // (Sign in / Auth) split into distinct Compose destinations, plus the
    // web client's real forgot-password flow (apps/web AuthPage.tsx).
    const val LOGIN = "auth/login"
    const val CREATE_ACCOUNT = "auth/create-account"
    const val FORGOT_PASSWORD = "auth/forgot-password"

    const val ONBOARDING = "onboarding"

    const val HOME = "home"
    const val STORE = "store"
    const val GUILD = "guild"
    const val PROFILE = "profile"

    // Phase 3 (gameplay core): PLAY tab routes to Mode Select (`go('mode')` in
    // the prototype), not a dedicated "play" screen — mobile-screen-inventory.md
    // NAVIGATION MODEL. showTabs excludes board/matchmaking/aidiff per the same
    // doc, so those three hide the bottom tab bar; Mode Select keeps it visible.
    const val MODE_SELECT = "play/mode"
    const val AI_DIFFICULTY = "play/ai-difficulty"
    const val AI_GAME = "play/ai-game/{difficulty}"
    fun aiGame(difficulty: String) = "play/ai-game/$difficulty"
    const val MATCHMAKING = "play/matchmaking/{mode}"
    fun matchmaking(mode: String) = "play/matchmaking/$mode"
    const val ONLINE_MATCH = "play/online/{mode}"
    fun onlineMatch(mode: String) = "play/online/$mode"
    /** Spectate-by-id entry (from the Live Match Browser watching a plain match). */
    const val SPECTATE_MATCH = "play/spectate/{matchId}"
    fun spectateMatch(matchId: String) = "play/spectate/$matchId"

    // Phase 4 (rooms + chat + spectate): Private Room lobby, optionally deep
    // linked with a room code (?code=) and/or spectate intent (?spectate=1),
    // mirroring apps/web's /rooms?code=X&spectate=1 URL shape.
    const val PRIVATE_ROOM = "play/room?code={code}&spectate={spectate}"
    fun privateRoom(code: String? = null, spectate: Boolean = false): String {
        val base = "play/room"
        val params = buildList {
            if (code != null) add("code=$code")
            if (spectate) add("spectate=1")
        }
        return if (params.isEmpty()) base else "$base?${params.joinToString("&")}"
    }

    /** Live Match Browser — mobile-screen-inventory.md SCREEN 22 ("Watch Live"). */
    const val LIVE_MATCH_BROWSER = "play/live"

    // Phase 5 (economy surfaces): reached from Home hub cards / Store /
    // Profile quick-links per mobile-screen-inventory.md §2 SCREENs 11, 13,
    // 23, 24, 33. All are non-tab screens with an explicit back target
    // (Home), matching the "explicit back target per screen" convention.
    const val INVENTORY = "economy/inventory"
    const val ORDERS = "economy/orders"
    const val DAILY_REWARD = "economy/daily-reward"
    const val QUESTS = "economy/quests"
    const val SEASON = "economy/season"

    // Tournaments list — mobile-screen-inventory.md SCREEN 5 row 7's "Tournaments"
    // strip destination. Home's Tournaments card is real, server-backed
    // (GET /api/tournaments); this is the minimal 1:1 list screen built from the
    // mockup's cups-list rows (join/bracket detail is a later phase — see
    // TournamentsListScreen.kt kdoc).
    const val TOURNAMENTS = "economy/tournaments"

    // Tournament Detail — mobile-screen-inventory.md SCREEN 9, reached from a
    // TournamentsListScreen row tap (finding PROG-1/PROG-2 — those rows were
    // previously dead). Explicit back target: the Tournaments list.
    const val TOURNAMENT_DETAIL = "economy/tournaments/{id}"
    fun tournamentDetail(id: String) = "economy/tournaments/$id"

    // Phase 6a (profile + social): match history replay, public player
    // profiles, leaderboard — reached from Profile tab / leaderboard rows /
    // Home hub identity header (mobile-screen-inventory.md SCREENs 10, 25,
    // 28 + the Replay Viewer overlay). All are non-tab screens with an
    // explicit back target, matching the Phase 5 economy-surface convention.
    const val REPLAY = "profile/replay/{matchId}"
    fun replay(matchId: String) = "profile/replay/$matchId"
    const val PUBLIC_PROFILE = "profile/public/{userId}"
    fun publicProfile(userId: String) = "profile/public/$userId"

    // Match Detail (finding PROF-1) — mobile-screen-inventory.md SCREEN 29, the
    // intermediate stats screen between a match-history row and the full
    // ReplayViewerScreen board playback. Reached from Profile's History tab
    // and Public Profile's Match Replays list; its own "Watch replay" opens
    // [REPLAY] for the same matchId.
    const val MATCH_DETAIL = "profile/match/{matchId}"
    fun matchDetail(matchId: String) = "profile/match/$matchId"
    const val LEADERBOARD = "social/leaderboard"
    // Global Player Search — mockup {{ gsOpen }} overlay, the destination for
    // Home's magnifier icon. Confirmed missing (UI-fidelity sweep); built
    // against the real GET /api/users/search endpoint.
    const val GLOBAL_SEARCH = "social/search"

    // Phase 6b (friends + DM, guilds, notifications): mobile-screen-inventory.md
    // SCREENs 26 (Friends), 27 (Add Friend — folded into Friends' own modal, no
    // separate destination needed since it's a bottom sheet not a screen push),
    // 12 (Notifications). DM (MessagesPage.tsx port) has no dedicated inventory
    // screen number (reached from Friends' 💬 button / Public Profile's Message
    // button in the real web client), so its routes are named to match that
    // real entry point. Guild replaces the placeholder GUILD tab route above —
    // no new route constant needed there.
    const val FRIENDS = "social/friends"
    const val NOTIFICATIONS = "social/notifications"
    const val DM_LIST = "social/messages"
    const val DM_THREAD = "social/messages/{userId}"
    fun dmThread(userId: String) = "social/messages/$userId"

    // Phase 7 (settings, legal, delete account, system states): Settings is
    // reached from Profile's quick-links (mobile-screen-inventory.md SCREEN
    // 10 "Settings tab" rows folded into a dedicated screen — Android's
    // ProfileScreen has no tab switcher yet, see SettingsScreen.kt kdoc).
    // Legal takes an initial document key so About/Legal rows deep-link
    // straight to the tapped document (Terms/Privacy/etc.), matching
    // apps/web's separate /terms /privacy /community /anti-cheat /data
    // routes collapsed into one screen with an in-screen tab switch.
    const val SETTINGS = "profile/settings"
    const val LEGAL = "profile/legal/{doc}"
    fun legal(doc: String) = "profile/legal/$doc"

    // Achievements — mobile-screen-inventory.md SCREEN 30. Always the
    // current user's own achievements (no :id arg), reached from Profile
    // Overview's "See all ›" header and the achievements grid tap.
    const val ACHIEVEMENTS = "profile/achievements"
}
