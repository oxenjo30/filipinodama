package com.filipinodama.app.data.system

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged

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

    private fun hasValidatedNetwork(cm: ConnectivityManager): Boolean {
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }
}
