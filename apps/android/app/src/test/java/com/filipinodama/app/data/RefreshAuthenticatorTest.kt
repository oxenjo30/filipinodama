package com.filipinodama.app.data

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Exercises [RefreshAuthenticator]'s "refresh once, then retry once" logic
 * end-to-end against a real (fake) HTTP server, matching the "refresh-once
 * on 401" behavior mandated for the auth shell (mirrors the web client's
 * `tryRefresh()` + single-retry in apps/web/src/lib/api.ts).
 *
 * The retry-behavior tests hit a plain protected endpoint
 * (`/api/game/profile` — representative of any non-auth authenticated
 * route) via a raw OkHttp [Request] rather than [AuthApi], because every
 * route [AuthApi] actually exposes lives under `/api/auth/…`, which
 * [RefreshAuthenticator] deliberately never retries (matching the real
 * GET /api/auth/me contract: it returns `{ user: null }` with 200 on an
 * anonymous/expired caller, never a 401 — see apps/server/src/auth/routes.ts
 * "Optional auth" doc comment — so `/api/auth/…` genuinely never needs the
 * refresh-retry path in production). The "auth endpoint itself is never
 * retried" test below uses the real [AuthApi.login] to prove that guard.
 *
 * A bare in-memory CookieJar stands in for [PersistentCookieJar] here since
 * these tests only need cookie replay to work within a single test process,
 * not survive a process restart — SecureStore/EncryptedSharedPreferences
 * needs a real Android Context and is exercised by instrumented tests
 * instead (out of scope for this JVM unit-test pass).
 */
class RefreshAuthenticatorTest {

    private lateinit var server: MockWebServer

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private fun buildClient(cookieJar: InMemoryCookieJarForTest): OkHttpClient {
        return OkHttpClient.Builder()
            .cookieJar(cookieJar)
            .authenticator(RefreshAuthenticator(server.url("/").toString().removeSuffix("/"), cookieJar))
            .connectTimeout(5, TimeUnit.SECONDS)
            .readTimeout(5, TimeUnit.SECONDS)
            .build()
    }

    private fun buildAuthApi(cookieJar: InMemoryCookieJarForTest): AuthApi {
        val json = Json { ignoreUnknownKeys = true; isLenient = true }
        val retrofit = Retrofit.Builder()
            .baseUrl(server.url("/"))
            .client(buildClient(cookieJar))
            .addConverterFactory(KotlinSerializationConverterFactory.create(json, "application/json".toMediaType()))
            .build()
        return retrofit.create(AuthApi::class.java)
    }

    private fun protectedRequest(): Request =
        Request.Builder().url(server.url("/api/game/profile")).get().build()

    @Test
    fun `401 then successful refresh retries the original request once and succeeds`() {
        val cookieJar = InMemoryCookieJarForTest()
        val client = buildClient(cookieJar)

        // 1st: the original protected call comes back 401.
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"ok":false,"error":{"code":"UNAUTHORIZED","message":"Not authenticated"}}"""))
        // 2nd: the Authenticator's refresh call succeeds.
        server.enqueue(
            MockResponse().setResponseCode(200)
                .setHeader("Set-Cookie", "fd_access=new-token; Path=/; HttpOnly")
                .setBody("""{"ok":true,"data":{"user":{"id":"u1","username":"rico","displayName":"Rico","tag":"#1234"}}}""")
        )
        // 3rd: the retried original call now succeeds.
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"ok":true,"data":{}}"""))

        client.newCall(protectedRequest()).execute().use { response ->
            assertTrue(response.isSuccessful)
        }
        assertEquals(3, server.requestCount)

        val first = server.takeRequest()
        val second = server.takeRequest()
        val third = server.takeRequest()
        assertEquals("/api/game/profile", first.path)
        assertEquals("/api/auth/refresh", second.path)
        assertEquals("/api/game/profile", third.path)
    }

    @Test
    fun `401 with failed refresh does not loop and surfaces the 401`() {
        val cookieJar = InMemoryCookieJarForTest()
        val client = buildClient(cookieJar)

        // Original call 401s.
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"ok":false,"error":{"code":"UNAUTHORIZED","message":"Not authenticated"}}"""))
        // Refresh attempt also fails (expired/invalid refresh token).
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"ok":false,"error":{"code":"INVALID_REFRESH","message":"Session expired"}}"""))

        client.newCall(protectedRequest()).execute().use { response ->
            assertEquals(401, response.code)
        }

        // Exactly 2 requests: the original + the one failed refresh attempt.
        // No further retry of the original request happens once refresh fails.
        assertEquals(2, server.requestCount)
    }

    @Test
    fun `a 401 from an auth endpoint itself is never retried`() = runBlocking {
        val cookieJar = InMemoryCookieJarForTest()
        val api = buildAuthApi(cookieJar)

        // Login itself 401s (wrong password) — must NOT trigger a refresh attempt.
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"ok":false,"error":{"code":"INVALID_CREDENTIALS","message":"Incorrect email or password."}}"""))

        var threw = false
        try {
            api.login(LoginRequest(email = "a@b.com", password = "wrong"))
        } catch (e: retrofit2.HttpException) {
            threw = true
        }

        assertTrue(threw)
        // Only the single login attempt — RefreshAuthenticator's own guard
        // against /api/auth/* paths must prevent any refresh call at all.
        assertEquals(1, server.requestCount)
    }

    @Test
    fun `two consecutive 401s after a successful-looking refresh still stop retrying`() {
        val cookieJar = InMemoryCookieJarForTest()
        val client = buildClient(cookieJar)

        // Original call 401s.
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"ok":false,"error":{"code":"UNAUTHORIZED","message":"Not authenticated"}}"""))
        // Refresh "succeeds" (200) but doesn't actually fix the session (edge case).
        server.enqueue(
            MockResponse().setResponseCode(200)
                .setBody("""{"ok":true,"data":{"user":{"id":"u1","username":"rico","displayName":"Rico","tag":"#1234"}}}""")
        )
        // Retried original request 401s again.
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"ok":false,"error":{"code":"UNAUTHORIZED","message":"Not authenticated"}}"""))

        client.newCall(protectedRequest()).execute().use { response ->
            assertEquals(401, response.code)
        }

        // 3 requests total: original, refresh, retried-original. The
        // Authenticator must give up after the second 401 in the chain
        // rather than refreshing again (infinite-loop guard).
        assertEquals(3, server.requestCount)
    }

    @Test
    fun `begin logout waits for an in-flight refresh and finish leaves the jar empty`() {
        val cookieJar = InMemoryCookieJarForTest()
        val authenticator = RefreshAuthenticator(server.url("/").toString().removeSuffix("/"), cookieJar)
        val client = OkHttpClient.Builder()
            .cookieJar(cookieJar)
            .authenticator(authenticator)
            .build()
        val refreshStarted = CountDownLatch(1)
        val allowRefreshToFinish = CountDownLatch(1)
        val logoutBarrierEntered = CountDownLatch(1)
        val callExecutor = Executors.newSingleThreadExecutor()

        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse = when (request.path) {
                "/api/game/profile" -> MockResponse().setResponseCode(401)
                "/api/auth/refresh" -> {
                    refreshStarted.countDown()
                    check(allowRefreshToFinish.await(5, TimeUnit.SECONDS))
                    MockResponse()
                        .setResponseCode(200)
                        .setHeader("Set-Cookie", "fd_access=rotated; Path=/; HttpOnly")
                }
                else -> MockResponse().setResponseCode(404)
            }
        }

        try {
            val call = callExecutor.submit<Int> {
                client.newCall(protectedRequest()).execute().use { it.code }
            }
            assertTrue(refreshStarted.await(5, TimeUnit.SECONDS))

            val logoutThread = Thread {
                authenticator.beginLogout()
                logoutBarrierEntered.countDown()
            }
            logoutThread.start()

            assertFalse(logoutBarrierEntered.await(200, TimeUnit.MILLISECONDS))
            allowRefreshToFinish.countDown()
            assertTrue(logoutBarrierEntered.await(5, TimeUnit.SECONDS))
            authenticator.finishLogout()

            call.get(5, TimeUnit.SECONDS)
            assertTrue(cookieJar.loadForRequest(server.url("/")).isEmpty())
        } finally {
            callExecutor.shutdownNow()
        }
    }

    @Test
    fun `401 during logout does not start a refresh`() {
        val cookieJar = InMemoryCookieJarForTest()
        val authenticator = RefreshAuthenticator(server.url("/").toString().removeSuffix("/"), cookieJar)
        val client = OkHttpClient.Builder()
            .cookieJar(cookieJar)
            .authenticator(authenticator)
            .build()
        authenticator.beginLogout()
        server.enqueue(MockResponse().setResponseCode(401))

        try {
            client.newCall(protectedRequest()).execute().use { response ->
                assertEquals(401, response.code)
            }
            assertEquals(1, server.requestCount)
            assertEquals("/api/game/profile", server.takeRequest().path)
        } finally {
            authenticator.finishLogout()
        }
    }

    @Test
    fun `request queued before logout invalidation cannot reuse an old refresh generation`() {
        val cookieJar = InMemoryCookieJarForTest()
        val snapshotTaken = CountDownLatch(1)
        val allowQueuedRequest = CountDownLatch(1)
        val authenticator = RefreshAuthenticator(
            baseUrl = server.url("/").toString().removeSuffix("/"),
            cookieJar = cookieJar,
            afterAuthSnapshot = {
                snapshotTaken.countDown()
                check(allowQueuedRequest.await(5, TimeUnit.SECONDS))
            }
        )
        val queuedResult = arrayOfNulls<Request>(1)
        val queued = Thread {
            queuedResult[0] = authenticator.authenticate(null, unauthorizedResponse())
        }
        queued.start()
        assertTrue(snapshotTaken.await(5, TimeUnit.SECONDS))

        authenticator.beginLogout()
        authenticator.finishLogout()
        allowQueuedRequest.countDown()
        queued.join(5_000)

        assertFalse(queued.isAlive)
        assertNull(queuedResult[0])
        assertEquals(0, server.requestCount)
    }

    private fun unauthorizedResponse() = okhttp3.Response.Builder()
        .request(protectedRequest())
        .protocol(okhttp3.Protocol.HTTP_1_1)
        .code(401)
        .message("Unauthorized")
        .build()
}
