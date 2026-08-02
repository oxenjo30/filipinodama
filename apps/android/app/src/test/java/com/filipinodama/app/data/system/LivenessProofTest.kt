package com.filipinodama.app.data.system

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Timing tests for [withLivenessProof] — the fix for "the offline banner takes
 * ages to clear after the connection comes back" (owner report, 2026-08-02).
 *
 * ROOT CAUSE, restated: [ConnectivityObserver.observe] only reports online once
 * Android sets NET_CAPABILITY_VALIDATED. That is the right authority for going
 * OFFLINE — it is what catches a captive portal — but on a RECONNECT the OS runs
 * its validation probe on its own schedule and lags the real recovery by
 * seconds, sometimes far longer on a weak signal. The banner sat there for that
 * whole gap even though play had already resumed.
 *
 * This is the MIRROR IMAGE of the versionCode 48 bug (a false OFFLINE on app
 * open, same validation lag), and crucially it is NOT fixable by a debounce:
 * v48 fixed its direction by DELAYING the offline edge, but here the delay is in
 * the OS's signal, not in ours. The only fix is a better signal —
 * [NetworkLiveness.proof], emitted when our own server actually answers.
 *
 * Virtual time via runTest, matching DebounceOfflineTest.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class LivenessProofTest {

    private val grace = 2500L

    @Test
    fun `proof of life clears the banner without waiting for the OS to validate`() = runTest {
        // The reported bug: connectivity goes offline and STAYS offline as far as
        // NET_CAPABILITY_VALIDATED is concerned (the probe hasn't finished), but
        // the app is demonstrably talking to the server again.
        val connectivity = flow {
            emit(true)
            emit(false)
            delay(60_000) // OS never re-validates within the window under test
        }
        val proof = flow {
            delay(3000) // after the grace, so the banner really did appear
            emit(Unit)
        }

        val out = connectivity.withLivenessProof(proof, grace).toList()

        // offline surfaced (real outage), then cleared on proof — NOT on the OS.
        assertEquals(listOf(true, false, true), out)
    }

    @Test
    fun `proof arriving during the grace prevents the banner from ever showing`() = runTest {
        // A blip the app rides out — e.g. a cell handover where a request
        // succeeds again before the grace expires. The user should see nothing.
        val connectivity = flow {
            emit(true)
            emit(false)
            delay(60_000)
        }
        val proof = flow {
            delay(1000) // inside the 2.5s grace
            emit(Unit)
        }

        val out = connectivity.withLivenessProof(proof, grace).toList()

        assertEquals(listOf(true), out)
    }

    @Test
    fun `a real sustained outage with no proof still surfaces the banner`() = runTest {
        // The guarantee we must not regress: proof-of-life must not make the
        // banner impossible to show.
        val connectivity = flow {
            emit(true)
            emit(false)
            delay(60_000)
        }

        val out = connectivity.withLivenessProof(emptyFlow(), grace).toList()

        assertEquals(listOf(true, false), out)
    }

    @Test
    fun `proof does not re-emit online while already online`() = runTest {
        // Chatty traffic on a healthy connection must not produce a stream of
        // redundant `true`s into the banner state.
        val connectivity = flow {
            emit(true)
            delay(60_000)
        }
        val proof = flow {
            repeat(5) {
                delay(500)
                emit(Unit)
            }
        }

        val out = connectivity.withLivenessProof(proof, grace).toList()

        assertEquals(listOf(true), out)
    }

    @Test
    fun `the banner can return if connectivity drops again after a proof cleared it`() = runTest {
        // Clearing on proof must not latch us permanently online.
        val connectivity = flow {
            emit(true)
            emit(false)
            delay(4000) // banner shows
            emit(true) // OS finally agrees
            delay(1000)
            emit(false) // genuine second outage
            delay(60_000)
        }
        val proof = flow {
            delay(3000)
            emit(Unit) // clears the first banner early
        }

        val out = connectivity.withLivenessProof(proof, grace).toList()

        assertEquals(listOf(true, false, true, false), out)
    }
}
