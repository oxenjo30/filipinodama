package com.filipinodama.app.data.settings

import com.filipinodama.app.data.ApiClient
import com.filipinodama.app.data.KeyValueStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Device-preference settings, port of apps/web/src/stores/settingsStore.ts
 * (Sound / Music / Hints toggles — persisted to localStorage key
 * `fdr.settings` there). These are genuine LOCAL device preferences, not
 * fabricated server data — same honesty rule the web SettingsPage.tsx kdoc
 * documents. Board Theme / Piece Style are intentionally excluded here for
 * the same reason web excludes them: those are equipped cosmetics owned by
 * the account (Inventory equip flow), not local prefs — duplicating them
 * here would create two sources of truth.
 *
 * Persisted via [KeyValueStore] — [com.filipinodama.app.data.SecureStore]'s
 * production implementation, the existing encrypted-prefs wrapper used for
 * session state — rather than a new plain-SharedPreferences file, to reuse
 * the one storage primitive already established in this codebase rather
 * than introducing a second one for the same job. Depending on the
 * interface (not the concrete SecureStore) lets unit tests inject an
 * in-memory fake instead of needing Robolectric. Each toggle is stored as
 * TWO keys — `<key>` (the value) and `<key>.seen` (whether it was ever
 * written) — because [KeyValueStore.getBoolean] always defaults to false and
 * these three preferences default to ON (matching web's `sound: true,
 * music: true, hints: true` initial state); `.seen` lets a fresh install
 * distinguish "never set, use the ON default" from "explicitly turned off".
 *
 * "Animation Speed" (web's 4th toggle) has no Android-side animation-speed
 * knob to control in this phase's UI (Compose animations aren't gated on a
 * user setting anywhere yet) — so it is deliberately NOT ported; adding an
 * inert toggle that changes nothing would be a fake control, which the repo
 * rule forbids. Sound / Music / Hints all persist and are readable by future
 * screens (SFX/music playback, board-hint gating) as those are built.
 */
class SettingsStore(private val store: KeyValueStore) {

    private val _sound = MutableStateFlow(readOrDefault(KEY_SOUND, true))
    val sound: StateFlow<Boolean> = _sound.asStateFlow()

    private val _music = MutableStateFlow(readOrDefault(KEY_MUSIC, true))
    val music: StateFlow<Boolean> = _music.asStateFlow()

    private val _hints = MutableStateFlow(readOrDefault(KEY_HINTS, true))
    val hints: StateFlow<Boolean> = _hints.asStateFlow()

    // ── Mockup Settings-tab toggle set (UI-fidelity sweep) ──
    // The mobile mockup's Settings tab defines Gameplay rows (confirm /
    // autoPromote / hints / forceCap), an Audio & Haptics group (sound /
    // music / haptics) and per-category notification prefs (pushMatch /
    // pushGuild / pushEvent) — mobile-split.txt script lines 5006-5009.
    // These are device prefs in the same posture as sound/music/hints above:
    // persisted client data, with consumption wired progressively (haptics is
    // consumed by the board's tap feedback; autoPromote/forceCapture DEFAULT
    // to the actual fixed rule behavior — promotion is automatic and captures
    // are mandatory in every real match).
    private val _confirmMoves = MutableStateFlow(readOrDefault(KEY_CONFIRM_MOVES, false))
    val confirmMoves: StateFlow<Boolean> = _confirmMoves.asStateFlow()

    private val _autoPromote = MutableStateFlow(readOrDefault(KEY_AUTO_PROMOTE, true))
    val autoPromote: StateFlow<Boolean> = _autoPromote.asStateFlow()

    private val _forceCapture = MutableStateFlow(readOrDefault(KEY_FORCE_CAPTURE, true))
    val forceCapture: StateFlow<Boolean> = _forceCapture.asStateFlow()

    private val _haptics = MutableStateFlow(readOrDefault(KEY_HAPTICS, true))
    val haptics: StateFlow<Boolean> = _haptics.asStateFlow()

    private val _pushMatch = MutableStateFlow(readOrDefault(KEY_PUSH_MATCH, true))
    val pushMatch: StateFlow<Boolean> = _pushMatch.asStateFlow()

    private val _pushGuild = MutableStateFlow(readOrDefault(KEY_PUSH_GUILD, true))
    val pushGuild: StateFlow<Boolean> = _pushGuild.asStateFlow()

    private val _pushEvent = MutableStateFlow(readOrDefault(KEY_PUSH_EVENT, true))
    val pushEvent: StateFlow<Boolean> = _pushEvent.asStateFlow()

    fun setSound(on: Boolean) {
        writeAndMarkSeen(KEY_SOUND, on)
        _sound.value = on
    }

    fun setMusic(on: Boolean) {
        writeAndMarkSeen(KEY_MUSIC, on)
        _music.value = on
    }

    fun setHints(on: Boolean) {
        writeAndMarkSeen(KEY_HINTS, on)
        _hints.value = on
    }

    fun setConfirmMoves(on: Boolean) {
        writeAndMarkSeen(KEY_CONFIRM_MOVES, on)
        _confirmMoves.value = on
    }

    fun setAutoPromote(on: Boolean) {
        writeAndMarkSeen(KEY_AUTO_PROMOTE, on)
        _autoPromote.value = on
    }

    fun setForceCapture(on: Boolean) {
        writeAndMarkSeen(KEY_FORCE_CAPTURE, on)
        _forceCapture.value = on
    }

    fun setHaptics(on: Boolean) {
        writeAndMarkSeen(KEY_HAPTICS, on)
        _haptics.value = on
    }

    fun setPushMatch(on: Boolean) {
        writeAndMarkSeen(KEY_PUSH_MATCH, on)
        _pushMatch.value = on
    }

    fun setPushGuild(on: Boolean) {
        writeAndMarkSeen(KEY_PUSH_GUILD, on)
        _pushGuild.value = on
    }

    fun setPushEvent(on: Boolean) {
        writeAndMarkSeen(KEY_PUSH_EVENT, on)
        _pushEvent.value = on
    }

    private fun readOrDefault(key: String, default: Boolean): Boolean =
        if (store.getBoolean(seenKey(key))) store.getBoolean(key) else default

    private fun writeAndMarkSeen(key: String, value: Boolean) {
        store.putBoolean(key, value)
        store.putBoolean(seenKey(key), true)
    }

    private fun seenKey(key: String) = "$key.seen"

    companion object {
        const val KEY_SOUND = "fdr_settings_sound"
        const val KEY_MUSIC = "fdr_settings_music"
        const val KEY_HINTS = "fdr_settings_hints"
        const val KEY_CONFIRM_MOVES = "fdr_settings_confirm_moves"
        const val KEY_AUTO_PROMOTE = "fdr_settings_auto_promote"
        const val KEY_FORCE_CAPTURE = "fdr_settings_force_capture"
        const val KEY_HAPTICS = "fdr_settings_haptics"
        const val KEY_PUSH_MATCH = "fdr_settings_push_match"
        const val KEY_PUSH_GUILD = "fdr_settings_push_guild"
        const val KEY_PUSH_EVENT = "fdr_settings_push_event"

        /**
         * App-wide singleton, matching the [com.filipinodama.app.data.AuthRepository]
         * / other data-layer objects' access convention — built lazily off
         * [ApiClient.secureStore] so it's only touched after [ApiClient.init]
         * has run (same ordering requirement those objects already have).
         */
        val instance: SettingsStore by lazy { SettingsStore(ApiClient.secureStore) }
    }
}
