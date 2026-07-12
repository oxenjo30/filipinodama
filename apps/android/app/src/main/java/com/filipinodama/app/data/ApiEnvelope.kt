package com.filipinodama.app.data

import kotlinx.serialization.Serializable

/**
 * Standard response envelope per API_SPEC.md:
 * `{ ok: true, data }` or `{ ok: false, error: { code, message } }`.
 */
@Serializable
data class ApiEnvelope<T>(
    val ok: Boolean,
    val data: T? = null,
    val error: ApiError? = null
)

@Serializable
data class ApiError(
    val code: String,
    val message: String
)
