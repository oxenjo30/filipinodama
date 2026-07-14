package com.filipinodama.app.data.social

import com.filipinodama.app.data.apiErrorFrom

import com.filipinodama.app.data.ApiClient

/** ReportRepository — server-authoritative client for player reports (Phase 6b). */
object ReportRepository {

    private val api: ReportApi by lazy { ApiClient.create<ReportApi>() }

    suspend fun submit(
        accusedId: String,
        reason: String,
        note: String?,
        context: String,
        messageId: String? = null
    ): SocialResult<ReportResponse> {
        return try {
            val envelope = api.submit(ReportBody(accusedId = accusedId, reason = reason, note = note, context = context, messageId = messageId))
            if (envelope.ok && envelope.data != null) {
                SocialResult.Success(envelope.data)
            } else {
                val error = envelope.error
                val message = when (error?.code) {
                    "ALREADY_REPORTED" -> "You've already reported this player."
                    else -> error?.message ?: "Couldn't submit report."
                }
                SocialResult.Failure(error?.code ?: "UNKNOWN", message)
            }
        } catch (e: Exception) {
            // Surface the server's real 4xx error (validation, permission, etc.)
            // instead of a misleading network message; only true transport
            // failures (no HTTP response) fall back to NETWORK_ERROR.
            val apiError = apiErrorFrom(e)
            if (apiError != null) SocialResult.Failure(apiError.code, apiError.message)
            else SocialResult.Failure("NETWORK_ERROR", "Couldn't reach the server. Check your connection and try again.")
        }
    }
}
