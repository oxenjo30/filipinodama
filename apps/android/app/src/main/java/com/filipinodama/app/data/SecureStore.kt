package com.filipinodama.app.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Minimal key-value contract [SecureStore] satisfies, extracted so data-layer
 * classes that only need simple get/put persistence (e.g.
 * [com.filipinodama.app.data.settings.SettingsStore]) can depend on THIS
 * instead of the concrete, Android-Context-bound [SecureStore] — which lets
 * plain JVM unit tests inject an in-memory fake instead of requiring
 * Robolectric (this project has no Robolectric dependency; see the Phase 2
 * AuthRepositoryLogicTest kdoc for the established "extract pure/injectable
 * logic instead" convention).
 */
interface KeyValueStore {
    fun getString(key: String): String?
    fun putString(key: String, value: String)
    fun remove(key: String)
    fun clear()
    fun getBoolean(key: String): Boolean
    fun putBoolean(key: String, value: Boolean)
}

/**
 * Thin wrapper around EncryptedSharedPreferences for session-related
 * strings: e.g. a serialized cookie blob (see PersistentCookieJar) and
 * simple session metadata like an "isGuest" flag or last-known user id.
 *
 * The httpOnly `fd_access` / `fd_refresh` cookies themselves are primarily
 * managed by OkHttp's CookieJar (app code never reads their raw values,
 * matching how JS can't touch them either) — this store just persists
 * whatever the app needs across process death.
 */
class SecureStore(context: Context) : KeyValueStore {

    private val prefs: SharedPreferences = run {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        EncryptedSharedPreferences.create(
            context,
            PREFS_FILE_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    override fun getString(key: String): String? = prefs.getString(key, null)

    override fun putString(key: String, value: String) {
        prefs.edit().putString(key, value).apply()
    }

    override fun remove(key: String) {
        prefs.edit().remove(key).apply()
    }

    override fun clear() {
        prefs.edit().clear().apply()
    }

    override fun getBoolean(key: String): Boolean = prefs.getBoolean(key, false)

    override fun putBoolean(key: String, value: Boolean) {
        prefs.edit().putBoolean(key, value).apply()
    }

    companion object {
        private const val PREFS_FILE_NAME = "fd_secure_prefs"

        // Well-known keys used elsewhere in the data layer.
        const val KEY_COOKIE_JAR_BLOB = "cookie_jar_blob"
        const val KEY_IS_GUEST = "is_guest"
        const val KEY_LAST_USER_ID = "last_user_id"

        // Phase 2: onboarding-carousel completion flag, the Android equivalent
        // of the web client's localStorage `fdr.onboarded` marker (see
        // apps/web/src/features/onboarding/OnboardingFlow.tsx). Persisted so a
        // returning user is never re-shown the tour after a process restart.
        const val KEY_ONBOARDED = "fdm_onboarded"
    }
}
