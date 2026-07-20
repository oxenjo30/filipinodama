package com.filipinodama.app.ui.components

import android.app.Activity
import android.view.WindowManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalContext

/**
 * Marks the current window FLAG_SECURE while this composable is in the
 * composition, and clears it on leave (security review M-2). FLAG_SECURE blocks
 * screenshots, screen recording, and the app-switcher (Recents) thumbnail from
 * capturing the screen — used on surfaces where a captured frame could leak a
 * credential or sensitive data:
 *   - auth screens (a just-autofilled / typed email + password, esp. when the
 *     "show password" eye is toggled)
 *   - wallet / checkout (balances, purchase details)
 *
 * Scoped, not app-wide: game/social screens stay screenshot-able (players share
 * boards). The flag is added on enter and REMOVED on dispose so it never leaks
 * to the next screen. No-op if the context isn't an Activity (e.g. a preview).
 */
@Composable
fun SecureScreen() {
    val context = LocalContext.current
    DisposableEffect(Unit) {
        val window = (context as? Activity)?.window
        window?.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        onDispose {
            window?.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
    }
}
