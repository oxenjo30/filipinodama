package com.filipinodama.app.ui.components

import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * App-wide transient feedback. Screens surface a failed action's message with
 * `LocalSnackbar.current.show("…")` instead of hand-rolling a per-screen toast
 * `mutableStateOf` + bottom `Box`. A single [androidx.compose.material3.SnackbarHost]
 * is hosted once at the root (AppNavHost's Scaffold); this controller is provided
 * to the whole NavHost via [LocalSnackbar].
 *
 * `show` is fire-and-forget from any composable/click handler — it launches on the
 * root composition scope. A new message dismisses the current one rather than
 * queueing behind it, so the latest error is what the user sees (matching the
 * "replace stale toast" behavior the old per-screen pattern had via a 3s auto-clear).
 */
class SnackbarController(
    val hostState: SnackbarHostState,
    private val scope: CoroutineScope,
) {
    fun show(message: String) {
        if (message.isBlank()) return
        scope.launch {
            // Drop the currently-visible snackbar so a fresh error replaces it
            // immediately instead of waiting out the previous one's duration.
            hostState.currentSnackbarData?.dismiss()
            hostState.showSnackbar(message)
        }
    }
}

/**
 * Default is a no-op controller so composables read outside the provider (Compose
 * previews, unit tests, isolated screen harnesses) don't crash on a missing local.
 * A [staticCompositionLocalOf] (not `compositionLocalOf`) because the controller
 * identity is stable for the app's lifetime — reads don't need change-tracking.
 */
val LocalSnackbar = staticCompositionLocalOf {
    SnackbarController(SnackbarHostState(), NoopScope)
}

/** Builds a controller bound to a remembered host state + the given root scope. */
@Composable
fun rememberSnackbarController(scope: CoroutineScope): SnackbarController {
    val hostState = remember { SnackbarHostState() }
    return remember(hostState, scope) { SnackbarController(hostState, scope) }
}

/**
 * A never-launching scope for the no-op default controller. `show` on the default
 * simply drops the message (the default is only ever read outside a real UI).
 */
private object NoopScope : CoroutineScope {
    override val coroutineContext get() = kotlinx.coroutines.Dispatchers.Main.immediate
}
