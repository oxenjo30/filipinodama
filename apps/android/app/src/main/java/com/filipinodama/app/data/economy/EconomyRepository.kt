package com.filipinodama.app.data.economy

import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.ApiClient
import com.filipinodama.app.data.ApiEnvelope

/**
 * EconomyRepository — server-authoritative client for Phase 5's economy
 * surfaces (Store, Wallet/Inventory, Orders, Daily Rewards, Quests, Season),
 * matching this scaffold's singleton-object convention (see [AuthRepository],
 * [com.filipinodama.app.data.rooms.RoomRepository]) rather than a DI
 * framework or ViewModel.
 *
 * Unlike MatchRepository/RoomRepository this surface is plain REST (no
 * socket), so there is no StateFlow "live snapshot" here — each screen owns
 * its own request/response state via a small state machine
 * ([BuyState]/[ClaimState] below) and calls straight through to these
 * suspend functions, mirroring how apps/web's StorePage/QuestsPage/
 * SeasonPage/OrdersPage/DailyLoginBonusModal each independently call `api.*`.
 *
 * Every action returns an [EconomyResult] so callers can branch on success vs
 * a real server error message — never a fabricated one. On a successful
 * purchase/claim we also patch [AuthRepository]'s cached balances so the Home
 * currency header and every other screen reading AuthRepository.state stay in
 * sync without a full re-fetch of /api/auth/me.
 *
 * HARD POLICY: no diamond top-up / payments calls exist anywhere in this
 * repository — Android is earned-currency only regardless of the server's
 * diamondTopUp flag (see task boundaries / EconomyDtos.kt header).
 */
object EconomyRepository {

    private val api: EconomyApi by lazy { ApiClient.create<EconomyApi>() }

    // ── Store ──

    suspend fun storeItems(): EconomyResult<StoreItemsResponse> =
        call { api.storeItems() }

    suspend fun purchase(itemId: String): EconomyResult<PurchaseResponse> {
        val result = call { api.purchase(PurchaseRequest(itemId)) }
        if (result is EconomyResult.Success) {
            patchBalances(gold = result.data.balances.gold, diamonds = result.data.balances.diamonds)
        }
        return result
    }

    suspend fun equip(request: EquipRequest): EconomyResult<Unit> =
        call { api.equip(request) }

    // ── Inventory / owned items — sourced from purchase history is not
    // enough (owned != purchased-this-session); the app derives "owned" from
    // GET /store/items (catalog) + a purchase's InventoryItem, matching the
    // web client's use of the GDPR export for ownership. We expose orders()
    // only; inventory ownership is tracked client-side per StoreScreen after
    // each successful purchase (see StoreScreen kdoc) since there is no
    // dedicated GET /inventory REST route in this server build.

    // ── Orders / purchase history ──

    suspend fun orders(): EconomyResult<OrdersResponse> =
        call { api.orders() }

    // ── Daily login rewards ──

    suspend fun dailyLoginStatus(): EconomyResult<DailyLoginStatusResponse> =
        call { api.dailyLoginStatus() }

    suspend fun claimDailyLogin(): EconomyResult<DailyLoginClaimResponse> {
        val result = call { api.claimDailyLogin() }
        if (result is EconomyResult.Success) {
            val gems = result.data.gemsBalance
            patchBalances(gold = result.data.goldBalance, diamonds = gems)
        }
        return result
    }

    // ── Quests ──

    suspend fun quests(): EconomyResult<QuestsResponse> =
        call { api.quests() }

    suspend fun claimQuest(id: String): EconomyResult<QuestClaimResponse> {
        val result = call { api.claimQuest(id) }
        if (result is EconomyResult.Success) {
            patchBalances(gold = result.data.goldBalance, diamonds = null)
        }
        return result
    }

    // ── Season ──

    suspend fun seasonCurrent(): EconomyResult<SeasonCurrentResponse> =
        call { api.seasonCurrent() }

    suspend fun claimSeasonTier(tier: Int): EconomyResult<SeasonClaimResponse> =
        call { api.claimSeasonTier(SeasonClaimRequest(tier)) }

    suspend fun buySeasonPass(): EconomyResult<SeasonPassResponse> {
        val result = call { api.buySeasonPass() }
        if (result is EconomyResult.Success) {
            val data = result.data
            if (data.currency == "DIAMONDS") patchBalances(gold = null, diamonds = data.balance)
            else patchBalances(gold = data.balance, diamonds = null)
        }
        return result
    }

    // ── Home hub: continue-playing ──

    suspend fun activeMatch(): EconomyResult<ActiveMatchResponse> =
        call { api.activeMatch() }

    // ---- internals ----

    /** Reflects a fresh server balance into AuthRepository's cached session user (nullable = leave unchanged). */
    private fun patchBalances(gold: Int?, diamonds: Int?) {
        val current = AuthRepository.state.value.user ?: return
        val updated = current.copy(
            gold = gold ?: current.gold,
            diamonds = diamonds ?: current.diamonds
        )
        AuthRepository.patchUser(updated)
    }

    private suspend fun <T> call(block: suspend () -> ApiEnvelope<T>): EconomyResult<T> {
        return try {
            val envelope = block()
            if (envelope.ok && envelope.data != null) {
                EconomyResult.Success(envelope.data)
            } else {
                val error = envelope.error
                EconomyResult.Failure(error?.code ?: "UNKNOWN", error?.message ?: "Something went wrong. Please try again.")
            }
        } catch (e: Exception) {
            EconomyResult.Failure("NETWORK_ERROR", "Couldn't reach the server. Check your connection and try again.")
        }
    }
}

/** Outcome of a single economy call — carries the server's own message on failure, never a fabricated one. */
sealed class EconomyResult<out T> {
    data class Success<T>(val data: T) : EconomyResult<T>()
    data class Failure(val code: String, val message: String) : EconomyResult<Nothing>()
}
