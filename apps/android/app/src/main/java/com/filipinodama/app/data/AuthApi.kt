package com.filipinodama.app.data

import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

/**
 * Retrofit interface for the auth endpoints in API_SPEC.md. Signatures
 * only — request/response shapes are minimal placeholders since the real
 * shape isn't needed until Phase 2 UI wiring. NOT called from any UI yet.
 */
interface AuthApi {

    @POST("api/auth/login")
    suspend fun login(@Body request: LoginRequest): ApiEnvelope<AuthUser>

    @POST("api/auth/guest")
    suspend fun guest(): ApiEnvelope<AuthUser>

    @POST("api/auth/refresh")
    suspend fun refresh(): ApiEnvelope<Unit>

    @GET("api/auth/me")
    suspend fun me(): ApiEnvelope<AuthUser>
}

@Serializable
data class LoginRequest(
    val email: String,
    val password: String
)

/** Placeholder shape — expand once Phase 2 wires real profile/balance data. */
@Serializable
data class AuthUser(
    val id: String,
    val email: String? = null,
    val username: String? = null
)
