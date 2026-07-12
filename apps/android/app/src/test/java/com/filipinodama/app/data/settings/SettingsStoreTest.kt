package com.filipinodama.app.data.settings

import com.filipinodama.app.data.KeyValueStore
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * In-memory fake for [KeyValueStore] (the interface [SettingsStore] depends
 * on instead of the concrete, Android-Context-bound
 * [com.filipinodama.app.data.SecureStore]) — the same "extract an injectable
 * seam for a plain JVM test" convention this project's other data-layer
 * tests already follow (see AuthRepositoryLogicTest kdoc; no Robolectric
 * dependency exists here).
 */
private class FakeKeyValueStore : KeyValueStore {
    private val strings = mutableMapOf<String, String>()
    private val booleans = mutableMapOf<String, Boolean>()

    override fun getString(key: String): String? = strings[key]
    override fun putString(key: String, value: String) { strings[key] = value }
    override fun remove(key: String) { strings.remove(key); booleans.remove(key) }
    override fun clear() { strings.clear(); booleans.clear() }
    override fun getBoolean(key: String): Boolean = booleans[key] ?: false
    override fun putBoolean(key: String, value: Boolean) { booleans[key] = value }
}

/**
 * Settings persistence round-trip tests — port of apps/web
 * settingsStore.ts's Sound/Music/Hints toggles (defaults ON, persisted
 * locally). Verifies: fresh-install defaults, write-then-read-back through a
 * NEW SettingsStore instance (simulating process death / app restart reading
 * the same backing store), and that toggles are independent of each other.
 */
class SettingsStoreTest {

    @Test
    fun `fresh install defaults sound, music, and hints to ON — matches web's initial state`() {
        val store = SettingsStore(FakeKeyValueStore())
        assertTrue(store.sound.value)
        assertTrue(store.music.value)
        assertTrue(store.hints.value)
    }

    @Test
    fun `turning a toggle off persists and survives a new SettingsStore instance over the same backing store`() {
        val backing = FakeKeyValueStore()
        val first = SettingsStore(backing)
        first.setSound(false)

        val second = SettingsStore(backing)
        assertFalse("sound=false must round-trip through the backing store", second.sound.value)
        // Untouched prefs still default ON in the fresh instance.
        assertTrue(second.music.value)
        assertTrue(second.hints.value)
    }

    @Test
    fun `each toggle persists independently of the others`() {
        val backing = FakeKeyValueStore()
        val store = SettingsStore(backing)

        store.setMusic(false)

        val reloaded = SettingsStore(backing)
        assertTrue(reloaded.sound.value)
        assertFalse(reloaded.music.value)
        assertTrue(reloaded.hints.value)
    }

    @Test
    fun `a toggle can be turned back on and that also round-trips`() {
        val backing = FakeKeyValueStore()
        val store = SettingsStore(backing)
        store.setHints(false)
        store.setHints(true)

        val reloaded = SettingsStore(backing)
        assertTrue(reloaded.hints.value)
    }
}
