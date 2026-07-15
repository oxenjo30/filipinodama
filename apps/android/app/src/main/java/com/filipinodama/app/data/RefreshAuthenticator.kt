package com.filipinodama.app.data

import kotlinx.serialization.json.Json
import okhttp3.Authenticator
import okhttp3.CookieJar
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.Route
import java.util.concurrent.TimeUnit

/**
 * OkHttp [Authenticator] implementing "refresh once, then retry once" on a
 * 401. This is the native-client analogue of the web client's
 * `tryRefresh()` + single-retry logic in apps/web/src/lib/api.ts.
 *
 * Authenticator callbacks run synchronously on an OkHttp dispatcher thread
 * (never the main thread), so a blocking `execute()` call here is the
 * idiomatic/safe approach — no coroutine bridging needed.
 *
 * Loop-prevention: OkHttp calls `responseCount(response)` for us; if the
 * *previous* response in the chain was already a retried 401 (i.e. this is
 * the second consecutive failure), give up and return null so the caller
 * sees the 401 instead of looping forever. The refresh call itself never
 * re-enters this Authenticator because it targets a plain `OkHttpClient`
 * with no `authenticator` configured.
 */
class RefreshAuthenticator(
    private val baseUrl: String,
    private val cookieJar: CookieJar
) : Authenticator {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    // A minimal client, deliberately NOT wired with this Authenticator, used
    // only to fire the refresh call itself (avoids infinite recursion).
    private val refreshClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .cookieJar(cookieJar)
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .build()
    }

    // Single-flight state (review L2): concurrent 401s (common on cold start /
    // token-expiry bursts) must NOT each fire their own POST /api/auth/refresh —
    // with server-side refresh-token ROTATION the first call rotates fd_refresh
    // and the racers then present a consumed token → spurious logout / reuse
    // alarms. [refreshLock] serialises refreshes; [refreshGen] counts completed
    // refreshes so a thread that blocked on the lock can tell a refresh already
    // happened *after it started waiting* and just retry with the fresh cookie
    // instead of firing a redundant one.
    private val refreshLock = Any()
    @Volatile private var refreshGen = 0L

    override fun authenticate(route: Route?, response: Response): Request? {
        // Never try to refresh auth endpoints themselves (matches the web
        // client's `!path.startsWith("/api/auth/")` guard) — a 401 from
        // /api/auth/login or /api/auth/refresh is a real credential failure,
        // not a "session expired" case. (Review L1: startsWith, not contains —
        // contains would also skip refresh for any path merely CONTAINING the
        // substring, and the guard is meant to match only the auth route prefix.)
        val path = response.request.url.encodedPath
        if (path.startsWith("/api/auth/")) return null

        // Already retried once for this request chain — stop, don't loop.
        if (responseCount(response) >= 2) return null

        // Snapshot the generation BEFORE contending for the lock: if another
        // thread completes a refresh while we wait, our snapshot is stale and we
        // should just retry (the cookie is already fresh) rather than refresh
        // again. The snapshot read and the refresh decision are a single
        // critical section so the compare is race-free.
        val genBefore = refreshGen // volatile-ish read; re-checked under the lock
        val refreshed = synchronized(refreshLock) {
            if (refreshGen != genBefore) {
                // A refresh completed while we were waiting for the lock — reuse it.
                true
            } else {
                runCatching { attemptRefresh() }.getOrDefault(false).also { ok ->
                    if (ok) refreshGen++
                }
            }
        }
        if (!refreshed) return null

        // Cookies were rotated by attemptRefresh() via the shared cookieJar;
        // OkHttp will attach the new fd_access cookie automatically on
        // replay, so the retried request is just the original request as-is.
        return response.request.newBuilder().build()
    }

    private fun attemptRefresh(): Boolean {
        val body = "{}".toRequestBody("application/json".toMediaType())
        val request = Request.Builder()
            .url("$baseUrl/api/auth/refresh")
            .post(body)
            .build()
        refreshClient.newCall(request).execute().use { resp ->
            return resp.isSuccessful
        }
    }

    private fun responseCount(response: Response): Int {
        var count = 1
        var prior = response.priorResponse
        while (prior != null) {
            count++
            prior = prior.priorResponse
        }
        return count
    }
}
