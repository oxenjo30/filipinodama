package com.filipinodama.app.data.social

import com.filipinodama.app.data.ApiEnvelope
import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.POST

/**
 * Report-a-player, matching apps/server/src/modules/reports.ts exactly
 * (POST /api/reports) — mirrors apps/web ReportPlayerModal.tsx's contract.
 */
interface ReportApi {
    @POST("api/reports")
    suspend fun submit(@Body body: ReportBody): ApiEnvelope<ReportResponse>
}

@Serializable
data class ReportBody(
    val accusedId: String,
    val reason: String, // HARASSMENT | HATE_SPEECH | CHEATING | INAPPROPRIATE | SPAM | OTHER
    val note: String? = null,
    val context: String, // "dm" | "profile" | "guild"
    val messageId: String? = null
)

@Serializable
data class ReportResponse(
    val id: String
)

/**
 * Report reasons — full parity with the server enum and apps/web's
 * ReportPlayerModal (6 values: HARASSMENT | HATE_SPEECH | CHEATING |
 * INAPPROPRIATE | SPAM | OTHER). Hate Speech is now surfaced as its own row so
 * a mobile user can report it (previously mobile omitted it — a real gap, since
 * a user could not report hate speech at all from the app). Default stays
 * Cheating first (mobile's long-standing default). "Offensive name" maps to the
 * server's INAPPROPRIATE value.
 */
val REPORT_REASONS: List<Pair<String, String>> = listOf(
    "CHEATING" to "Cheating / bot",
    "HARASSMENT" to "Harassment / abuse",
    "HATE_SPEECH" to "Hate speech",
    "INAPPROPRIATE" to "Offensive name",
    "SPAM" to "Spam",
    "OTHER" to "Other"
)
