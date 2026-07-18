package com.filipinodama.app.ui.screens.economy

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Diamond
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.economy.EconomyRepository
import com.filipinodama.app.data.economy.EconomyResult
import com.filipinodama.app.data.economy.ReceiptDto
import com.filipinodama.app.data.economy.ReceiptItemDto
import com.filipinodama.app.data.economy.STORE_TYPE_META
import com.filipinodama.app.data.economy.STORE_TYPE_ORDER
import com.filipinodama.app.data.economy.StoreItemDto
import com.filipinodama.app.data.economy.equipRequestFor
import com.filipinodama.app.data.economy.isItemEquipped
import com.filipinodama.app.data.economy.storeThumbFor
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.components.CurrencyAmount
import com.filipinodama.app.ui.components.CurrencyIconKind
import com.filipinodama.app.ui.components.MockupBackButtonStore
import com.filipinodama.app.ui.components.PullRefreshContainer
import com.filipinodama.app.ui.components.screenInsets
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink2
import kotlinx.coroutines.launch

/**
 * Inventory — mobile-screen-inventory.md SCREEN 11. Owned-items grid grouped
 * by category, each with an Equip/Equipped action, mirroring StoreScreen's
 * item-card visuals.
 *
 * "Owned" comes from GET /api/users/me/export → inventory[] keyed by itemId —
 * the same (and only) REST ownership source apps/web StorePage/InventoryPage
 * use. This INCLUDES granted items with no Order rows (free starter
 * cosmetics), which an order-history derivation would wrongly render as
 * un-owned. Equipped state derives from the real account fields
 * (me.equippedBoard/equippedSkin/frameId/avatarUrl) via [isItemEquipped],
 * exactly like web — never from a client-side tap set.
 */
@Composable
fun InventoryScreen(onBrowseStore: () -> Unit = {}, onBack: () -> Unit = {}) {
    val authState by AuthRepository.state.collectAsState()
    val me = authState.user
    val scope = rememberCoroutineScope()
    var groups by remember { mutableStateOf<Map<String, List<StoreItemDto>>?>(null) } // null = loading

    suspend fun loadInventory() {
        val itemsResult = EconomyRepository.storeItems()
        val inventoryResult = EconomyRepository.ownedInventory()

        val allItems = (itemsResult as? EconomyResult.Success)?.data?.items ?: emptyList()
        val ownedIds = (inventoryResult as? EconomyResult.Success)
            ?.data?.inventory?.map { it.itemId }?.toSet() ?: emptySet()

        val ownedItems = allItems.filter { it.id in ownedIds }
        groups = ownedItems.groupBy { it.type }
    }

    LaunchedEffect(me?.id) { loadInventory() }

    // Count of owned items currently equipped per the real account fields.
    val equippedCount = groups?.values?.flatten()?.count {
        isItemEquipped(it, me?.equippedBoard, me?.equippedSkin, me?.frameId, me?.avatarUrl)
    } ?: 0

    Column(modifier = Modifier.fillMaxSize().screenInsets().background(MaterialTheme.colorScheme.background)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(20.dp, 20.dp, 20.dp, 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                MockupBackButtonStore(onClick = onBack)
                Column {
                    // Mockup eyebrow: "Your Collection" (no stars), color #c9a4ff.
                    Text("Your Collection", color = Color(0xFFC9A4FF), style = MaterialTheme.typography.labelMedium)
                    Text("Inventory", color = Color(0xFFF4ECD6), style = MaterialTheme.typography.headlineSmall)
                }
            }
            Box(
                modifier = Modifier
                    .clickable(onClick = onBrowseStore)
                    .background(Color(0x1AE8B84B), RoundedCornerShape(11.dp))
                    .border(1.dp, Color(0x4DE8B84B), RoundedCornerShape(11.dp))
                    .padding(horizontal = 14.dp, vertical = 9.dp)
            ) { Text("Store", color = Color(0xFFF4D886), style = MaterialTheme.typography.labelMedium) }
        }

        // Pull down to RE-FETCH inventory + catalog from the server (the same
        // loadInventory() the entry LaunchedEffect runs), not a cosmetic spinner.
        PullRefreshContainer(onRefresh = { loadInventory() }) {
        when (val g = groups) {
            null -> Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally
            ) { CircularProgressIndicator(color = Gold) }
            else -> if (g.isEmpty()) {
                EmptyInventoryState(onBrowseStore)
            } else {
                Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp)) {
                    val itemsOwned = g.values.sumOf { it.size }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(bottom = 16.dp)) {
                        StatTile(label = "Items Owned", value = itemsOwned.toString(), valueColor = Color(0xFFF0CF72), modifier = Modifier.weight(1f))
                        StatTile(label = "Equipped", value = equippedCount.toString(), valueColor = Color(0xFF7FE0A3), modifier = Modifier.weight(1f))
                    }
                    // Mockup fixed category order: Boards -> Skins -> Avatars -> Frames
                    // (only categories with count>0 shown), per STORE_TYPE_ORDER.
                    STORE_TYPE_ORDER.filter { g.containsKey(it) }.forEach { type ->
                        val items = g.getValue(type)
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
                            Text(
                                (STORE_TYPE_META[type]?.label ?: type).uppercase(),
                                color = Color(0xFF8B7CAE),
                                style = MaterialTheme.typography.labelMedium,
                                modifier = Modifier.padding(bottom = 10.dp, top = 6.dp)
                            )
                            Text(
                                "${items.size} owned",
                                color = Color(0xFF6F6091),
                                style = MaterialTheme.typography.labelSmall,
                                modifier = Modifier.padding(bottom = 10.dp, top = 6.dp)
                            )
                        }
                        // Reworked 2026-07-18: a DENSER 3-column grid of compact
                        // square tiles (the old 2-col x 165dp cards were oversized
                        // on phones). Tap a tile to equip; a small corner check
                        // marks the equipped one. Cell height ≈ tile (square) +
                        // name line ≈ 118dp.
                        val cols = 3
                        LazyVerticalGrid(
                            columns = GridCells.Fixed(cols),
                            modifier = Modifier.height((((items.size + cols - 1) / cols) * 118).dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            items(items) { item ->
                                InventoryItemCard(
                                    item = item,
                                    // Real account-field equipped state; the equip
                                    // PATCH patches AuthRepository so this
                                    // recomposes when the server confirms.
                                    equipped = isItemEquipped(item, me?.equippedBoard, me?.equippedSkin, me?.frameId, me?.avatarUrl),
                                    onEquip = {
                                        scope.launch {
                                            val request = equipRequestFor(item)
                                            if (request != null) EconomyRepository.equip(request)
                                        }
                                    }
                                )
                            }
                        }
                        Box(Modifier.height(14.dp))
                    }
                }
            }
        }
        } // PullRefreshContainer
    }
}

@Composable
private fun StatTile(label: String, value: String, valueColor: Color, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .background(Color(0xCC1B1030), RoundedCornerShape(13.dp))
            .border(1.dp, Color(0x24E8B84B), RoundedCornerShape(13.dp))
            .padding(13.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(value, color = valueColor, style = MaterialTheme.typography.titleLarge)
        Text(label.uppercase(), color = Color(0xFF8B7CAE), style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun InventoryItemCard(item: StoreItemDto, equipped: Boolean, onEquip: () -> Unit) {
    // Compact tap-to-equip tile (2026-07-18 rework, replaces the oversized
    // per-card "Equip" button). The WHOLE tile is tappable to equip; when
    // equipped it gets a green ring + a small corner check. Denser 3-up grid.
    Column(
        modifier = Modifier
            .clickable(enabled = !equipped, onClick = onEquip)
            .background(
                if (equipped) androidx.compose.ui.graphics.Brush.linearGradient(listOf(Color(0x243FBF6F), Color(0xD91B1030)))
                else androidx.compose.ui.graphics.Brush.linearGradient(listOf(Color(0xCC1B1030), Color(0xCC1B1030))),
                RoundedCornerShape(13.dp)
            )
            .border(1.dp, if (equipped) Color(0xB33FBF6F) else Color(0x24E8B84B), RoundedCornerShape(13.dp))
            .padding(7.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .background(
                    androidx.compose.ui.graphics.Brush.radialGradient(listOf(Color(0xFF2A1740), Color(0xFF160C28))),
                    RoundedCornerShape(10.dp)
                ),
            contentAlignment = Alignment.Center
        ) {
            when (val thumb = storeThumbFor(item)) {
                is com.filipinodama.app.data.economy.StoreThumb.Image -> coil.compose.AsyncImage(
                    model = thumb.url, contentDescription = null, modifier = Modifier.fillMaxSize().padding(9.dp)
                )
                is com.filipinodama.app.data.economy.StoreThumb.Portrait -> coil.compose.AsyncImage(
                    model = thumb.url, contentDescription = null, modifier = Modifier.fillMaxSize().padding(6.dp)
                )
                com.filipinodama.app.data.economy.StoreThumb.Disc -> Box(
                    modifier = Modifier.fillMaxSize(0.6f).background(Color(0xFFA0303A), androidx.compose.foundation.shape.CircleShape)
                )
                else -> {} // Emoji thumbnails removed (no more emote items)
            }
            // Small equipped check in the corner (replaces the big EQUIPPED pill).
            if (equipped) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(4.dp)
                        .size(18.dp)
                        .background(Color(0xF23FBF6F), androidx.compose.foundation.shape.CircleShape),
                    contentAlignment = Alignment.Center
                ) { Text("✓", color = Color(0xFF0A1F12), style = MaterialTheme.typography.labelSmall) }
            }
        }
        Text(
            item.name,
            color = if (equipped) Color(0xFF9BE8B8) else Color(0xFFE6DCF5),
            style = MaterialTheme.typography.labelSmall,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            maxLines = 1,
            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
            modifier = Modifier.fillMaxWidth().padding(top = 5.dp)
        )
    }
}

@Composable
private fun EmptyInventoryState(onBrowseStore: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(imageVector = Icons.Filled.Inventory2, contentDescription = null, tint = Color(0xFFC9A4FF), modifier = Modifier.size(52.dp))
        Text("No items yet", color = GoldLt, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 12.dp))
        Text(
            "Items you buy from the Store will show up here.",
            color = Ink2,
            style = MaterialTheme.typography.bodyMedium,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            modifier = Modifier.padding(top = 6.dp, bottom = 20.dp)
        )
        Box(
            modifier = Modifier.clickable(onClick = onBrowseStore).background(Gold, RoundedCornerShape(10.dp)).padding(horizontal = 24.dp, vertical = 13.dp)
        ) { Text("Browse Store", color = Color(0xFF2A1607), style = MaterialTheme.typography.labelLarge) }
    }
}

/**
 * Purchase History / Orders — mobile-screen-inventory.md SCREEN 13, rebuilt
 * 1:1 against handoffv3/FilipinoDama Mobile.dc.html lines 1062-1124 (Tier-2
 * UI-fidelity pass). The mockup's `purchGroups` deriver (line 4650) buckets
 * `purchaseLog` by calendar day ("Today" / "Yesterday" / "MMM d[, yyyy]"),
 * each group carrying a per-currency total (gold/gem) plus item rows with a
 * thumbnail, name, time, and price. Real GET /api/orders rows (item
 * purchases + settled top-ups merged, matching apps/web OrdersPage.tsx) are
 * grouped the same way here — day bucket computed from ReceiptDto.createdAt.
 * Item thumbnails resolve itemId -> StoreItemDto via the real store catalog
 * (EconomyRepository.storeItems()) and reuse storeThumbFor(), the same
 * lookup Inventory/Store already use; ReceiptItemDto.itemId is a field the
 * server already returns (Order.items JSON already stores {itemId,name,
 * price} per apps/server/src/economy/ledger.ts) that the Android DTO simply
 * hadn't declared yet — additive, no server change. Provider label
 * ("GCash / Maya / Card") only appears for historical top-up rows if any
 * exist — same honest rule as web; Android never lets the user CREATE a new
 * top-up row (hard policy).
 */
@Composable
fun OrdersScreen(onBrowseStore: () -> Unit = {}, onBack: () -> Unit = {}) {
    var receipts by remember { mutableStateOf<List<ReceiptDto>?>(null) }
    var catalog by remember { mutableStateOf<Map<String, StoreItemDto>>(emptyMap()) }
    var error by remember { mutableStateOf<String?>(null) }
    // Phase 7 retry affordance: bump to re-run the load effect below.
    var retryTick by remember { mutableStateOf(0) }

    suspend fun loadOrders() {
        error = null
        when (val result = EconomyRepository.orders()) {
            is EconomyResult.Success -> receipts = result.data.receipts
            is EconomyResult.Failure -> error = result.message
        }
        val itemsResult = EconomyRepository.storeItems()
        catalog = (itemsResult as? EconomyResult.Success)?.data?.items?.associateBy { it.id } ?: emptyMap()
    }

    LaunchedEffect(retryTick) { loadOrders() }

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp, 20.dp, 20.dp, 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            MockupBackButtonStore(onClick = onBack)
            Text("Purchase History", color = Color(0xFFF4ECD6), style = MaterialTheme.typography.headlineSmall)
        }

        // Pull down to RE-FETCH orders + catalog from the server (the same
        // loadOrders() the entry LaunchedEffect runs), not a cosmetic spinner.
        PullRefreshContainer(onRefresh = { loadOrders() }) {
        when {
            error != null -> Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(error ?: "Could not load your orders.", color = Ink2, style = MaterialTheme.typography.bodyMedium)
                Text(
                    "Retry",
                    color = GoldLt,
                    style = MaterialTheme.typography.labelLarge,
                    modifier = Modifier.padding(top = 12.dp).clickable { retryTick++ }
                )
            }
            receipts == null -> Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally
            ) { CircularProgressIndicator(color = Gold) }
            receipts!!.isEmpty() -> Column(
                modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(top = 40.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Icon(imageVector = Icons.Filled.ReceiptLong, contentDescription = null, tint = Color(0xFFC9A4FF), modifier = Modifier.size(52.dp))
                Text("No purchases yet", color = GoldLt, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 12.dp))
                Text(
                    "Items you buy from the store will show up here with the date and price.",
                    color = Ink2,
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    modifier = Modifier.padding(top = 6.dp, bottom = 20.dp)
                )
                Box(
                    modifier = Modifier.clickable(onClick = onBrowseStore).background(Gold, RoundedCornerShape(10.dp)).padding(horizontal = 24.dp, vertical = 13.dp)
                ) { Text("Browse Store", color = Color(0xFF2A1607), style = MaterialTheme.typography.labelLarge) }
            }
            else -> {
                val groups = groupReceiptsByDay(receipts!!)
                Column(
                    modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    groups.forEach { g -> PurchaseDayGroup(g, catalog) }
                    Box(Modifier.height(8.dp))
                }
            }
        }
        } // PullRefreshContainer
    }
}

private data class PurchaseDayGroupData(
    val label: String,
    val items: List<Pair<ReceiptDto, ReceiptItemDto>>,
    val goldTotal: Int,
    val gemTotal: Int
)

/** Mirrors the mockup's purchGroups deriver (dayStart/dayLabel, mockup-split line 4650-4660). */
private fun groupReceiptsByDay(receipts: List<ReceiptDto>): List<PurchaseDayGroupData> {
    val now = java.time.LocalDate.now()
    val zone = java.time.ZoneId.systemDefault()
    val byDay = linkedMapOf<java.time.LocalDate, MutableList<Pair<ReceiptDto, ReceiptItemDto>>>()
    receipts.forEach { r ->
        val instant = try { java.time.Instant.parse(r.createdAt) } catch (_: Exception) { java.time.Instant.now() }
        val day = instant.atZone(zone).toLocalDate()
        val lines = if (r.items.isNotEmpty()) r.items else listOf(ReceiptItemDto(name = "Purchase", price = r.total))
        lines.forEach { line -> byDay.getOrPut(day) { mutableListOf() }.add(r to line) }
    }
    return byDay.entries.sortedByDescending { it.key }.map { (day, pairs) ->
        val label = when {
            day == now -> "Today"
            day == now.minusDays(1) -> "Yesterday"
            day.year == now.year -> day.format(java.time.format.DateTimeFormatter.ofPattern("MMM d"))
            else -> day.format(java.time.format.DateTimeFormatter.ofPattern("MMM d, yyyy"))
        }
        var gold = 0; var gem = 0
        pairs.forEach { (r, line) -> if (r.currency == "DIAMONDS") gem += line.price else gold += line.price }
        PurchaseDayGroupData(label, pairs, gold, gem)
    }
}

@Composable
private fun PurchaseDayGroup(g: PurchaseDayGroupData, catalog: Map<String, StoreItemDto>) {
    Column {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 0.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(g.label.uppercase(), color = Color(0xFF8B7CAE), style = MaterialTheme.typography.labelSmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (g.goldTotal > 0) {
                    CurrencyAmount(kind = CurrencyIconKind.COIN, text = g.goldTotal.toString(), color = Color(0xFFF0CF72), style = MaterialTheme.typography.labelSmall)
                }
                if (g.gemTotal > 0) {
                    CurrencyAmount(kind = CurrencyIconKind.GEM, text = g.gemTotal.toString(), color = Color(0xFF8FB3FF), style = MaterialTheme.typography.labelSmall)
                }
            }
        }
        Box(Modifier.height(9.dp))
        Column(
            modifier = Modifier.fillMaxWidth()
                .background(Color(0xCC1B1030), RoundedCornerShape(16.dp))
                .border(1.dp, Color(0x1FE8B84B), RoundedCornerShape(16.dp))
        ) {
            g.items.forEachIndexed { idx, (r, line) -> PurchaseItemRow(r, line, catalog, showTopBorder = idx > 0) }
        }
    }
}

@Composable
private fun PurchaseItemRow(r: ReceiptDto, line: ReceiptItemDto, catalog: Map<String, StoreItemDto>, showTopBorder: Boolean) {
    val isTopup = r.kind == "topup"
    val catalogItem = line.itemId?.let { catalog[it] }
    val time = try {
        java.time.Instant.parse(r.createdAt).atZone(java.time.ZoneId.systemDefault())
            .format(java.time.format.DateTimeFormatter.ofPattern("h:mm a"))
    } catch (_: Exception) { "" }
    val isDiamonds = r.currency == "DIAMONDS"

    Row(
        modifier = Modifier.fillMaxWidth()
            .then(if (showTopBorder) Modifier.border(androidx.compose.foundation.BorderStroke(1.dp, Color(0x12E8B84B))) else Modifier)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(13.dp)
    ) {
        Box(
            modifier = Modifier.size(46.dp)
                .background(
                    androidx.compose.ui.graphics.Brush.linearGradient(listOf(Color(0xFF2A1840), Color(0xFF160B2C))),
                    RoundedCornerShape(11.dp)
                )
                .border(1.dp, Color(0x29E8B84B), RoundedCornerShape(11.dp)),
            contentAlignment = Alignment.Center
        ) {
            when {
                isTopup -> Icon(imageVector = Icons.Filled.Diamond, contentDescription = null, tint = Color(0xFF8FB3FF), modifier = Modifier.size(22.dp))
                catalogItem != null -> when (val thumb = storeThumbFor(catalogItem)) {
                    is com.filipinodama.app.data.economy.StoreThumb.Image -> coil.compose.AsyncImage(model = thumb.url, contentDescription = null, modifier = Modifier.size(46.dp))
                    is com.filipinodama.app.data.economy.StoreThumb.Portrait -> coil.compose.AsyncImage(model = thumb.url, contentDescription = null, modifier = Modifier.size(46.dp))
                    com.filipinodama.app.data.economy.StoreThumb.Disc -> Box(modifier = Modifier.size(38.dp).background(Color(0xFFA0303A), androidx.compose.foundation.shape.CircleShape))
                }
                else -> Icon(imageVector = Icons.Filled.ReceiptLong, contentDescription = null, tint = Color(0xFFC9A4FF), modifier = Modifier.size(22.dp))
            }
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(line.name, color = Color(0xFFE6DCF5), style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
            Text(time, color = Color(0xFF8B7CAE), style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 2.dp))
        }
        CurrencyAmount(
            kind = if (isDiamonds) CurrencyIconKind.GEM else CurrencyIconKind.COIN,
            text = if (line.price > 0) line.price.toString() else "Free",
            color = if (isDiamonds) Color(0xFF8FB3FF) else Color(0xFFF0CF72),
            style = MaterialTheme.typography.labelLarge
        )
    }
}
