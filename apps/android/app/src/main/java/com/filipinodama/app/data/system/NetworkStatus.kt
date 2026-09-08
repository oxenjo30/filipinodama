package com.filipinodama.app.data.system

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * The app's one shared answer to "is this device actually online right now?".
 *
 * [ConnectivityObserver.observeOnline] already computes this for the offline
 * banner, but it was collected into a local composable state inside AppNavHost,
 * so nothing outside the UI could see it. Non-UI code that needed to know —
 * notably matchmaking, when deciding how to explain a failure — had to guess,
 * and guessed wrong: it told players with a working connection to go and check
 * their connection.
 *
 * Deliberately a plain mirror, not a second source of truth: AppNavHost's
 * collector publishes here, and everything else reads. Defaults to `true` so a
 * caller that runs before the first observation never reports a fake outage.
 */
object NetworkStatus {
    private val _online = MutableStateFlow(true)

    /** True when the device has a validated network, per ConnectivityObserver. */
    val online: StateFlow<Boolean> = _online.asStateFlow()

    /** Publish the latest observation. Called only by the connectivity collector. */
    fun set(online: Boolean) {
        _online.value = online
    }

    /** Snapshot for non-suspending callers composing an error message. */
    fun isOnline(): Boolean = _online.value
}
