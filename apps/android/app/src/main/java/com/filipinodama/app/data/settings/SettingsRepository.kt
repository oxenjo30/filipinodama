package com.filipinodama.app.data.settings

import com.filipinodama.app.data.ApiClient
import com.filipinodama.app.data.ApiEnvelope
import com.filipinodama.app.data.AuthRepository
import kotlinx.serialization.json.JsonElement

/**
 * Account-management actions for the Settings screen: Export My Data, Delete
 * Account, Contact Support (file a ticket) + My Tickets — a 1:1 mirror of
 * apps/web SettingsPage.tsx's account actions and ContactPage.tsx's
 * authenticated-filer ticket flow.
 *
 * Delete Account reproduces the web contract EXACTLY: `DELETE /api/users/me`
 * with body `{ confirm: "DELETE" }` (users.ts `deleteAccountSchema`) — the
 * server soft-deletes (sets deletedAt) and kills every refresh session
 * server-side, so the client's job after a successful delete is simply to
 * wipe local session state (same as [AuthRepository.logout]) and navigate
 * away; there is no separate "confirm deletion" round trip beyond this one
 * call, matching SettingsPage.tsx's confirmDelete().
 */
object SettingsRepository {

    private val api: SettingsApi by lazy { ApiClient.create<SettingsApi>() }

    suspend fun exportData(): SettingsResult<JsonElement> = call { api.exportData() }

    /**
     * Deletes the account. On success, wipes local session state (cookies,
     * secure-store session flags, in-memory AuthRepository state) exactly
     * like a normal sign-out — the server has already killed every session
     * row, so a stale local session is the only thing left to clear.
     */
    suspend fun deleteAccount(): SettingsResult<DeleteAccountResponse> {
        val result = call { api.deleteAccount(DeleteAccountRequest(confirm = "DELETE")) }
        if (result is SettingsResult.Success) {
            AuthRepository.logout()
        }
        return result
    }

    suspend fun createTicket(category: String, subject: String, message: String): SettingsResult<CreateTicketResponse> =
        call { api.createTicket(CreateTicketRequest(category = category, subject = subject, message = message)) }

    suspend fun myTickets(): SettingsResult<MyTicketsResponse> = call { api.myTickets() }

    private suspend fun <T> call(block: suspend () -> ApiEnvelope<T>): SettingsResult<T> {
        return try {
            val envelope = block()
            if (envelope.ok && envelope.data != null) {
                SettingsResult.Success(envelope.data)
            } else {
                val error = envelope.error
                SettingsResult.Failure(error?.code ?: "UNKNOWN", error?.message ?: "Something went wrong. Please try again.")
            }
        } catch (e: Exception) {
            SettingsResult.Failure("NETWORK_ERROR", "Couldn't reach the server. Check your connection and try again.")
        }
    }
}

sealed class SettingsResult<out T> {
    data class Success<T>(val data: T) : SettingsResult<T>()
    data class Failure(val code: String, val message: String) : SettingsResult<Nothing>()
}
