package com.filipinodama.app.data.economy

import kotlinx.serialization.Serializable

/**
 * Wire-format DTOs for the economy REST surface (Phase 5), matching the
 * server modules field-for-field:
 *   apps/server/src/modules/store.ts     (GET /store/items, POST /store/purchase, GET /orders)
 *   apps/server/src/modules/rewards.ts   (GET/POST /rewards/daily-login)
 *   apps/server/src/modules/quests.ts    (GET /quests, POST /quests/:id/claim)
 *   apps/server/src/modules/seasons.ts   (GET /season/current, POST /season/claim, POST /season/pass)
 *   apps/server/src/modules/users.ts     (PATCH /users/me/equip)
 *   apps/server/src/modules/matches.ts   (GET /matches/active)
 *
 * ANDROID HARD POLICY: there is deliberately NO DTO/endpoint here for diamond
 * top-up packs or payment checkout (apps/server/src/modules/payments.ts is
 * never called from this app). Android is earned-currency only regardless of
 * the server's diamondTopUp flag — see task boundaries.
 */

// ── Store ──

@Serializable
data class StoreItemDto(
    val id: String,
    val type: String, // BOARD | SKIN | AVATAR | FRAME | EMOTE | BUNDLE | SEASON_PASS
    val name: String,
    val description: String? = null,
    val priceGold: Int? = null,
    val priceDiamonds: Int? = null,
    val salePrice: Int? = null,
    val onSale: Boolean = false,
    val featured: Boolean = false,
    val assetKey: String,
    val previewKey: String? = null,
    val tag: String? = null,
    val isPremium: Boolean = false,
    val sortOrder: Int = 0
)

@Serializable
data class StoreItemGroupDto(
    val type: String,
    val items: List<StoreItemDto> = emptyList()
)

@Serializable
data class StoreItemsResponse(
    val groups: List<StoreItemGroupDto> = emptyList(),
    val items: List<StoreItemDto> = emptyList()
)

@Serializable
data class PurchaseRequest(val itemId: String)

@Serializable
data class PurchaseBalances(
    val gold: Int = 0,
    val diamonds: Int = 0,
    val trophies: Int = 0
)

@Serializable
data class InventoryItemDto(
    val id: String,
    val userId: String,
    val itemId: String,
    val equipped: Boolean = false,
    val acquiredAt: String? = null
)

@Serializable
data class PurchaseResponse(
    val itemId: String,
    val currency: String, // GOLD | DIAMONDS
    val balance: Int = 0,
    val balances: PurchaseBalances = PurchaseBalances(),
    val inventoryItem: InventoryItemDto? = null
)

// ── Orders / purchase history ──

@Serializable
data class ReceiptItemDto(
    val name: String,
    val price: Int,
    val itemId: String? = null
)

@Serializable
data class ReceiptDto(
    val id: String,
    val kind: String, // "item" | "topup"
    val createdAt: String,
    val currency: String, // GOLD | DIAMONDS | PHP
    val total: Int,
    val method: String,
    val items: List<ReceiptItemDto> = emptyList(),
    val creditedDiamonds: Int? = null
)

@Serializable
data class OrdersResponse(
    val orders: List<ReceiptDto> = emptyList(),
    val receipts: List<ReceiptDto> = emptyList()
)

// ── Owned inventory (apps/server/src/modules/users.ts GET /users/me/export) ──
// The GDPR export is the ONLY REST read that exposes the user's InventoryItem
// rows — the same source apps/web StorePage/InventoryPage use for ownership
// (setOwned(new Set(data.inventory.map(i => i.itemId)))). Ownership is keyed
// by itemId and INCLUDES granted items that have no Order rows (e.g. free
// starter cosmetics granted at signup), which a purchase-history-based
// derivation would miss. Only `inventory` is declared here; the rest of the
// export payload (account/ledger/orders/matches/...) is ignored via
// ignoreUnknownKeys.

@Serializable
data class UserExportResponse(
    val inventory: List<InventoryItemDto> = emptyList()
)

// ── Equip (apps/server/src/modules/users.ts PATCH /users/me/equip) ──
// Each slot takes the owned item's ID (validated against InventoryItem.itemId
// server-side); the server itself resolves an avatar item id to its assetKey
// before persisting to User.avatarUrl.

@Serializable
data class EquipRequest(
    val board: String? = null,
    val skin: String? = null,
    val frame: String? = null,
    val avatar: String? = null
)

/** The slice of the equip PATCH's returned publicProfile() we mirror into the session user. */
@Serializable
data class EquippedUserDto(
    val equippedBoard: String? = null,
    val equippedSkin: String? = null,
    val frameId: String? = null,
    val avatarUrl: String? = null
)

@Serializable
data class EquipResponse(
    val user: EquippedUserDto
)

// ── Daily login rewards (apps/server/src/modules/rewards.ts) ──

@Serializable
data class DailyRewardRowDto(
    val type: String, // "gold" | "gem" | "chest"
    val amt: Int? = null,
    val gold: Int? = null,
    val gem: Int? = null
)

@Serializable
data class DailyLoginStatusResponse(
    val day: Int = 1,
    val claimedToday: Boolean = false,
    val rewardToday: Int = 0,
    val rewardGemsToday: Int = 0,
    val track: List<Int> = emptyList(),
    val trackFull: List<DailyRewardRowDto> = emptyList(),
    val streak: Int = 0
)

@Serializable
data class DailyLoginClaimResponse(
    val claimed: Boolean = false,
    val day: Int = 1,
    val rewardGold: Int = 0,
    val rewardGems: Int = 0,
    val goldBalance: Int = 0,
    val gemsBalance: Int? = null,
    val streak: Int = 0
)

// ── Quests (apps/server/src/modules/quests.ts) ──

@Serializable
data class QuestDto(
    val id: String,
    val scope: String, // "daily" | "seasonal" (or any non-daily scope)
    val title: String,
    val description: String? = null,
    val goal: Int,
    val rewardGold: Int,
    val value: Int = 0,
    val completed: Boolean = false,
    val claimed: Boolean = false,
    val claimable: Boolean = false
)

@Serializable
data class QuestsResponse(
    val daily: List<QuestDto> = emptyList(),
    val seasonal: List<QuestDto> = emptyList()
)

@Serializable
data class QuestClaimResponse(
    val claimed: Boolean = false,
    val rewardGold: Int = 0,
    val goldBalance: Int = 0,
    val questId: String = "",
    val value: Int = 0
)

// ── Season (apps/server/src/modules/seasons.ts) ──

@Serializable
data class SeasonRewardDto(
    val gold: Int? = null,
    val diamonds: Int? = null,
    val trophies: Int? = null
)

@Serializable
data class SeasonTierDto(
    val tier: Int,
    val xp: Int,
    val freeReward: SeasonRewardDto? = null,
    val premiumReward: SeasonRewardDto? = null,
    val unlocked: Boolean = false,
    val claimed: Boolean = false
)

@Serializable
data class SeasonInfoDto(
    val id: String,
    val name: String,
    val number: Int? = null,
    val startsAt: String,
    val endsAt: String
)

@Serializable
data class SeasonCurrentResponse(
    val season: SeasonInfoDto,
    val hasPass: Boolean = false,
    val passPrice: Int = 0,
    val passCurrency: String = "GOLD", // GOLD | DIAMONDS
    val xp: Int = 0,
    val tiers: List<SeasonTierDto> = emptyList()
)

@Serializable
data class SeasonClaimRequest(val tier: Int)

@Serializable
data class SeasonClaimResponse(
    val claimed: Boolean = false,
    val tier: Int = 0,
    val freeReward: SeasonRewardDto? = null,
    val premiumReward: SeasonRewardDto? = null,
    val hasPass: Boolean = false
)

@Serializable
data class SeasonPassResponse(
    val hasPass: Boolean = false,
    val currency: String = "GOLD",
    val price: Int = 0,
    val spent: Int = 0,
    val balance: Int = 0
)

// ── Season-end reward (seasons.ts GET /season/end-status, POST /season/end-claim) ──
// When a season has ended a player claims a ONE-TIME bonus scaled to final ladder
// placement. Mirrors apps/web's "Claim All Rewards" end-of-season flow.

/** End-status/end-claim season shape — only {id,name,endsAt} (no startsAt/number). */
@Serializable
data class SeasonEndSeasonDto(
    val id: String,
    val name: String,
    val endsAt: String
)

/** Final placement + reward brackets (seasons.ts seasonEndReward). */
@Serializable
data class SeasonEndRewardDto(
    val rank: Int = 0,
    val gold: Int = 0,
    val diamonds: Int = 0,
    val seasonId: String = ""
)

@Serializable
data class SeasonEndStatusResponse(
    val ended: Boolean = false,
    val season: SeasonEndSeasonDto? = null,
    val claimed: Boolean = false,
    val reward: SeasonEndRewardDto? = null
)

@Serializable
data class SeasonEndClaimResponse(
    val claimed: Boolean = false,
    val reward: SeasonEndRewardDto? = null,
    val goldBalance: Int = 0,
    val diamondBalance: Int = 0
)

// ── Ledger / recent activity (apps/server/src/modules/users.ts GET /users/me/ledger) ──
// Wallet screen's "Recent activity" list — real LedgerEntry rows (gold/diamond
// changes with reason + timestamp + signed amount), the same rows the GDPR
// export's `ledger` array carries. NEVER fabricated: an empty list renders the
// honest "No activity yet" empty state.

@Serializable
data class LedgerEntryDto(
    val id: String,
    val currency: String, // GOLD | DIAMONDS | TROPHIES
    val amount: Int, // signed: positive credit, negative debit
    val balance: Int = 0,
    val reason: String? = null,
    val refType: String? = null,
    val refId: String? = null,
    val createdAt: String
)

@Serializable
data class LedgerResponse(
    val items: List<LedgerEntryDto> = emptyList(),
    val nextCursor: String? = null
)

// ── Active match (apps/server/src/modules/matches.ts GET /matches/active) ──

@Serializable
data class ActiveMatchPlayerDto(
    val id: String,
    val username: String,
    val displayName: String,
    val tag: String,
    val avatarUrl: String? = null,
    val rankTier: String = "",
    val trophies: Int = 0
)

@Serializable
data class ActiveMatchDto(
    val id: String,
    val mode: String, // CASUAL | RANKED | PRIVATE | AI | LOCAL
    val red: ActiveMatchPlayerDto? = null,
    val blue: ActiveMatchPlayerDto? = null,
    val startedAt: String
)

@Serializable
data class ActiveMatchResponse(
    val match: ActiveMatchDto? = null
)
