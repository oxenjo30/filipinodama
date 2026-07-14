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

/**
 * Report reasons — mockup `reportCats` (Mobile.dc.html): exact 5-item list,
 * order, labels, and default (Cheating first/default). Server enum values
 * (HARASSMENT | HATE_SPEECH | CHEATING | INAPPROPRIATE | SPAM | OTHER) are
 * unchanged; the mockup's 5 UI reasons map onto the valid server values
 * ("Offensive name" → INAPPROPRIATE). HATE_SPEECH stays a valid server value
 * but isn't surfaced as its own row per the mockup.
 */
val REPORT_REASONS: List<Pair<String, String>> = listOf(
    "CHEATING" to "Cheating / bot",
    "HARASSMENT" to "Harassment / abuse",
    "INAPPROPRIATE" to "Offensive name",
    "SPAM" to "Spam",
    "OTHER" to "Other"
)
