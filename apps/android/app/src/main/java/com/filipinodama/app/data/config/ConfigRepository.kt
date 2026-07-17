package com.filipinodama.app.data.config

import com.filipinodama.app.data.ApiClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Maintenance-mode gate — mirrors apps/web AppLayout.tsx's maintenance-banner
 * fetch (GET /api/config/public, keys MAINTENANCE_BANNER/MAINTENANCE_TEXT),
 * but drives a BLOCKING full-screen takeover on Android instead of a
 * dismissible banner, per SYSTEM_STATES.md's "Maintenance mode" full takeover
 * spec (mobile-screen-inventory.md SCREEN 1 — "The kingdom is being
 * fortified" / "Check again").
 *
 * The state machine is a pure function ([deriveMaintenanceState]) so it's
 * unit-testable without a network call: a "true" flag -> Active with the
 * server's (or a fallback) message; anything else — "false", absent, or a
 * failed/unreachable fetch — resolves to Unknown/Clear, which NEVER blocks
 * the app. This matches the web client's "purely additive, never blocks on a
 * failed fetch" comment for the exact same endpoint.
 */
object ConfigRepository {

    private val configApi: ConfigApi by lazy { ApiClient.create<ConfigApi>() }

    private val _maintenance = MutableStateFlow<MaintenanceState>(MaintenanceState.Unknown)
    val maintenance: StateFlow<MaintenanceState> = _maintenance.asStateFlow()

    /** True once DIAMOND_TOPUP_ENABLED read from the same payload — reserved
     * for the (currently hidden, gold-only) top-up UI; unused by this phase's
     * screens directly but exposed since it rides the same fetch as a public
     * config mirror (see server admin-config.ts kdoc). */
    private val _diamondTopUpEnabled = MutableStateFlow(false)
    val diamondTopUpEnabled: StateFlow<Boolean> = _diamondTopUpEnabled.asStateFlow()

    /** Watch Live PAGE gate (owner directive 2026-07-12) — WATCH_LIVE_ENABLED
     * from the same payload. SAFE-OFF: starts false and only an explicit
     * "true" shows the Live Match Browser entry/route ([deriveWatchLiveEnabled]);
     * a missing key or failed fetch keeps it hidden. Room/match spectate flows
     * (PrivateRoomScreen spectate deep links, MatchRepository.spectate) are NOT
     * gated by this — only the browsing page is. */
    private val _watchLiveEnabled = MutableStateFlow(false)
    val watchLiveEnabled: StateFlow<Boolean> = _watchLiveEnabled.asStateFlow()

    // "update available" nudge — true when the server's ANDROID_LATEST_VERSION
    // versionCode is strictly greater than this build's BuildConfig.VERSION_CODE.
    private val _updateAvailable = MutableStateFlow(false)
    val updateAvailable: StateFlow<Boolean> = _updateAvailable.asStateFlow()

    // Whether the user dismissed the update nudge THIS PROCESS. Held here (on the
    // process-level object), not in composable `remember`, so the "once per
    // process" cadence survives Activity recreation (rotation, system dark-mode
    // toggle, font-size/locale change) — a plain `remember` would reset on those
    // and re-nag. Resets only on a cold start (new process = new object).
    private val _updateNudgeDismissed = MutableStateFlow(false)
    val updateNudgeDismissed: StateFlow<Boolean> = _updateNudgeDismissed.asStateFlow()
    fun dismissUpdateNudge() { _updateNudgeDismissed.value = true }

    /**
     * Fetches /api/config/public and updates [maintenance]. Safe to call
     * repeatedly (app start, foreground, "Check again" retry, periodic
     * re-poll) — a network failure leaves the state at whatever it was
     * before (does NOT flip to Clear on a transient error, so a maintenance
     * takeover doesn't flicker open on a flaky connection) except on the very
     * first call, where Unknown behaves like Clear (never blocks before the
     * first successful read).
     */
    suspend fun refresh() {
        val result = runCatching { configApi.publicConfig() }
        val cfg = result.getOrNull()?.takeIf { it.ok }?.data ?: run {
            // Fetch failed or errored — leave prior state as-is (see kdoc).
            return
        }
        _diamondTopUpEnabled.value = cfg["DIAMOND_TOPUP_ENABLED"] == "true"
        _watchLiveEnabled.value = deriveWatchLiveEnabled(cfg["WATCH_LIVE_ENABLED"])
        _maintenance.value = deriveMaintenanceState(cfg["MAINTENANCE_BANNER"], cfg["MAINTENANCE_TEXT"])
        _updateAvailable.value = deriveUpdateAvailable(
            cfg["ANDROID_LATEST_VERSION"],
            com.filipinodama.app.BuildConfig.VERSION_CODE
        )
    }
}

sealed class MaintenanceState {
    /** No successful read yet — treated as non-blocking (same as Clear) by the UI. */
    data object Unknown : MaintenanceState()
    data object Clear : MaintenanceState()
    data class Active(val message: String) : MaintenanceState()
}

/** Default copy when MAINTENANCE_TEXT is absent/blank, matching the mobile
 * prototype's SCREEN 1 body copy verbatim (mobile-screen-inventory.md). */
const val DEFAULT_MAINTENANCE_MESSAGE =
    "FilipinoDama is briefly offline for a quick upgrade. Your progress, coins, and rank are safe."

/**
 * Pure derivation, unit-testable without Retrofit/coroutines:
 *   MAINTENANCE_BANNER == "true" -> Active(text or fallback)
 *   anything else (missing, "false", garbage) -> Clear
 */
fun deriveMaintenanceState(banner: String?, text: String?): MaintenanceState {
    if (banner != "true") return MaintenanceState.Clear
    val trimmed = text?.trim()
    return MaintenanceState.Active(if (trimmed.isNullOrEmpty()) DEFAULT_MAINTENANCE_MESSAGE else trimmed)
}

/**
 * Pure derivation for the Watch Live PAGE gate (owner directive 2026-07-12),
 * mirroring [deriveMaintenanceState]'s testable-without-network shape but with
 * the OPPOSITE fail-direction: this flag hides a page, so the safe default is
 * OFF. Only the literal "true" shows the Live Match Browser; a missing row,
 * "false", or any garbage value keeps it hidden. (Maintenance fails OPEN so a
 * broken fetch never locks users out; this fails CLOSED so a broken fetch
 * never un-hides a page the owner turned off.)
 */
fun deriveWatchLiveEnabled(value: String?): Boolean = value == "true"

/**
 * True only when the server advertises a strictly-newer Play versionCode than
 * this build. Fail-safe: null / blank / non-numeric / "0" / older / equal ⇒
 * false (never a false "please update"). Integer comparison because versionCode
 * is monotonic — avoids semver "1.10 < 1.9" traps.
 */
fun deriveUpdateAvailable(latest: String?, current: Int): Boolean {
    val latestCode = latest?.trim()?.toIntOrNull() ?: return false
    return latestCode > current
}
