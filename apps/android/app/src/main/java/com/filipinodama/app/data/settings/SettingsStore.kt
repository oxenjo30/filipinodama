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

        /**
         * App-wide singleton, matching the [com.filipinodama.app.data.AuthRepository]
         * / other data-layer objects' access convention — built lazily off
         * [ApiClient.secureStore] so it's only touched after [ApiClient.init]
         * has run (same ordering requirement those objects already have).
         */
        val instance: SettingsStore by lazy { SettingsStore(ApiClient.secureStore) }
    }
}
