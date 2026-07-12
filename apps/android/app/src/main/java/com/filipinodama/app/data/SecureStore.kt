package com.filipinodama.app.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

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
class SecureStore(context: Context) {

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

    fun getString(key: String): String? = prefs.getString(key, null)

    fun putString(key: String, value: String) {
        prefs.edit().putString(key, value).apply()
    }

    fun remove(key: String) {
        prefs.edit().remove(key).apply()
    }

    fun clear() {
        prefs.edit().clear().apply()
    }

    companion object {
        private const val PREFS_FILE_NAME = "fd_secure_prefs"

        // Well-known keys used elsewhere in the data layer.
        const val KEY_COOKIE_JAR_BLOB = "cookie_jar_blob"
        const val KEY_IS_GUEST = "is_guest"
        const val KEY_LAST_USER_ID = "last_user_id"
    }
}
