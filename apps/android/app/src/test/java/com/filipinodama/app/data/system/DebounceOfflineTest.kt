package com.filipinodama.app.data.system

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Timing tests for [debounceOffline] — the asymmetric offline debounce behind
 * the "You're offline — reconnecting…" banner. Uses runTest's virtual clock so
 * the ~2.5s grace resolves instantly (no real waiting), and only
 * kotlinx-coroutines-test (already a test dep — no new library), matching
 * this project's runTest convention (see GameRepositoryTest).
 *
 * Verifies the two rules that fix the on-open banner flash:
 *   1. a brief offline blip (Android's validation lag on open) never surfaces;
 *   2. a real, sustained outage still surfaces, and online clears immediately.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class DebounceOfflineTest {

    private val grace = 2500L

    @Test
    fun `a brief offline blip shorter than the grace never emits offline`() = runTest {
        // online -> offline for 1s -> online again, all within the 2.5s grace.
        val out = flow {
            emit(true)
            emit(false)
            delay(1000)
            emit(true)
        }.debounceOffline(grace).toList()

        // The blip is swallowed: we only ever saw online (distinctUntilChanged
        // collapses the trailing online back to the single true).
        assertEquals(listOf(true), out)
    }

    @Test
    fun `a sustained offline past the grace emits offline`() = runTest {
        val out = flow {
            emit(true)
            emit(false)
            delay(4000) // stay offline well past the 2.5s grace
        }.debounceOffline(grace).toList()

        assertEquals(listOf(true, false), out)
    }

    @Test
    fun `online after a real outage clears (offline then online both surface)`() = runTest {
        val out = flow {
            emit(true)
            emit(false)
            delay(4000) // real outage -> false surfaces
            emit(true)  // reconnect -> true surfaces immediately
            delay(100)
        }.debounceOffline(grace).toList()

        assertEquals(listOf(true, false, true), out)
    }

    @Test
    fun `staying online passes through`() = runTest {
        val out = flowOf(true).debounceOffline(grace).toList()
        assertEquals(listOf(true), out)
    }

    @Test
    fun `offline exactly at the grace boundary still surfaces`() = runTest {
        val out = flow {
            emit(false)
            delay(grace + 1)
        }.debounceOffline(grace).toList()

        assertEquals(listOf(false), out)
    }
}
