package com.filipinodama.app.data

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Session state holder for the auth shell. Matches the scaffold's existing
 * singleton-object convention (see [ApiClient], [SocketClient]) rather than
 * introducing a DI framework or AndroidX ViewModel — Phase 1 has no
 * ViewModel usage anywhere to follow, so a plain object exposing a
 * [StateFlow] is the smallest addition consistent with what's here.
 *
 * Responsibilities:
 *  - cache the last-known /api/auth/me user in memory (avoids re-fetching on
 *    every screen; SplashScreen is the only place that calls [refreshMe] on
 *    cold start).
 *  - own the auth actions (login/register/guest/logout/forgotPassword/
 *    googleSignIn), always going through [AuthApi] so envelope errors surface
 *    consistently.
 *  - cache GET /api/auth/providers (mirrors the web's authStore.providers) so
 *    the Login/Create Account screens can gate the Google button exactly like
 *    AuthPage.tsx gates it on `providers.google`.
 *  - own the onboarded flag, persisted in [SecureStore] as the native
 *    equivalent of the web client's localStorage `fdr.onboarded` marker.
 *
 * Not thread-unsafe-by-accident: all mutation happens via [MutableStateFlow]
 * updates from the caller's own coroutine (typically viewModelScope-less
 * `rememberCoroutineScope()` in a composable), matching how AuthApi's
 * suspend functions are already meant to be called directly from Compose.
 */
object AuthRepository {

    private val authApi: AuthApi by lazy { ApiClient.create<AuthApi>() }

    private val _state = MutableStateFlow(AuthSessionState())
    val state: StateFlow<AuthSessionState> = _state.asStateFlow()

    private val _providers = MutableStateFlow(ProvidersResponse())
    val providers: StateFlow<ProvidersResponse> = _providers.asStateFlow()

    /** True once a just-registered, non-guest account should see onboarding. */
    var justRegistered: Boolean = false
        private set

    fun clearJustRegistered() {
        justRegistered = false
    }

    fun isOnboarded(): Boolean = ApiClient.secureStore.getBoolean(SecureStore.KEY_ONBOARDED)

    /**
     * Replaces the cached session user in-place (e.g. after
     * [com.filipinodama.app.data.economy.EconomyRepository] applies a fresh
     * server-confirmed gold/diamonds balance from a purchase or claim). A
     * no-op when nobody is signed in, so a stray call after logout can't
     * resurrect a session.
     */
    fun patchUser(user: AuthUser) {
        if (_state.value.user == null) return
        _state.value = _state.value.copy(user = user)
    }

    fun setOnboarded() {
        ApiClient.secureStore.putBoolean(SecureStore.KEY_ONBOARDED, true)
    }

    /**
     * Boot-time / splash-time session probe. GET /api/auth/me never 401s
     * (an anonymous caller gets `{ user: null }` with 200 per the server
     * contract), so this either resolves to a user or to null — it does not
     * throw on "logged out", only on a genuine network/server failure.
     */
    suspend fun refreshMe(): AuthUser? {
        return try {
            val envelope = authApi.me()
            val user = if (envelope.ok) envelope.data?.user else null
            _state.value = _state.value.copy(user = user, checked = true)
            user
        } catch (e: Exception) {
            _state.value = _state.value.copy(user = null, checked = true)
            null
        }
    }

    suspend fun login(email: String, password: String): AuthResult {
        return runCatching {
            val envelope = authApi.login(LoginRequest(email = email, password = password))
            unwrap(envelope) { it.user }
        }.fold(
            onSuccess = { user ->
                _state.value = _state.value.copy(user = user, checked = true)
                AuthResult.Success(user)
            },
            onFailure = { toResult(it) }
        )
    }

    suspend fun register(email: String, password: String, username: String): AuthResult {
        return runCatching {
            val envelope = authApi.register(
                RegisterRequest(email = email, password = password, username = username)
            )
            unwrap(envelope) { it.user }
        }.fold(
            onSuccess = { user ->
                justRegistered = true
                _state.value = _state.value.copy(user = user, checked = true)
                AuthResult.Success(user)
            },
            onFailure = { toResult(it) }
        )
    }

    suspend fun guest(): AuthResult {
        return runCatching {
            val envelope = authApi.guest()
            unwrap(envelope) { it.user }
        }.fold(
            onSuccess = { user ->
                ApiClient.secureStore.putBoolean(SecureStore.KEY_IS_GUEST, true)
                _state.value = _state.value.copy(user = user, checked = true)
                AuthResult.Success(user)
            },
            onFailure = { toResult(it) }
        )
    }

    /**
     * Refreshes the cached provider-availability flags (mirrors the web's
     * authStore.refreshProviders()). Silently keeps the previous/default
     * values on failure, same as web ("keep defaults") — a transient network
     * blip here should not permanently hide the Google button behind a stale
     * false.
     */
    suspend fun refreshProviders() {
        runCatching { authApi.providers() }
            .onSuccess { envelope -> if (envelope.ok && envelope.data != null) _providers.value = envelope.data }
    }

    /**
     * Native Google Sign-In (Credential Manager). Exchanges the ID token
     * Credential Manager returned for our session via
     * POST /api/auth/oauth/google/token (server verifies it, then runs the
     * exact same find-or-create-user logic as the web's OAuth redirect
     * callback). Deliberately mirrors the web client's OAuth semantics: an
     * OAuth sign-in NEVER sets [justRegistered] — on web, `justRegistered` is
     * set only by `register()` (email/password); a Google sign-in (whether it
     * creates a brand-new account server-side or logs into an existing one)
     * always routes like a normal login, never triggers the onboarding tour.
     * See apps/web/src/stores/authStore.ts / OnboardingFlow.tsx.
     */
    suspend fun googleSignIn(idToken: String): AuthResult {
        return runCatching {
            val envelope = authApi.googleToken(GoogleTokenRequest(idToken = idToken))
            unwrap(envelope) { it.user }
        }.fold(
            onSuccess = { user ->
                _state.value = _state.value.copy(user = user, checked = true)
                AuthResult.Success(user)
            },
            onFailure = { toResult(it) }
        )
    }

    suspend fun forgotPassword(email: String): AuthResult {
        return runCatching {
            val envelope = authApi.forgotPassword(ForgotPasswordRequest(email = email))
            unwrap(envelope) { it }
            Unit
        }.fold(
            onSuccess = { AuthResult.Success(null) },
            onFailure = { toResult(it) }
        )
    }

    /**
     * Logs out: best-effort server call (mirrors the web client swallowing
     * logout errors — a dead network shouldn't trap the user signed in on
     * device), then always clears local session state regardless of whether
     * the network call succeeded.
     */
    suspend fun logout() {
        runCatching { authApi.logout() }
        ApiClient.cookieJar.clearAll()
        ApiClient.secureStore.remove(SecureStore.KEY_IS_GUEST)
        ApiClient.secureStore.remove(SecureStore.KEY_ONBOARDED)
        justRegistered = false
        _state.value = AuthSessionState(checked = true)
    }

    private fun <T, R> unwrap(envelope: ApiEnvelope<T>, map: (T) -> R): R = unwrapEnvelope(envelope, map)

    private fun toResult(throwable: Throwable): AuthResult.Failure = throwableToAuthFailure(throwable)
}

/**
 * Converts a raw [ApiEnvelope] into either its unwrapped data or a thrown
 * [AuthApiException] carrying the server's own error message — the
 * mechanism that satisfies "surface the server's actual message text, never
 * invent error copy". Kept as a top-level function (rather than private
 * inside the [AuthRepository] object) so it's directly unit-testable.
 */
fun <T, R> unwrapEnvelope(envelope: ApiEnvelope<T>, map: (T) -> R): R {
    if (!envelope.ok || envelope.data == null) {
        val error = envelope.error
        throw AuthApiException(error?.code ?: "UNKNOWN", error?.message ?: "Something went wrong. Please try again.")
    }
    return map(envelope.data)
}

/**
 * Maps any thrown failure from an auth action into a user-facing
 * [AuthResult.Failure] carrying the SERVER'S REAL message.
 *
 * The auth [AuthApi] methods return the `ApiEnvelope` payload DIRECTLY (not
 * `Response<…>`), so Retrofit throws [retrofit2.HttpException] on any non-2xx
 * status (e.g. 401 BAD_CREDENTIALS on a wrong password) BEFORE unwrapEnvelope
 * ever runs. That HttpException is not an [AuthApiException], so it used to fall
 * into the generic "Something went wrong. Please try again." branch — masking
 * every real login error (wrong password, account has no password / is
 * Google-only, banned, rate-limited). Decode the HttpException's error envelope
 * first (same mechanism the economy/social repos use via [apiErrorFrom]) so the
 * user sees the actual reason; only a true transport failure (no HTTP response
 * at all — offline/DNS/timeout) falls back to a network message.
 */
fun throwableToAuthFailure(throwable: Throwable): AuthResult.Failure {
    val message = when (throwable) {
        is AuthApiException -> throwable.message
        else -> {
            val apiError = apiErrorFrom(throwable)
            apiError?.message
                ?: "Couldn't reach the server. Check your connection and try again."
        }
    }
    return AuthResult.Failure(message)
}

data class AuthSessionState(
    val user: AuthUser? = null,
    /** True once the first refreshMe() call has completed (success or failure). */
    val checked: Boolean = false
)

/** Thrown internally when the server envelope is `{ ok: false, error }`. */
class AuthApiException(val code: String, override val message: String) : Exception(message)

sealed class AuthResult {
    data class Success(val user: AuthUser?) : AuthResult()
    data class Failure(val message: String) : AuthResult()
}
