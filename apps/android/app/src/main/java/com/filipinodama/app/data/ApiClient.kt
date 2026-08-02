package com.filipinodama.app.data

import android.content.Context
import com.filipinodama.app.BuildConfig
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import com.filipinodama.app.data.system.NetworkLiveness
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import java.util.concurrent.TimeUnit

/**
 * Builds a singleton Retrofit instance wired to BuildConfig.BASE_URL with a
 * persistent CookieJar (so fd_access / fd_refresh survive app restarts),
 * kotlinx.serialization for JSON (de)serialization, and a [RefreshAuthenticator]
 * that transparently refreshes an expired session once before retrying a
 * request that came back 401.
 */
object ApiClient {

    private const val TIMEOUT_SECONDS = 30L

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    @Volatile
    @PublishedApi
    internal var retrofit: Retrofit? = null

    /** Set during [init]; shared with AuthRepository (session flags, logout). */
    lateinit var secureStore: SecureStore
        private set

    /** Set during [init]; shared with AuthRepository (logout must clear cookies). */
    lateinit var cookieJar: PersistentCookieJar
        private set

    /**
     * Set during [init]; shared with [SocketClient] so the Socket.IO handshake
     * reuses the SAME cookie jar as REST calls — this is what makes the
     * server's cookie-based socket auth (io.use authenticate(), which reads
     * the httpOnly `fd_access` cookie) work without the app ever touching the
     * raw JWT.
     */
    lateinit var okHttpClient: OkHttpClient
        private set

    fun init(context: Context) {
        if (retrofit != null) return
        synchronized(this) {
            if (retrofit != null) return

            val secureStore = SecureStore(context.applicationContext)
            val cookieJar = PersistentCookieJar(secureStore)
            this.secureStore = secureStore
            this.cookieJar = cookieJar

            // Review M1: make the unencrypted-session-store fallback VISIBLE
            // rather than silent. In debug this warns; a real telemetry sink can
            // read secureStore.usingPlaintextFallback to measure how many installs
            // run without Keystore-backed encryption (bearer tokens then sit in
            // cleartext app-private storage).
            if (secureStore.usingPlaintextFallback && BuildConfig.DEBUG) {
                android.util.Log.w(
                    "SecureStore",
                    "EncryptedSharedPreferences unavailable — session tokens are on the PLAINTEXT fallback."
                )
            }

            val loggingInterceptor = HttpLoggingInterceptor().apply {
                level = if (BuildConfig.DEBUG) {
                    HttpLoggingInterceptor.Level.BASIC
                } else {
                    HttpLoggingInterceptor.Level.NONE
                }
            }

            // Proof of life for the "You're offline — reconnecting…" banner. A
            // response that actually came back over the NETWORK proves we reached
            // our own https origin — stronger and far more timely evidence than
            // Android's NET_CAPABILITY_VALIDATED probe, which lags a real
            // reconnect by seconds and left the banner up long after play had
            // resumed. See data/system/NetworkLiveness.kt.
            //
            // Registered as a NETWORK interceptor (not application) so it only
            // fires on real round trips, never a cache hit. Any status counts: a
            // 4xx/5xx still means the server answered us.
            val livenessInterceptor = Interceptor { chain ->
                chain.proceed(chain.request()).also { NetworkLiveness.reachedServer() }
            }

            val okHttpClient = OkHttpClient.Builder()
                .cookieJar(cookieJar)
                .authenticator(RefreshAuthenticator(BuildConfig.BASE_URL, cookieJar))
                .addNetworkInterceptor(livenessInterceptor)
                .addInterceptor(loggingInterceptor)
                .connectTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
                .readTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
                .writeTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
                .build()
            this.okHttpClient = okHttpClient

            val contentType = "application/json".toMediaType()

            retrofit = Retrofit.Builder()
                .baseUrl(BuildConfig.BASE_URL)
                .client(okHttpClient)
                .addConverterFactory(KotlinSerializationConverterFactory.create(json, contentType))
                .build()
        }
    }

    /** Creates a Retrofit API interface. Call [init] once (e.g. in Application.onCreate) first. */
    inline fun <reified T> create(): T {
        val instance = retrofit
            ?: error("ApiClient.init(context) must be called before ApiClient.create()")
        return instance.create(T::class.java)
    }
}
