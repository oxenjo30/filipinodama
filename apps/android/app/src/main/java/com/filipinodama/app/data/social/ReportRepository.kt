package com.filipinodama.app.data.social

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
            SocialResult.Failure("NETWORK_ERROR", "Couldn't reach the server. Check your connection and try again.")
        }
    }
}
