package com.filipinodama.app.data.social

import com.filipinodama.app.data.apiErrorFrom

import com.filipinodama.app.data.ApiClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * BlockRepository — server-authoritative client for player blocking (UGC
 * safety), matching this scaffold's singleton-object convention (see
 * [FriendsRepository]). blocks.ts's success bodies are raw (not
 * envelope-wrapped, see [BlockApi]'s kdoc), so unlike FriendsRepository we
 * don't check an `envelope.ok` flag on the happy path — a non-2xx response
 * throws (caught below) and a 2xx response is always success.
 */
object BlockRepository {

    private val api: BlockApi by lazy { ApiClient.create<BlockApi>() }

    /** Also drop the just-blocked id from local state so guild/DM lists update immediately. */
    private val _blockedIds = MutableStateFlow<Set<String>>(emptySet())
    val blockedIds: StateFlow<Set<String>> = _blockedIds.asStateFlow()

    suspend fun block(userId: String): SocialResult<Unit> {
        return try {
            api.block(BlockRequest(userId))
            _blockedIds.value = _blockedIds.value + userId
            SocialResult.Success(Unit)
        } catch (e: Exception) {
            val apiError = apiErrorFrom(e)
            if (apiError != null) SocialResult.Failure(apiError.code, apiError.message)
            else SocialResult.Failure("NETWORK_ERROR", "Couldn't reach the server. Check your connection and try again.")
        }
    }

    suspend fun unblock(userId: String): SocialResult<Unit> {
        return try {
            api.unblock(userId)
            _blockedIds.value = _blockedIds.value - userId
            SocialResult.Success(Unit)
        } catch (e: Exception) {
            val apiError = apiErrorFrom(e)
            if (apiError != null) SocialResult.Failure(apiError.code, apiError.message)
            else SocialResult.Failure("NETWORK_ERROR", "Couldn't reach the server. Check your connection and try again.")
        }
    }

    suspend fun list(): SocialResult<BlockListResponse> {
        return try {
            val response = api.list()
            _blockedIds.value = response.blocked.map { it.id }.toSet()
            SocialResult.Success(response)
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
