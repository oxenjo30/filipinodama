package com.filipinodama.app.data

import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

/**
 * Retrofit interface for the auth endpoints, matching
 * apps/server/src/auth/routes.ts exactly (mounted at prefix "api/auth"):
 *   POST register, POST login, POST guest, POST refresh, POST logout,
 *   POST password/forgot, GET me, GET providers.
 *
 * All calls ride the shared OkHttpClient's PersistentCookieJar — the
 * fd_access / fd_refresh httpOnly cookies are attached/persisted
 * automatically, the same way a browser would.
 */
interface AuthApi {

    @POST("api/auth/register")
    suspend fun register(@Body request: RegisterRequest): ApiEnvelope<RegisterResponse>

    @POST("api/auth/login")
    suspend fun login(@Body request: LoginRequest): ApiEnvelope<AuthUserResponse>

    @POST("api/auth/guest")
    suspend fun guest(): ApiEnvelope<AuthUserResponse>

    @POST("api/auth/refresh")
    suspend fun refresh(): ApiEnvelope<AuthUserResponse>

    @POST("api/auth/logout")
    suspend fun logout(): ApiEnvelope<LogoutResponse>

    @POST("api/auth/password/forgot")
    suspend fun forgotPassword(@Body request: ForgotPasswordRequest): ApiEnvelope<ForgotPasswordResponse>

    @GET("api/auth/me")
    suspend fun me(): ApiEnvelope<MeResponse>

    @GET("api/auth/providers")
    suspend fun providers(): ApiEnvelope<ProvidersResponse>
}

@Serializable
data class LoginRequest(
    val email: String,
    val password: String
)

@Serializable
data class RegisterRequest(
    val email: String,
    val password: String,
    val username: String
)

@Serializable
data class ForgotPasswordRequest(
    val email: String
)

@Serializable
data class ForgotPasswordResponse(
    val sent: Boolean
)

@Serializable
data class LogoutResponse(
    val loggedOut: Boolean
)

@Serializable
data class RegisterResponse(
    val user: AuthUser,
    val needsVerification: Boolean = false,
    val emailConfigured: Boolean = false
)

@Serializable
data class AuthUserResponse(
    val user: AuthUser
)

/** GET api/auth/me returns `{ user: AuthUser | null }` — never a 401. */
@Serializable
data class MeResponse(
    val user: AuthUser? = null
)

@Serializable
data class ProvidersResponse(
    val email: Boolean = true,
    val guest: Boolean = true,
    val google: Boolean = false,
    val facebook: Boolean = false,
    val emailDelivery: Boolean = false,
    val diamondTopUp: Boolean = false
)

/**
 * Mirrors the server's `publicUser()` shape (apps/server/src/auth/service.ts)
 * exactly. Only the fields the auth shell actually needs are declared here —
 * remaining fields (equipped cosmetics, streak, etc.) are ignored by
 * kotlinx.serialization's `ignoreUnknownKeys = true` and can be added when a
 * later phase needs them.
 */
@Serializable
data class AuthUser(
    val id: String,
    val email: String? = null,
    val emailVerified: Boolean = false,
    val isGuest: Boolean = false,
    val username: String,
    val displayName: String,
    val tag: String,
    val trophies: Int = 0,
    val gold: Int = 0,
    val diamonds: Int = 0,
    val rankTier: String? = null
)
