package com.filipinodama.app.data

import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl

/**
 * Minimal in-memory [CookieJar] for JVM unit tests. Stands in for
 * [PersistentCookieJar] (which needs a real Android [SecureStore] /
 * EncryptedSharedPreferences, unavailable off-device) — [RefreshAuthenticator]
 * only depends on the plain OkHttp [CookieJar] contract, so this is a
 * faithful substitute for exercising its refresh-once-on-401 behavior.
 */
class InMemoryCookieJarForTest : ClearableCookieJar {
    private val store = mutableMapOf<String, List<Cookie>>()

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        store[url.host] = cookies
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> = store[url.host] ?: emptyList()

    override fun clearAll() {
        store.clear()
    }
}
