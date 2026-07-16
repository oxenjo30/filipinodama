package com.filipinodama.app.data.social

import com.filipinodama.app.data.apiErrorFrom

import com.filipinodama.app.data.ApiClient
import com.filipinodama.app.data.ApiEnvelope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * BlockRepository — server-authoritative client for player blocking (UGC
 * safety), matching this scaffold's singleton-object convention (see
 * [FriendsRepository]). blocks.ts's success bodies are envelope-wrapped
 * (`ok({ data })`), same as FriendsApi, so we unwrap `envelope.ok`/`.data`
 * the same way [FriendsRepository] does.
 */
object BlockRepository {

    private val api: BlockApi by lazy { ApiClient.create<BlockApi>() }

    /** Also drop the just-blocked id from local state so guild/DM lists update immediately. */
    private val _blockedIds = MutableStateFlow<Set<String>>(emptySet())
    val blockedIds: StateFlow<Set<String>> = _blockedIds.asStateFlow()

    suspend fun block(userId: String): SocialResult<Unit> {
        return try {
            val envelope = api.block(BlockRequest(userId))
            if (envelope.ok) {
                _blockedIds.value = _blockedIds.value + userId
                SocialResult.Success(Unit)
            } else {
                val error = envelope.error
                SocialResult.Failure(error?.code ?: "UNKNOWN", error?.message ?: "Something went wrong. Please try again.")
            }
        } catch (e: Exception) {
            val apiError = apiErrorFrom(e)
            if (apiError != null) SocialResult.Failure(apiError.code, apiError.message)
            else SocialResult.Failure("NETWORK_ERROR", "Couldn't reach the server. Check your connection and try again.")
        }
    }

    suspend fun unblock(userId: String): SocialResult<Unit> {
        return try {
            val envelope = api.unblock(userId)
            if (envelope.ok) {
                _blockedIds.value = _blockedIds.value - userId
                SocialResult.Success(Unit)
            } else {
                val error = envelope.error
                SocialResult.Failure(error?.code ?: "UNKNOWN", error?.message ?: "Something went wrong. Please try again.")
            }
        } catch (e: Exception) {
            val apiError = apiErrorFrom(e)
            if (apiError != null) SocialResult.Failure(apiError.code, apiError.message)
            else SocialResult.Failure("NETWORK_ERROR", "Couldn't reach the server. Check your connection and try again.")
        }
    }

    suspend fun list(): SocialResult<BlockListResponse> {
        return try {
            val envelope = api.list()
            if (envelope.ok && envelope.data != null) {
                _blockedIds.value = envelope.data.blocked.map { it.id }.toSet()
                SocialResult.Success(envelope.data)
            } else {
                val error = envelope.error
                SocialResult.Failure(error?.code ?: "UNKNOWN", error?.message ?: "Something went wrong. Please try again.")
            }
        } catch (e: Exception) {
            val apiError = apiErrorFrom(e)
            if (apiError != null) SocialResult.Failure(apiError.code, apiError.message)
            else SocialResult.Failure("NETWORK_ERROR", "Couldn't reach the server. Check your connection and try again.")
        }
    }

    /** Test/teardown hook. */
    fun hardReset() {
        _blockedIds.value = emptySet()
    }
}
