package com.filipinodama.app.data.economy

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Serialization round-trip tests using REAL payload JSON shapes verified
 * against the server modules during Phase 5 research:
 *   apps/server/src/modules/store.ts, rewards.ts, quests.ts, seasons.ts,
 *   matches.ts (GET /matches/active).
 */
class EconomyDtoSerializationTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    @Test
    fun `store items response decodes groups and flat items with nullable prices`() {
        val raw = """
            {"groups":[{"type":"BOARD","items":[{"id":"board-ebony","type":"BOARD","name":"Imperial Ebony Board","description":null,"priceGold":1200,"priceDiamonds":null,"salePrice":null,"onSale":false,"featured":true,"assetKey":"ebony.png","previewKey":null,"tag":"NEW","isPremium":false,"sortOrder":0}]}],
             "items":[{"id":"board-ebony","type":"BOARD","name":"Imperial Ebony Board","description":null,"priceGold":1200,"priceDiamonds":null,"salePrice":null,"onSale":false,"featured":true,"assetKey":"ebony.png","previewKey":null,"tag":"NEW","isPremium":false,"sortOrder":0}]}
        """.trimIndent()

        val dto = json.decodeFromString<StoreItemsResponse>(raw)

        assertEquals(1, dto.groups.size)
        assertEquals("BOARD", dto.groups[0].type)
        assertEquals(1200, dto.items[0].priceGold)
        assertNull(dto.items[0].priceDiamonds)
        assertEquals("NEW", dto.items[0].tag)
    }

    @Test
    fun `purchase response decodes balances and inventory item`() {
        val raw = """
            {"itemId":"board-ebony","currency":"GOLD","balance":800,
             "balances":{"gold":800,"diamonds":50,"trophies":1340},
             "inventoryItem":{"id":"inv1","userId":"u1","itemId":"board-ebony","equipped":false,"acquiredAt":"2026-07-12T00:00:00.000Z"}}
        """.trimIndent()

        val dto = json.decodeFromString<PurchaseResponse>(raw)

        assertEquals("GOLD", dto.currency)
        assertEquals(800, dto.balances.gold)
        assertEquals(50, dto.balances.diamonds)
        assertEquals("board-ebony", dto.inventoryItem?.itemId)
        assertFalse(dto.inventoryItem!!.equipped)
    }

    @Test
    fun `orders response merges item and topup receipts`() {
        val raw = """
            {"orders":[
               {"id":"o1","kind":"item","createdAt":"2026-07-01T00:00:00.000Z","currency":"GOLD","total":500,"method":"Gold Balance","items":[{"name":"Crimson Legion Pieces","price":500}],"creditedDiamonds":null},
               {"id":"p1","kind":"topup","createdAt":"2026-06-20T00:00:00.000Z","currency":"PHP","total":14900,"method":"GCash / Maya / Card","items":[{"name":"250 Diamonds — top-up","price":14900}],"creditedDiamonds":270}
             ],
             "receipts":[
               {"id":"o1","kind":"item","createdAt":"2026-07-01T00:00:00.000Z","currency":"GOLD","total":500,"method":"Gold Balance","items":[{"name":"Crimson Legion Pieces","price":500}],"creditedDiamonds":null},
               {"id":"p1","kind":"topup","createdAt":"2026-06-20T00:00:00.000Z","currency":"PHP","total":14900,"method":"GCash / Maya / Card","items":[{"name":"250 Diamonds — top-up","price":14900}],"creditedDiamonds":270}
             ]}
        """.trimIndent()

        val dto = json.decodeFromString<OrdersResponse>(raw)

        assertEquals(2, dto.receipts.size)
        assertEquals("item", dto.receipts[0].kind)
        assertEquals("topup", dto.receipts[1].kind)
        assertEquals(270, dto.receipts[1].creditedDiamonds)
        assertNull(dto.receipts[0].creditedDiamonds)
    }

    @Test
    fun `daily login status decodes trackFull with gold gem and chest rows`() {
        val raw = """
            {"day":3,"claimedToday":false,"rewardToday":200,"rewardGemsToday":0,
             "track":[100,150,200,300,400,500,1000],
             "trackFull":[
               {"type":"gold","amt":100},
               {"type":"gold","amt":150},
               {"type":"gold","amt":200},
               {"type":"gold","amt":300},
               {"type":"gold","amt":400},
               {"type":"gold","amt":500},
               {"type":"chest","gold":1000,"gem":0}
             ],"streak":2}
        """.trimIndent()

        val dto = json.decodeFromString<DailyLoginStatusResponse>(raw)

        assertEquals(3, dto.day)
        assertFalse(dto.claimedToday)
        assertEquals(7, dto.trackFull.size)
        assertEquals("chest", dto.trackFull[6].type)
        assertEquals(1000, dto.trackFull[6].gold)
        assertEquals(0, dto.trackFull[6].gem)
    }

    @Test
    fun `daily login status decodes a gem day row (admin-configured ladder)`() {
        val raw = """
            {"day":3,"claimedToday":false,"rewardToday":0,"rewardGemsToday":10,
             "track":[100,150,0,300,400,500,1000],
             "trackFull":[
               {"type":"gold","amt":100},
               {"type":"gold","amt":150},
               {"type":"gem","amt":10},
               {"type":"gold","amt":300},
               {"type":"gold","amt":400},
               {"type":"gold","amt":500},
               {"type":"chest","gold":1000,"gem":0}
             ],"streak":2}
        """.trimIndent()

        val dto = json.decodeFromString<DailyLoginStatusResponse>(raw)

        assertEquals("gem", dto.trackFull[2].type)
        assertEquals(10, dto.trackFull[2].amt)
        assertEquals(10, dto.rewardGemsToday)
    }

    @Test
    fun `quests response splits daily and seasonal with claim flags`() {
        val raw = """
            {"daily":[{"id":"q1","scope":"daily","title":"Win 3 Matches","description":"Win any 3 matches today","goal":3,"rewardGold":150,"value":1,"completed":false,"claimed":false,"claimable":false}],
             "seasonal":[{"id":"q2","scope":"seasonal","title":"Reach Datu II","description":null,"goal":1500,"rewardGold":1000,"value":1500,"completed":true,"claimed":false,"claimable":true}]}
        """.trimIndent()

        val dto = json.decodeFromString<QuestsResponse>(raw)

        assertEquals(1, dto.daily.size)
        assertEquals(1, dto.seasonal.size)
        assertFalse(dto.daily[0].claimable)
        assertTrue(dto.seasonal[0].claimable)
        assertTrue(dto.seasonal[0].completed)
    }

    @Test
    fun `season current decodes tiers with free and premium rewards`() {
        val raw = """
            {"season":{"id":"s1","name":"Season of the Rajah","startsAt":"2026-06-01T00:00:00.000Z","endsAt":"2026-08-01T00:00:00.000Z"},
             "hasPass":false,"passPrice":9000,"passCurrency":"GOLD","xp":1200,
             "tiers":[
               {"tier":1,"xp":0,"freeReward":{"gold":100},"premiumReward":{"gold":200,"diamonds":10},"unlocked":true,"claimed":true},
               {"tier":2,"xp":1500,"freeReward":{"gold":150},"premiumReward":null,"unlocked":false,"claimed":false}
             ]}
        """.trimIndent()

        val dto = json.decodeFromString<SeasonCurrentResponse>(raw)

        assertEquals("GOLD", dto.passCurrency)
        assertEquals(9000, dto.passPrice)
        assertEquals(2, dto.tiers.size)
        assertEquals(100, dto.tiers[0].freeReward?.gold)
        assertEquals(10, dto.tiers[0].premiumReward?.diamonds)
        assertFalse(dto.tiers[1].unlocked)
        assertNull(dto.tiers[1].premiumReward)
    }

    @Test
    fun `active match response decodes a live match with both players`() {
        val raw = """
            {"match":{"id":"m1","mode":"RANKED","startedAt":"2026-07-12T10:00:00.000Z",
               "red":{"id":"u1","username":"datu","displayName":"Datu Rico","tag":"#0001","avatarUrl":null,"rankTier":"DATU_III","trophies":1340},
               "blue":{"id":"u2","username":"ermi","displayName":"Ermitanyo","tag":"#4821","avatarUrl":null,"rankTier":"KABALYERO_II","trophies":1290}}}
        """.trimIndent()

        val dto = json.decodeFromString<ActiveMatchResponse>(raw)

        assertEquals("m1", dto.match?.id)
        assertEquals("RANKED", dto.match?.mode)
        assertEquals("Datu Rico", dto.match?.red?.displayName)
        assertEquals("Ermitanyo", dto.match?.blue?.displayName)
    }

    @Test
    fun `active match response decodes null match honestly (no active game)`() {
        val dto = json.decodeFromString<ActiveMatchResponse>("""{"match":null}""")
        assertNull(dto.match)
    }

    @Test
    fun `users me export decodes only the inventory array ignoring the rest of the GDPR dump`() {
        // Real export shape (apps/server/src/modules/users.ts GET /users/me/export):
        // inventory is raw prisma.inventoryItem rows; account/ledger/orders/... are
        // present but ignored via ignoreUnknownKeys. The "classic" row below is a
        // GRANTED starter (no matching order anywhere) — ownership must still see it.
        val raw = """
            {"exportedAt":"2026-07-12T00:00:00.000Z",
             "account":{"id":"u1","username":"datu","gold":800,"diamonds":50},
             "ledger":[{"id":"l1","userId":"u1","currency":"GOLD","amount":-500}],
             "inventory":[
               {"id":"inv1","userId":"u1","itemId":"classic","equipped":false,"acquiredAt":"2026-06-01T00:00:00.000Z"},
               {"id":"inv2","userId":"u1","itemId":"board-ebony","equipped":false,"acquiredAt":"2026-07-01T00:00:00.000Z"}
             ],
             "orders":[{"id":"o1","userId":"u1","items":[{"name":"Imperial Ebony Board","price":500}],"currency":"GOLD","total":500,"status":"completed","createdAt":"2026-07-01T00:00:00.000Z"}],
             "payments":[],"friendships":[],"friendRequests":{"sent":[],"received":[]},
             "guildMembership":null,"questProgress":[],"seasonProgress":[],"notifications":[],"matches":[]}
        """.trimIndent()

        val dto = json.decodeFromString<UserExportResponse>(raw)

        assertEquals(2, dto.inventory.size)
        assertEquals("classic", dto.inventory[0].itemId)
        assertEquals("board-ebony", dto.inventory[1].itemId)
    }

    @Test
    fun `equip response decodes the returned publicProfile equipped fields`() {
        val raw = """
            {"user":{"id":"u1","username":"datu","displayName":"Datu Rico","tag":"#0001",
              "equippedBoard":"board-ebony","equippedSkin":"skin-crimson","frameId":null,
              "avatarUrl":"avatars/sovereign.png","trophies":1340}}
        """.trimIndent()

        val dto = json.decodeFromString<EquipResponse>(raw)

        assertEquals("board-ebony", dto.user.equippedBoard)
        assertEquals("skin-crimson", dto.user.equippedSkin)
        assertNull(dto.user.frameId)
        assertEquals("avatars/sovereign.png", dto.user.avatarUrl)
    }
}
