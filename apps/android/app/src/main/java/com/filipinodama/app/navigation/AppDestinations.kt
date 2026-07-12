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
}
