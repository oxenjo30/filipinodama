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

    /**
     * Native Google Sign-In (Credential Manager) — exchanges a Google-issued ID
     * token for our own session, matching apps/server/src/auth/routes.ts
     * POST /api/auth/oauth/google/token exactly. The server verifies the token
     * (audience/issuer/expiry/email_verified) then runs the SAME
     * find-or-create-user logic as the web's redirect-flow callback, so a
     * device that has already signed in on web with the same Google account
     * lands on the identical account here.
     */
    @POST("api/auth/oauth/google/token")
    suspend fun googleToken(@Body request: GoogleTokenRequest): ApiEnvelope<AuthUserResponse>
}

@Serializable
data class GoogleTokenRequest(
    val idToken: String
)

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
    val rankTier: String? = null,
    // Match record (Phase 6a) — publicUser() (apps/server/src/auth/service.ts)
    // includes these on every /api/auth/me response; ProfilePage.tsx reads
    // them directly off useAuthStore().me for its stat tiles/achievements.
    // Declared here (were previously silently dropped by ignoreUnknownKeys)
    // rather than re-derived from a second endpoint.
    val wins: Int = 0,
    val losses: Int = 0,
    val draws: Int = 0,
    val streak: Int = 0,
    // Equipped cosmetics (Phase 5) — publicUser() carries the equipped item
    // IDS for board/skin/frame, and the equipped AVATAR's assetKey on
    // avatarUrl (the server persists an avatar equip as its assetKey — see
    // apps/server/src/modules/users.ts PATCH /users/me/equip). Equipped state
    // in the Store/Inventory UIs derives from these account fields, exactly
    // like apps/web InventoryPage.tsx — NOT from InventoryItem.equipped,
    // which the equip route never touches.
    val avatarUrl: String? = null,
    val frameId: String? = null,
    val equippedBoard: String? = null,
    val equippedSkin: String? = null
)
