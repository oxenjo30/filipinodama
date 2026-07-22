package com.filipinodama.app.data.system

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.transformLatest

/**
 * Wraps [ConnectivityManager] as a cold [Flow] of "is there a validated
 * internet-capable network right now" — the Android equivalent of the web
 * client's `window` `online`/`offline` events (SYSTEM_STATES.md `isOffline`).
 *
 * NET_CAPABILITY_VALIDATED (not just NET_CAPABILITY_INTERNET) is required so
 * a Wi-Fi connection with no actual internet (e.g. a captive portal) is
 * correctly reported offline, matching the "reconnecting…" banner intent
 * rather than a false "online" the moment radio link comes up.
 */
object ConnectivityObserver {

    fun observe(context: Context): Flow<Boolean> = callbackFlow {
        val cm = context.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

        // Seed with the current state so the first collector doesn't wait for
        // a network CHANGE event to learn the initial connectivity.
        trySend(hasValidatedNetwork(cm))

        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                trySend(hasValidatedNetwork(cm))
            }

            override fun onLost(network: Network) {
                trySend(hasValidatedNetwork(cm))
            }

            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
                trySend(hasValidatedNetwork(cm))
            }
        }

        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        cm.registerNetworkCallback(request, callback)

        awaitClose { cm.unregisterNetworkCallback(callback) }
    }.distinctUntilChanged()

    /**
     * Default grace period before a transient "offline" is allowed to surface
     * as the "reconnecting…" banner. On a cold open / resume, Android has not
     * yet finished re-running its captive-portal probe, so [observe] briefly
     * reports `false` (INTERNET is up but VALIDATED isn't) even on a perfectly
     * good connection — a false offline. Suppressing the banner for this long
     * hides that flash while still surfacing a genuine, sustained outage.
     */
    const val OFFLINE_GRACE_MS = 2500L

    /**
     * [observe], but ASYMMETRICALLY debounced for banner use:
     *  - going OFFLINE is delayed by [graceMs] — a blip shorter than the grace
     *    (Android's validation lag on open, a 1-2s cell handover) never shows
     *    the banner at all;
     *  - coming back ONLINE is emitted IMMEDIATELY — the good-news direction is
     *    never delayed, so the banner clears the instant connectivity returns.
     *
     * [transformLatest] is the key: each upstream value cancels the previous
     * value's block, so an `online` arriving during an offline grace-delay
     * cancels the pending `emit(false)` before it ever fires — no banner flash.
     * (Plain Flow.debounce can't express this — it would delay BOTH edges.)
     */
    fun observeOnline(context: Context, graceMs: Long = OFFLINE_GRACE_MS): Flow<Boolean> =
        observe(context).debounceOffline(graceMs)

    private fun hasValidatedNetwork(cm: ConnectivityManager): Boolean {
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }
}

/**
 * Asymmetric offline debounce on a stream of "is online" booleans. Extracted
 * from [ConnectivityObserver.observeOnline] as a Context-free operator so its
 * TIMING can be unit-tested with virtual time (runTest), matching this
 * project's "extract the pure decision" convention.
 *
 *  - `false` (offline) is emitted only after staying offline for [graceMs]
 *    continuously — a shorter blip is swallowed;
 *  - `true` (online) is emitted immediately and cancels any pending offline.
 *
 * [transformLatest] gives the cancellation: a new upstream value cancels the
 * previous value's suspending block, so an `online` arriving mid-grace kills
 * the pending `emit(false)` before it fires.
 */
@OptIn(ExperimentalCoroutinesApi::class)
fun Flow<Boolean>.debounceOffline(graceMs: Long): Flow<Boolean> =
    transformLatest { online ->
        if (online) {
            emit(true)
        } else {
            delay(graceMs)
            emit(false)
        }
    }.distinctUntilChanged()
