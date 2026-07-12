package com.filipinodama.app.ui.screens.economy

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
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
import androidx.compose.material3.CircularProgressIndicator
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
import com.filipinodama.app.data.economy.STORE_TYPE_META
import com.filipinodama.app.data.economy.StoreItemDto
import com.filipinodama.app.data.economy.equipRequestFor
import com.filipinodama.app.data.economy.isItemEquipped
import com.filipinodama.app.data.economy.storeThumbFor
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel
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
fun InventoryScreen(onBrowseStore: () -> Unit = {}) {
    val authState by AuthRepository.state.collectAsState()
    val me = authState.user
    val scope = rememberCoroutineScope()
    var groups by remember { mutableStateOf<Map<String, List<StoreItemDto>>?>(null) } // null = loading

    LaunchedEffect(me?.id) {
        val itemsResult = EconomyRepository.storeItems()
        val inventoryResult = EconomyRepository.ownedInventory()

        val allItems = (itemsResult as? EconomyResult.Success)?.data?.items ?: emptyList()
        val ownedIds = (inventoryResult as? EconomyResult.Success)
            ?.data?.inventory?.map { it.itemId }?.toSet() ?: emptySet()

        val ownedItems = allItems.filter { it.id in ownedIds }
        groups = ownedItems.groupBy { it.type }
    }

    // Count of owned items currently equipped per the real account fields.
    val equippedCount = groups?.values?.flatten()?.count {
        isItemEquipped(it, me?.equippedBoard, me?.equippedSkin, me?.frameId, me?.avatarUrl)
    } ?: 0

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(20.dp, 20.dp, 20.dp, 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text("✦ Your Collection ✦", color = Gold, style = MaterialTheme.typography.labelMedium)
                Text("Inventory", color = GoldLt, style = MaterialTheme.typography.headlineSmall)
            }
        }

        when (val g = groups) {
            null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Gold) }
            else -> if (g.isEmpty()) {
                EmptyInventoryState(onBrowseStore)
            } else {
                Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp)) {
                    val itemsOwned = g.values.sumOf { it.size }
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(bottom = 16.dp)) {
                        StatTile(label = "Items Owned", value = itemsOwned.toString(), modifier = Modifier.weight(1f))
                        StatTile(label = "Equipped", value = equippedCount.toString(), modifier = Modifier.weight(1f))
                    }
                    g.forEach { (type, items) ->
                        Text(
                            "${STORE_TYPE_META[type]?.label ?: type} (${items.size})",
                            color = GoldLt,
                            style = MaterialTheme.typography.titleMedium,
                            modifier = Modifier.padding(bottom = 10.dp, top = 6.dp)
                        )
                        LazyVerticalGrid(
                            columns = GridCells.Fixed(2),
                            modifier = Modifier.height((((items.size + 1) / 2) * 150).dp),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
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
                        Box(Modifier.height(16.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun StatTile(label: String, value: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.background(Panel, RoundedCornerShape(12.dp)).padding(14.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(value, color = GoldLt, style = MaterialTheme.typography.titleLarge)
        Text(label, color = Ink2, style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun InventoryItemCard(item: StoreItemDto, equipped: Boolean, onEquip: () -> Unit) {
    Column(
        modifier = Modifier.background(Panel, RoundedCornerShape(14.dp)).padding(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(modifier = Modifier.fillMaxWidth().height(56.dp), contentAlignment = Alignment.Center) {
            when (val thumb = storeThumbFor(item)) {
                is com.filipinodama.app.data.economy.StoreThumb.Image -> coil.compose.AsyncImage(
                    model = thumb.url, contentDescription = null, modifier = Modifier.size(48.dp)
                )
                is com.filipinodama.app.data.economy.StoreThumb.Portrait -> coil.compose.AsyncImage(
                    model = thumb.url, contentDescription = null, modifier = Modifier.size(48.dp)
                )
                is com.filipinodama.app.data.economy.StoreThumb.Emoji -> Text(thumb.glyph, style = MaterialTheme.typography.headlineSmall)
                com.filipinodama.app.data.economy.StoreThumb.Disc -> Box(
                    modifier = Modifier.size(40.dp).background(Color(0xFFA0303A), androidx.compose.foundation.shape.CircleShape)
                )
            }
        }
        Text(item.name, color = Color.White, style = MaterialTheme.typography.labelLarge, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.padding(top = 6.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp)
                .clickable(enabled = !equipped, onClick = onEquip)
                .background(if (equipped) Color(0xFF2F8F5B).copy(alpha = 0.2f) else Gold.copy(alpha = 0.15f), RoundedCornerShape(8.dp))
                .padding(vertical = 8.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(if (equipped) "EQUIPPED" else "Equip", color = if (equipped) Color(0xFF7EE6A4) else GoldLt, style = MaterialTheme.typography.labelSmall)
        }
    }
}

@Composable
private fun EmptyInventoryState(onBrowseStore: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("🎒", style = MaterialTheme.typography.displayMedium)
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
 * Purchase History / Orders — mobile-screen-inventory.md SCREEN 13. Real
 * GET /api/orders rows (item purchases + settled top-ups merged, matching
 * apps/web OrdersPage.tsx). Provider label ("GCash / Maya / Card") only
 * appears for historical top-up rows if any exist — same honest rule as web;
 * Android never lets the user CREATE a new top-up row (hard policy).
 */
@Composable
fun OrdersScreen(onBrowseStore: () -> Unit = {}) {
    var receipts by remember { mutableStateOf<List<ReceiptDto>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        when (val result = EconomyRepository.orders()) {
            is EconomyResult.Success -> receipts = result.data.receipts
            is EconomyResult.Failure -> error = result.message
        }
    }

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(20.dp)) {
        Text("Purchase History", color = GoldLt, style = MaterialTheme.typography.headlineSmall)
        Box(Modifier.height(16.dp))

        when {
            error != null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(error ?: "Could not load your orders.", color = Ink2, style = MaterialTheme.typography.bodyMedium)
            }
            receipts == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Gold) }
            receipts!!.isEmpty() -> Column(
                modifier = Modifier.fillMaxSize().padding(top = 40.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text("🧾", style = MaterialTheme.typography.displayMedium)
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
            else -> Column(modifier = Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                receipts!!.forEach { r -> ReceiptRow(r) }
            }
        }
    }
}

@Composable
private fun ReceiptRow(r: ReceiptDto) {
    val isTopup = r.kind == "topup"
    val cur = if (r.currency == "DIAMONDS") "💎" else "🪙"
    Column(modifier = Modifier.fillMaxWidth().background(Panel, RoundedCornerShape(14.dp)).padding(16.dp)) {
        Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
            Text("#${r.id.takeLast(8).uppercase()}", color = GoldLt, style = MaterialTheme.typography.labelLarge)
            Text(if (isTopup) "Top-up" else "${r.items.size} item(s)", color = Ink2, style = MaterialTheme.typography.labelSmall)
        }
        Text(
            text = if (isTopup) "₱${"%.2f".format(r.total / 100.0)}" else "$cur ${r.total}",
            color = if (r.currency == "DIAMONDS") Color(0xFFFF9AA8) else Color(0xFFF2D493),
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(top = 6.dp)
        )
        Text("Paid with ${r.method}", color = Ink2, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 2.dp))
        if (isTopup && (r.creditedDiamonds ?: 0) > 0) {
            Text("Credited ${r.creditedDiamonds} 💎", color = Color(0xFF7FE0A3), style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 4.dp))
        }
        r.items.forEach { line ->
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                Text(line.name, color = Ink, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}
