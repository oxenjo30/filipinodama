package com.filipinodama.app.ui.components

import android.app.Activity
import android.view.WindowManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalContext
import java.lang.ref.WeakReference

/**
 * Reference count for the window-level FLAG_SECURE bit.
 *
 * FLAG_SECURE is ONE bit on ONE window, but [SecureScreen] is per-SCREEN, and
 * two secure screens OVERLAP. navigation-compose 2.8.4 defaults enter/exit to
 * fadeIn/fadeOut(tween(700)) and only disposes the OUTGOING destination when
 * that transition ENDS, so on Login -> Create Account the incoming screen adds
 * the flag first (a no-op, it is already set) and the outgoing screen clears it
 * ~700 ms later -- leaving the player typing a NEW password on a window that is
 * screenshot-able, screen-recordable, and visible in the Recents thumbnail.
 * Counting the live callers and clearing only when the LAST one leaves is
 * correct in BOTH interleavings (enter-then-dispose and dispose-then-enter).
 *
 * THREADING: composition, DisposableEffect bodies and onDispose all run on the
 * MAIN THREAD -- Compose's Android applier dispatches on AndroidUiDispatcher.Main,
 * and a composition is disposed on the UI thread when its ComposeView detaches --
 * so plain non-atomic state is correct here and no synchronization is needed.
 * Do not call these from a background thread.
 *
 * RECREATION: the count is keyed to the window that owns it. MainActivity
 * declares no android:configChanges, so a rotation / fold / split-screen /
 * font-size change DESTROYS AND RECREATES the Activity with a brand new Window
 * whose FLAG_SECURE starts clear. Keying on window identity means a count from
 * the old window can never be carried into the new one, and a late dispose from
 * the dead window can never clear the flag on the live one. Process death takes
 * this object with it, so there is no persisted state that could go stale. The
 * reference is weak and is dropped at zero, so a destroyed Activity is never
 * retained.
 *
 * The window is typed [Any] rather than android.view.Window purely so this logic
 * can be exercised by a plain JVM unit test (see SecureWindowFlagTest); the
 * module has no androidTest source set.
 */
internal object SecureWindowFlag {
    private var owner: WeakReference<Any>? = null
    private var count = 0

    /**
     * Registers one more live secure screen on [window] and runs [set]. [set] is
     * idempotent (addFlags on an already-secure window does nothing), so the flag
     * is re-armed on every entry regardless of the current count.
     */
    fun acquire(window: Any, set: () -> Unit) {
        if (owner?.get() !== window) {
            // First caller, or a recreated Activity: a fresh Window starts with
            // FLAG_SECURE clear, so its count starts at zero too.
            owner = WeakReference(window)
            count = 0
        }
        count++
        set()
    }

    /**
     * Releases one live secure screen and runs [clear] ONLY if it was the LAST
     * one on [window]. A release for a window we are no longer counting -- a
     * destroyed Activity's composition disposing after the recreated one already
     * armed itself -- is ignored on purpose.
     */
    fun release(window: Any, clear: () -> Unit) {
        if (owner?.get() !== window) return
        count--
        if (count <= 0) {
            // Floor it: a decrement that never arrives must not be able to wedge
            // FLAG_SECURE on for the rest of the process (game/social screens are
            // deliberately screenshot-able -- players share boards).
            count = 0
            owner = null
            clear()
        }
    }
}

/**
 * Marks the current window FLAG_SECURE while this composable is in the
 * composition, and clears it when the LAST such composable leaves (security
 * review M-2). FLAG_SECURE blocks
 * screenshots, screen recording, and the app-switcher (Recents) thumbnail from
 * capturing the screen — used on surfaces where a captured frame could leak a
 * credential or sensitive data:
 *   - auth screens (a just-autofilled / typed email + password, esp. when the
 *     "show password" eye is toggled)
 *   - wallet / checkout (balances, purchase details)
 *
 * Scoped, not app-wide: game/social screens stay screenshot-able (players share
 * boards). REF-COUNTED via [SecureWindowFlag] because the flag is WINDOW-scoped
 * while this composable is SCREEN-scoped: an auth-to-auth navigation keeps both
 * screens composed for the 700 ms fade, and an unconditional clear on the
 * outgoing one stripped the protection off the screen the player is typing the
 * next password into. Cleared only when the last secure screen leaves, so it
 * still never leaks
 * to the next screen. No-op if the context isn't an Activity (e.g. a preview),
 * which must not touch the count either.
 */
@Composable
fun SecureScreen() {
    val context = LocalContext.current
    DisposableEffect(context) {
        val window = (context as? Activity)?.window
            ?: return@DisposableEffect onDispose { }
        SecureWindowFlag.acquire(window) {
            window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
        onDispose {
            SecureWindowFlag.release(window) {
                window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
            }
        }
    }
}
