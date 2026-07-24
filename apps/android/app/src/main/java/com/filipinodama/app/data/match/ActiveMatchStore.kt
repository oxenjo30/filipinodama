package com.filipinodama.app.data.match

import com.filipinodama.app.data.economy.ActiveMatchDto
import com.filipinodama.app.data.economy.EconomyRepository
import com.filipinodama.app.data.economy.EconomyResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * App-scoped holder for the caller's in-progress online match, backed by
 * `GET /api/matches/active` (the same source the Home "Continue Playing" card
 * uses). Its purpose is to drive a GLOBAL "Return to match" banner in
 * AppNavHost so re-entry isn't Home-only: if a player taps another tab or
 * backs out of a live ranked/casual match (which keeps running server-side for
 * the disconnect-forfeit window), they can jump straight back from anywhere.
 *
 * The server is authoritative — this only mirrors "do I currently have a live
 * match". A failed fetch clears it (indistinguishable from "no match"), same
 * fail-open behavior as HomeScreen, so a transient network blip just hides the
 * banner until the next refresh rather than showing a stale one.
 */
object ActiveMatchStore {

    private val _active = MutableStateFlow<ActiveMatchDto?>(null)
    val active: StateFlow<ActiveMatchDto?> = _active.asStateFlow()

    /**
     * Re-fetch the current active match. Called on app resume and on nav to a
     * tab route (see AppNavHost). Safe to call when signed out — the endpoint
     * returns no match and we clear.
     */
    suspend fun refresh() {
        when (val result = EconomyRepository.activeMatch()) {
            is EconomyResult.Success -> _active.value = result.data.match
            is EconomyResult.Failure -> _active.value = null
        }
    }

    /** Clear immediately (e.g. right after the user re-enters or a match ends). */
    fun clear() {
        _active.value = null
    }
}
