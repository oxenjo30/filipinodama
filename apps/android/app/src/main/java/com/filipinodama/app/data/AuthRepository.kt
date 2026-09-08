package com.filipinodama.app.data

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

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
 * Identity-changing operations are serialized by [authMutationMutex]; every
 * unrelated late response is additionally keyed to the captured session
 * generation before it may mutate [state].
 */
object AuthRepository {

    private val authApi: AuthApi by lazy { ApiClient.create<AuthApi>() }
    private val authMutationMutex = Mutex()

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
    /** Captures the active identity *before* an unrelated request begins. */
    fun currentSessionKey(): AuthSessionKey = authSessionKey(_state.value)

    /**
     * Applies a server-confirmed partial update only to the session that made
     * the request. The patch receives the latest current user, so concurrent
     * valid patches cannot overwrite fields they did not change.
     */
    fun patchUser(sessionKey: AuthSessionKey, patch: (AuthUser) -> AuthUser) {
        _state.update { state -> applyUserPatchForSession(state, sessionKey, patch) }
    }

    fun setOnboarded() {
        ApiClient.secureStore.putBoolean(SecureStore.KEY_ONBOARDED, true)
    }

    /**
     * Boot-time / splash-time session probe. GET /api/auth/me never 401s (an
     * anonymous caller gets `{ user: null }` with 200 per the server contract),
     * so it resolves to a user or to null — it does not throw on "logged out",
     * only on a genuine network/server failure.
     *
     * BUG FIX (logout-on-restart): the ~15-min `fd_access` JWT expires while the
     * app is closed, but the 30-day `fd_refresh` cookie is still valid. Because
     * /api/auth/me returns 200 `{user:null}` (NOT 401) when only the access
     * token is stale, the OkHttp RefreshAuthenticator — which fires only on a
     * 401 — never triggers, so the refresh token went UNUSED and the user was
     * wrongly logged out on reopen. Fix: if the first /me returns null, PROACTIVELY
     * POST /api/auth/refresh (mints a fresh fd_access from the refresh cookie),
     * then retry /me ONCE. Only a failed refresh + still-null /me means the user
     * is genuinely signed out.
     */
    suspend fun refreshMe(): AuthUser? = authMutationMutex.withLock {
        refreshMeUnlocked(currentSessionKey())
    }

    /** Uses a caller-captured key when a response belongs to another workflow. */
    suspend fun refreshMe(sessionKey: AuthSessionKey): AuthUser? = authMutationMutex.withLock {
        refreshMeUnlocked(sessionKey)
    }

    private suspend fun refreshMeUnlocked(sessionKey: AuthSessionKey): AuthUser? {
        return try {
            var me = authApi.me().let { if (it.ok) it.data else null }
            var user = me?.user
            if (user == null) {
                // No session from the access cookie — try the refresh cookie
                // before giving up. A refresh failure (no/expired fd_refresh) is
                // fine: /me stays null and the user is truly logged out.
                val refreshed = runCatching { authApi.refresh().ok }.getOrDefault(false)
                if (refreshed) {
                    me = authApi.me().let { if (it.ok) it.data else null }
                    user = me?.user
                }
            }
            // Capture validity before applying: a valid anonymous cold-start
            // response intentionally creates a new generation below, so the
            // request key will no longer match after the state transition.
            val accepted = acceptsMeRefreshForSession(_state.value, sessionKey)
            _state.update { state ->
                applyMeRefreshForSession(state, sessionKey, user, me?.account)
            }
            if (accepted) user else null
        } catch (e: Exception) {
            _state.update { state -> applyMeRefreshFailureForSession(state, sessionKey) }
            null
        }
    }

    /**
     * Re-read only the `account` block. Never touches `user`: this runs straight
     * after a successful sign-in, and a transient failure here must not undo it.
     */
    private suspend fun refreshAccountOnlyUnlocked(sessionKey: AuthSessionKey) {
        runCatching { authApi.me() }
            .onSuccess { env ->
                if (env.ok) {
                    _state.update { state ->
                        applyAccountRefreshForSession(state, sessionKey, env.data?.account)
                    }
                }
            }
    }

    suspend fun login(email: String, password: String): AuthResult = authMutationMutex.withLock {
        runCatching {
            val envelope = authApi.login(LoginRequest(email = email, password = password))
            unwrap(envelope) { it.user }
        }.fold(
            onSuccess = { user ->
                _state.update { state -> establishAuthSession(state, user) }
                // `account` is only returned by /me. Fetch JUST that — calling
                // refreshMe() here was a regression: its catch sets
                // user = null, so one flaky request right after a successful
                // login signed the player straight back out.
                refreshAccountOnlyUnlocked(currentSessionKey())
                AuthResult.Success(user)
            },
            onFailure = { toResult(it) }
        )
    }

    suspend fun register(email: String, password: String, username: String): AuthResult = authMutationMutex.withLock {
        runCatching {
            val envelope = authApi.register(
                RegisterRequest(email = email, password = password, username = username)
            )
            unwrap(envelope) { it.user }
        }.fold(
            onSuccess = { user ->
                justRegistered = true
                _state.update { state -> establishAuthSession(state, user) }
                // `account` is only returned by /me. Fetch JUST that — calling
                // refreshMe() here was a regression: its catch sets
                // user = null, so one flaky request right after a successful
                // login signed the player straight back out.
                refreshAccountOnlyUnlocked(currentSessionKey())
                AuthResult.Success(user)
            },
            onFailure = { toResult(it) }
        )
    }

    suspend fun guest(): AuthResult = authMutationMutex.withLock {
        runCatching {
            val envelope = authApi.guest()
            unwrap(envelope) { it.user }
        }.fold(
            onSuccess = { user ->
                ApiClient.secureStore.putBoolean(SecureStore.KEY_IS_GUEST, true)
                _state.update { state -> establishAuthSession(state, user) }
                // `account` is only returned by /me. Fetch JUST that — calling
                // refreshMe() here was a regression: its catch sets
                // user = null, so one flaky request right after a successful
                // login signed the player straight back out.
                refreshAccountOnlyUnlocked(currentSessionKey())
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
    suspend fun googleSignIn(idToken: String): AuthResult = authMutationMutex.withLock {
        runCatching {
            val envelope = authApi.googleToken(GoogleTokenRequest(idToken = idToken))
            unwrap(envelope) { it.user }
        }.fold(
            onSuccess = { user ->
                _state.update { state -> establishAuthSession(state, user) }
                // `account` is only returned by /me. Fetch JUST that — calling
                // refreshMe() here was a regression: its catch sets
                // user = null, so one flaky request right after a successful
                // login signed the player straight back out.
                refreshAccountOnlyUnlocked(currentSessionKey())
                AuthResult.Success(user)
            },
            onFailure = { toResult(it) }
        )
    }

    /**
     * Stage an email change. Nothing moves until the owner of the NEW address
     * clicks the emailed link — so a "success" here means "check your inbox",
     * not "your email changed". [currentPassword] is null for OAuth-only
     * accounts; the server decides whether one is required.
     */
    suspend fun requestEmailChange(newEmail: String, currentPassword: String?): AuthResult = authMutationMutex.withLock {
        val sessionKey = currentSessionKey()
        runCatching {
            val envelope = authApi.changeEmail(EmailChangeRequest(newEmail = newEmail, currentPassword = currentPassword))
            unwrap(envelope) { it }
            Unit
        }.fold(
            onSuccess = {
                // account-only re-read. refreshMe() here was a live bug: its
                // catch sets user = null, so one flaky request right after a
                // successful email-change request signed the player out.
                refreshAccountOnlyUnlocked(sessionKey)
                AuthResult.Success(null)
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
    suspend fun logout() = authMutationMutex.withLock {
        ApiClient.beginLogoutBarrier()
        try {
            runCatching { authApi.logout() }
        } finally {
            ApiClient.finishLogoutBarrier()
            ApiClient.secureStore.remove(SecureStore.KEY_IS_GUEST)
            ApiClient.secureStore.remove(SecureStore.KEY_ONBOARDED)
            justRegistered = false
            _state.update(::clearAuthSession)
        }
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
    /**
     * Account/security state as the SERVER computed it (email, linked
     * providers, pending email change, and whether unlinking is safe). Comes
     * down on the same /api/auth/me call as [user], so this screen shows the
     * same thing on Android and web wherever the player signs in.
     */
    val account: AccountState? = null,
    /** True once the first refreshMe() call has completed (success or failure). */
    val checked: Boolean = false,
    /** Increments at every login and logout boundary, including same-user re-login. */
    val generation: Long = 0L
)

/** A request-scoped identity token that prevents late responses crossing sessions. */
data class AuthSessionKey(val userId: String?, val generation: Long)

fun authSessionKey(state: AuthSessionState): AuthSessionKey =
    AuthSessionKey(userId = state.user?.id, generation = state.generation)

fun isCurrentAuthSession(state: AuthSessionState, sessionKey: AuthSessionKey): Boolean =
    state.generation == sessionKey.generation && state.user?.id == sessionKey.userId

/** Whether a `/me` response still belongs to the session that started it. */
fun acceptsMeRefreshForSession(state: AuthSessionState, sessionKey: AuthSessionKey): Boolean =
    isCurrentAuthSession(state, sessionKey)

/**
 * Starts a server-authenticated session without carrying account security data
 * across identities. The `/me` account refresh happens after this transition,
 * so a failed refresh has no previous player's email data to display.
 */
fun establishAuthSession(previous: AuthSessionState, user: AuthUser): AuthSessionState =
    previous.copy(user = user, account = null, checked = true, generation = previous.generation + 1)

/** Ends the identity boundary before any late response can update shared state. */
fun clearAuthSession(previous: AuthSessionState): AuthSessionState =
    previous.copy(user = null, account = null, checked = true, generation = previous.generation + 1)

/** Applies an authoritative `/me` result only when it belongs to its requester. */
fun applyMeRefreshForSession(
    state: AuthSessionState,
    sessionKey: AuthSessionKey,
    user: AuthUser?,
    account: AccountState?
): AuthSessionState =
    if (!acceptsMeRefreshForSession(state, sessionKey)) state
    else if (state.user?.id != user?.id) {
        state.copy(user = user, account = account, checked = true, generation = state.generation + 1)
    } else {
        state.copy(user = user, account = account, checked = true)
    }

/** A current `/me` failure means signed out; a late one must leave newer state alone. */
fun applyMeRefreshFailureForSession(
    state: AuthSessionState,
    sessionKey: AuthSessionKey
): AuthSessionState =
    if (!acceptsMeRefreshForSession(state, sessionKey)) state
    else if (state.user != null) clearAuthSession(state)
    else state.copy(account = null, checked = true)

/**
 * A sign-in can replace the user while an older `/me` request is in flight.
 * Accept an account response only when it belongs to the still-active session.
 */
fun applyAccountRefreshForSession(
    state: AuthSessionState,
    sessionKey: AuthSessionKey,
    account: AccountState?
): AuthSessionState =
    if (isCurrentAuthSession(state, sessionKey)) state.copy(account = account) else state

/** Merges a valid response into the latest user rather than a stale snapshot. */
fun applyUserPatchForSession(
    state: AuthSessionState,
    sessionKey: AuthSessionKey,
    patch: (AuthUser) -> AuthUser
): AuthSessionState {
    val current = state.user ?: return state
    return if (isCurrentAuthSession(state, sessionKey)) state.copy(user = patch(current)) else state
}

/** Thrown internally when the server envelope is `{ ok: false, error }`. */
class AuthApiException(val code: String, override val message: String) : Exception(message)

sealed class AuthResult {
    data class Success(val user: AuthUser?) : AuthResult()
    data class Failure(val message: String) : AuthResult()
}
