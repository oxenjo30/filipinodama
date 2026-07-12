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
    val context: String, // "dm" | "profile"
    val messageId: String? = null
)

@Serializable
data class ReportResponse(
    val id: String
)

/** The six report reasons, mirrors ReportPlayerModal.tsx's REASONS exactly. */
val REPORT_REASONS: List<Pair<String, String>> = listOf(
    "HARASSMENT" to "Harassment / abuse",
    "HATE_SPEECH" to "Hate speech",
    "CHEATING" to "Cheating",
    "INAPPROPRIATE" to "Inappropriate name / avatar",
    "SPAM" to "Spam",
    "OTHER" to "Other"
)
