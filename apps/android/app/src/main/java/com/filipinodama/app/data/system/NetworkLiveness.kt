package com.filipinodama.app.data.system

import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * "We just reached our server" — app-level proof of connectivity.
 *
 * WHY THIS EXISTS
 *
 * [ConnectivityObserver] reports online only when Android sets
 * NET_CAPABILITY_VALIDATED, which is correct for DECIDING WE ARE OFFLINE (it
 * is what catches a captive portal) but is a poor signal for deciding we are
 * back ONLINE: validation is a captive-portal probe the OS runs on its own
 * schedule, and on a reconnect — airplane mode off, a cell handover, walking
 * back into Wi-Fi — it lags the actual recovery by seconds, sometimes much
 * longer on a weak signal.
 *
 * The visible symptom was the "You're offline — reconnecting…" strip sitting
 * there long after play had already resumed. Note this is the MIRROR IMAGE of
 * the bug fixed in versionCode 48: that one was a false OFFLINE on open, caused
 * by the same validation lag, and was fixed by delaying the offline edge
 * (ConnectivityObserver.debounceOffline). A debounce cannot fix this direction,
 * because here the delay is in the OS's signal, not in ours.
 *
 * So we supply a better signal. A response from our own API, or a Socket.IO
 * CONNECT, is STRONGER evidence of connectivity than the OS probe: it is our
 * actual server answering. And because everything goes to https://…
 * filipinodama.com, a captive portal cannot forge it — it cannot terminate our
 * TLS — so accepting this as proof does not reopen the captive-portal hole that
 * NET_CAPABILITY_VALIDATED exists to close.
 *
 * Emissions are conflated and never block: this is a hint that clears a banner,
 * not a queue, so a dropped duplicate costs nothing.
 */
object NetworkLiveness {

    private val _proof = MutableSharedFlow<Unit>(
        replay = 0,
        extraBufferCapacity = 1,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )

    /** Emits every time the app demonstrably reached the server. */
    val proof: SharedFlow<Unit> = _proof.asSharedFlow()

    /**
     * Call when the app has demonstrably reached the server — an HTTP response
     * actually came back over the network, or the realtime socket connected.
     *
     * Deliberately NOT called for a request that merely started, nor for one
     * served from cache: only a completed round trip proves connectivity.
     */
    fun reachedServer() {
        _proof.tryEmit(Unit)
    }
}
