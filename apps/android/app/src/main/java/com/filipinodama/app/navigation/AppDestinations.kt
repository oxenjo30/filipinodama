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
    const val PLAY = "play"
    const val GUILD = "guild"
    const val PROFILE = "profile"
}
