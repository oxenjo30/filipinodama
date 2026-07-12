package com.filipinodama.app.navigation

/** Route constants for AppNavHost. Kept separate so BottomTabBar can reference
 * them without a circular import against AppNavHost.kt. */
object AppDestinations {
    const val SPLASH = "splash"
    const val HOME = "home"
    const val STORE = "store"
    const val PLAY = "play"
    const val GUILD = "guild"
    const val PROFILE = "profile"
}
