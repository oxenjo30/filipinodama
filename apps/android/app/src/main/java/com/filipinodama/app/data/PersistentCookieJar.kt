package com.filipinodama.app.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl

/**
 * OkHttp CookieJar that persists cookies into SecureStore so the httpOnly
 * `fd_access` (~15min JWT) and `fd_refresh` (rotation) cookies from
 * API_SPEC.md survive process death. App code never reads these values
 * directly — OkHttp replays them automatically on each request, exactly
 * like a browser would with httpOnly cookies.
 *
 * Implementation: an in-memory `Map<host, List<SerializableCookie>>`,
 * mirrored to a single JSON blob in EncryptedSharedPreferences on every
 * `saveFromResponse`. The cookies are keyed by their RESPONSE host for storage
 * only; on send, matching is delegated to OkHttp's own [Cookie.matches] (review
 * L4), which enforces RFC-6265 domain, path AND Secure matching — so a Secure
 * cookie is never replayed over cleartext, a cookie is never sent to a host it
 * doesn't domain-match, and path scoping is honoured. (The prior version keyed
 * purely on exact host and only filtered by expiry, re-implementing matching
 * loosely; the exact-host keying happened to prevent cross-origin send, but the
 * Secure/path checks were missing.)
 */
class PersistentCookieJar(private val secureStore: SecureStore) : CookieJar {

    private val json = Json { ignoreUnknownKeys = true }

    private val memoryCache: MutableMap<String, MutableList<SerializableCookie>> by lazy {
        loadFromStore().toMutableMap()
    }

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        if (cookies.isEmpty()) return
        val host = url.host
        val existing = memoryCache.getOrPut(host) { mutableListOf() }

        cookies.forEach { newCookie ->
            existing.removeAll { it.name == newCookie.name && it.path == newCookie.path }
            existing.add(SerializableCookie.fromCookie(newCookie))
        }

        persist()
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        val now = System.currentTimeMillis()
        var sweptAny = false
        val result = mutableListOf<Cookie>()

        // Iterate every stored bucket; OkHttp's Cookie.matches(url) decides
        // domain/path/Secure eligibility for THIS request. Expired cookies are
        // swept out as we go.
        for ((host, stored) in memoryCache) {
            val (valid, expired) = stored.partition { it.expiresAt > now }
            if (expired.isNotEmpty()) {
                memoryCache[host] = valid.toMutableList()
                sweptAny = true
            }
            valid.forEach { sc ->
                val cookie = sc.toCookie(host) ?: return@forEach
                if (cookie.matches(url)) result.add(cookie)
            }
        }
        if (sweptAny) persist()
        return result
    }

    /** Wipes every persisted + in-memory cookie (used by logout). */
    fun clearAll() {
        memoryCache.clear()
        secureStore.remove(SecureStore.KEY_COOKIE_JAR_BLOB)
    }

    private fun persist() {
        val blob = json.encodeToString(memoryCache as Map<String, List<SerializableCookie>>)
        secureStore.putString(SecureStore.KEY_COOKIE_JAR_BLOB, blob)
    }

    private fun loadFromStore(): Map<String, MutableList<SerializableCookie>> {
        val blob = secureStore.getString(SecureStore.KEY_COOKIE_JAR_BLOB) ?: return emptyMap()
        return try {
            json.decodeFromString<Map<String, List<SerializableCookie>>>(blob)
                .mapValues { it.value.toMutableList() }
        } catch (_: Exception) {
            emptyMap()
        }
    }
}

@Serializable
private data class SerializableCookie(
    val name: String,
    val value: String,
    val domain: String,
    val path: String,
    val expiresAt: Long,
    val secure: Boolean,
    val httpOnly: Boolean,
    val hostOnly: Boolean
) {
    fun toCookie(requestHost: String): Cookie? {
        return try {
            Cookie.Builder()
                .name(name)
                .value(value)
                .expiresAt(expiresAt)
                .path(path)
                .apply {
                    if (hostOnly) hostOnlyDomain(domain) else domain(domain)
                    if (secure) secure()
                    if (httpOnly) httpOnly()
                }
                .build()
        } catch (_: Exception) {
            null
        }
    }

    companion object {
        fun fromCookie(cookie: Cookie): SerializableCookie = SerializableCookie(
            name = cookie.name,
            value = cookie.value,
            domain = cookie.domain,
            path = cookie.path,
            expiresAt = cookie.expiresAt,
            secure = cookie.secure,
            httpOnly = cookie.httpOnly,
            hostOnly = cookie.hostOnly
        )
    }
}
