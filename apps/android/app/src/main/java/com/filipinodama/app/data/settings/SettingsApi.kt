package com.filipinodama.app.data.settings

import com.filipinodama.app.data.ApiEnvelope
import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST

/**
 * Retrofit interface for the account-management + support-ticket endpoints
 * this Settings screen needs, matching the server routes exactly:
 *   - DELETE /api/users/me            (apps/server/src/modules/users.ts)
 *   - GET    /api/users/me/export     (same file — reused for "Export My Data")
 *   - POST   /api/support/tickets     (apps/server/src/modules/support.ts)
 *   - GET    /api/support/tickets     (same file)
 *
 * Export's response shape is intentionally NOT modeled field-by-field here
 * (it's a broad GDPR dump the web client only re-serializes as a downloaded
 * JSON blob, never renders) — kotlinx.serialization's JsonElement captures
 * whatever the server returns without over-committing to a schema the
 * client doesn't otherwise consume, matching how ContactPage.tsx / users.ts
 * treat it as an opaque export.
 */
interface SettingsApi {

    @DELETE("api/users/me")
    suspend fun deleteAccount(@Body request: DeleteAccountRequest): ApiEnvelope<DeleteAccountResponse>

    @GET("api/users/me/export")
    suspend fun exportData(): ApiEnvelope<kotlinx.serialization.json.JsonElement>

    @POST("api/support/tickets")
    suspend fun createTicket(@Body request: CreateTicketRequest): ApiEnvelope<CreateTicketResponse>

    @GET("api/support/tickets")
    suspend fun myTickets(): ApiEnvelope<MyTicketsResponse>
}

@Serializable
data class DeleteAccountRequest(val confirm: String)

@Serializable
data class DeleteAccountResponse(val deleted: Boolean, val deletedAt: String)

/** Category enum matches apps/server/src/modules/support.ts bodySchema exactly. */
@Serializable
data class CreateTicketRequest(
    val category: String,
    val subject: String,
    val message: String
)

@Serializable
data class CreateTicketResponse(val id: String)

@Serializable
data class TicketSummary(
    val id: String,
    val subject: String,
    val category: String,
    val status: String,
    val priority: String,
    val createdAt: String,
    val updatedAt: String,
    val msgCount: Int
)

@Serializable
data class MyTicketsResponse(val items: List<TicketSummary> = emptyList())
