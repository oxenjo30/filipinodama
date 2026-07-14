package com.filipinodama.app.data

import kotlinx.serialization.json.Json
import retrofit2.HttpException

/**
 * Extracts the server's real {ok:false, error:{code, message}} envelope from a
 * failed request so the UI can show the ACTUAL reason instead of a generic
 * "couldn't reach the server".
 *
 * Why this exists: the Retrofit APIs declare their return type as the payload
 * directly (e.g. `suspend fun purchase(): ApiEnvelope<...>`), NOT `Response<...>`.
 * With that shape Retrofit throws [HttpException] on any non-2xx status instead
 * of deserializing the body — so a 400 "Not enough gold" (a perfectly normal,
 * user-facing outcome) used to land in each repository's generic
 * `catch (e: Exception) -> NETWORK_ERROR` branch and be reported as a
 * connectivity failure. That mislabels every 4xx across the economy/social/
 * profile flows (insufficient funds, already owned, validation, rate limits…).
 *
 * [apiErrorFrom] returns the parsed [ApiError] when the throwable is an
 * [HttpException] carrying a JSON error envelope, or null when it's a genuine
 * transport failure (no HTTP response at all — DNS, timeout, TLS, offline), in
 * which case the caller should fall back to its network-error message.
 */
private val errorJson = Json {
    ignoreUnknownKeys = true
    isLenient = true
}

fun apiErrorFrom(e: Throwable): ApiError? {
    val http = e as? HttpException ?: return null
    val body = runCatching { http.response()?.errorBody()?.string() }.getOrNull()
    if (body.isNullOrBlank()) {
        // We DID get an HTTP status but no parseable body — still better than a
        // network-error message. Surface the status so the user sees a real code.
        return ApiError(code = "HTTP_${http.code()}", message = "Request failed (${http.code()}). Please try again.")
    }
    // Body present: parse the standard envelope's error object.
    val parsed = runCatching { errorJson.decodeFromString<ApiEnvelope<Unit>>(body) }.getOrNull()
    parsed?.error?.let { return it }
    return ApiError(code = "HTTP_${http.code()}", message = "Request failed (${http.code()}). Please try again.")
}
