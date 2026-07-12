package com.filipinodama.app.data

import android.content.Context
import com.filipinodama.app.BuildConfig
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
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

    fun init(context: Context) {
        if (retrofit != null) return
        synchronized(this) {
            if (retrofit != null) return

            val secureStore = SecureStore(context.applicationContext)
            val cookieJar = PersistentCookieJar(secureStore)
            this.secureStore = secureStore
            this.cookieJar = cookieJar

            val loggingInterceptor = HttpLoggingInterceptor().apply {
                level = if (BuildConfig.DEBUG) {
                    HttpLoggingInterceptor.Level.BASIC
                } else {
                    HttpLoggingInterceptor.Level.NONE
                }
            }

            val okHttpClient = OkHttpClient.Builder()
                .cookieJar(cookieJar)
                .authenticator(RefreshAuthenticator(BuildConfig.BASE_URL, cookieJar))
                .addInterceptor(loggingInterceptor)
                .connectTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
                .readTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
                .writeTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
                .build()

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
