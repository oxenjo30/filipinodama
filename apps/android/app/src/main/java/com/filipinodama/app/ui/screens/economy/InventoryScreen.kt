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
 * Purchase history (Orders). The Inventory screen that used to lead this
 * file was removed when board/piece-skin equipping moved into the Play tab's
 * Loadout drawer; OrdersScreen stayed here rather than being moved, to keep
 * this change reviewable.
 *
 * Original header follows.
 *
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
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
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
