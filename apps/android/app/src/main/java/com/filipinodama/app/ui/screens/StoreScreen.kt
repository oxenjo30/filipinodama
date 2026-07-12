package com.filipinodama.app.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.economy.EconomyRepository
import com.filipinodama.app.data.economy.EconomyResult
import com.filipinodama.app.data.economy.STORE_TYPE_META
import com.filipinodama.app.data.economy.STORE_TYPE_ORDER
import com.filipinodama.app.data.economy.StoreItemDto
import com.filipinodama.app.data.economy.StoreThumb
import com.filipinodama.app.data.economy.equipRequestFor
import com.filipinodama.app.data.economy.isItemEquipped
import com.filipinodama.app.data.economy.storeItemCurrency
import com.filipinodama.app.data.economy.storeItemDiscountPct
import com.filipinodama.app.data.economy.storeItemIsDeal
import com.filipinodama.app.data.economy.storeItemPrice
import com.filipinodama.app.data.economy.storeThumbFor
import com.filipinodama.app.ui.screens.economy.BuyFlow
import com.filipinodama.app.ui.screens.economy.BuyFlowState
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel
import kotlinx.coroutines.launch

/**
 * Store — mobile-screen-inventory.md SCREEN 14, EARNED-CURRENCY ONLY per the
 * hard Android policy: no "+ Get Diamonds" affordance, no top-up category, no
 * TopUpModal port, regardless of the server's diamondTopUp flag. Wallet shows
 * balances only.
 *
 * Rows built: category tabs (derived from the live catalog's real item
 * types, mirrors StorePage.tsx presentTypes), item grid (thumbnail via
 * Coil-remote art — see StoreAssets.kt for why remote-over-bundled, tag/OWNED
 * badge, name/sub, price, Buy/Equip/Equipped state), Daily Deals section
 * (on-sale items), confirm-sheet -> purchase -> success flow via [BuyFlow].
 *
 * DEFERRED (out of this phase's row list / no server backing yet): the
 * Featured Pack marketing banner and Seasonal Offer rail are prototype
 * marketing chrome with no dedicated mobile row in the inventory beyond the
 * catalog grid itself — the featured/deals sections below already surface
 * the same real BUNDLE/on-sale items honestly without inventing banner copy.
 */
@Composable
fun StoreScreen(onOpenInventory: () -> Unit = {}) {
    val authState by AuthRepository.state.collectAsState()
    val me = authState.user
    val scope = rememberCoroutineScope()

    var items by remember { mutableStateOf<List<StoreItemDto>?>(null) } // null = loading
    var loadError by remember { mutableStateOf(false) }
    var owned by remember { mutableStateOf<Set<String>>(emptySet()) }
    var tab by remember { mutableStateOf("All") }
    var buyFlow by remember { mutableStateOf<BuyFlowState>(BuyFlowState.Idle) }

    LaunchedEffect(Unit) {
        when (val result = EconomyRepository.storeItems()) {
            is EconomyResult.Success -> items = result.data.items
            is EconomyResult.Failure -> {
                items = emptyList()
                loadError = true
            }
        }
    }

    // Real ownership: the export's InventoryItem rows keyed by itemId (the
    // same source web's StorePage uses) — INCLUDES granted starter items that
    // have no Order rows. Reloaded when the account changes; on failure owned
    // stays empty so nothing is falsely marked owned.
    LaunchedEffect(me?.id) {
        if (me == null) {
            owned = emptySet()
            return@LaunchedEffect
        }
        when (val result = EconomyRepository.ownedInventory()) {
            is EconomyResult.Success -> owned = result.data.inventory.map { it.itemId }.toSet()
            is EconomyResult.Failure -> { /* leave owned as-is — never falsely mark owned */ }
        }
    }

    val presentTypes = remember(items) {
        val set = items?.map { it.type }?.toSet() ?: emptySet()
        STORE_TYPE_ORDER.filter { it in set }
    }
    val isFeatured = tab == "All"
    val grid = remember(items, tab) {
        val list = items ?: emptyList()
        if (isFeatured) list.filter { it.featured } else list.filter { STORE_TYPE_META[it.type]?.label == tab }
    }
    val deals = remember(items) { (items ?: emptyList()).filter { storeItemIsDeal(it) } }

    fun doBuy(item: StoreItemDto) {
        buyFlow = BuyFlow.confirm(buyFlow)
        scope.launch {
            when (val result = EconomyRepository.purchase(item.id)) {
                is EconomyResult.Success -> {
                    owned = owned + item.id
                    buyFlow = BuyFlow.succeed(buyFlow)
                }
                is EconomyResult.Failure -> {
                    buyFlow = BuyFlow.fail(buyFlow, result.message)
                }
            }
        }
    }

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        // Header: title + gold/diamond balances (display only — no "+").
        Row(
            modifier = Modifier.fillMaxWidth().padding(20.dp, 20.dp, 20.dp, 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Store", color = GoldLt, style = MaterialTheme.typography.headlineSmall)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                BalancePill(icon = "🪙", value = me?.gold ?: 0, color = Color(0xFFF2D493))
                BalancePill(icon = "💎", value = me?.diamonds ?: 0, color = Color(0xFFFF9AA8))
                Box(
                    modifier = Modifier.clickable(onClick = onOpenInventory).background(Panel, RoundedCornerShape(100.dp)).padding(10.dp)
                ) { Text("🎒", style = MaterialTheme.typography.labelLarge) }
            }
        }

        // Category tabs — real catalog types only.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            CategoryChip(label = "All Items", selected = tab == "All", onClick = { tab = "All" })
            presentTypes.forEach { t ->
                val label = STORE_TYPE_META[t]?.label ?: t
                CategoryChip(label = label, selected = tab == label, onClick = { tab = label })
            }
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
        ) {
            when {
                items == null -> Box(Modifier.fillMaxWidth().padding(vertical = 40.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Gold)
                }
                grid.isEmpty() -> EmptyStoreState(loadError)
                else -> {
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(2),
                        modifier = Modifier.height((((grid.size + 1) / 2) * 220).dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        items(grid) { item ->
                            StoreItemCard(
                                item = item,
                                owned = item.id in owned,
                                // Equipped derives from the REAL account fields
                                // (me.equippedBoard/equippedSkin/frameId/avatarUrl),
                                // like web's InventoryPage — the successful equip
                                // PATCH patches these via EconomyRepository.equip,
                                // so this recomposes reactively.
                                equipped = isItemEquipped(item, me?.equippedBoard, me?.equippedSkin, me?.frameId, me?.avatarUrl),
                                onPreviewOrBuy = { buyFlow = BuyFlow.startConfirm(item) },
                                onEquip = {
                                    scope.launch {
                                        val request = equipRequestFor(item)
                                        if (request != null) EconomyRepository.equip(request)
                                    }
                                }
                            )
                        }
                    }
                }
            }

            if (isFeatured && deals.isNotEmpty()) {
                Text("Daily Deals", color = GoldLt, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 20.dp, bottom = 10.dp))
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    deals.forEach { item ->
                        DealRow(item = item, owned = item.id in owned, onBuy = { buyFlow = BuyFlow.startConfirm(item) })
                    }
                }
            }

            Box(Modifier.height(24.dp))
        }
    }

    // Confirm / Purchasing / Success / Error overlay, driven by [BuyFlowState].
    when (val state = buyFlow) {
        is BuyFlowState.Confirming -> PurchaseConfirmSheet(
            item = state.item,
            balance = if (storeItemCurrency(state.item) == "DIAMONDS") me?.diamonds ?: 0 else me?.gold ?: 0,
            onCancel = { buyFlow = BuyFlow.cancel() },
            onConfirm = { doBuy(state.item) }
        )
        is BuyFlowState.Purchasing -> PurchasingOverlay()
        is BuyFlowState.Success -> PurchaseSuccessOverlay(item = state.item, onDismiss = { buyFlow = BuyFlow.dismiss() })
        is BuyFlowState.Error -> PurchaseErrorOverlay(message = state.message, onDismiss = { buyFlow = BuyFlow.dismiss() })
        BuyFlowState.Idle -> {}
    }
}

@Composable
private fun BalancePill(icon: String, value: Int, color: Color) {
    Row(
        modifier = Modifier.background(Panel, RoundedCornerShape(100.dp)).padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(icon, style = MaterialTheme.typography.labelLarge)
        Text(value.toString(), color = color, style = MaterialTheme.typography.labelLarge)
    }
}

@Composable
private fun CategoryChip(label: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clickable(onClick = onClick)
            .background(if (selected) Gold.copy(alpha = 0.15f) else Color.Transparent, RoundedCornerShape(8.dp))
            .padding(horizontal = 14.dp, vertical = 9.dp)
    ) {
        Text(label, color = if (selected) GoldLt else Ink, style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
private fun EmptyStoreState(loadError: Boolean) {
    Box(Modifier.fillMaxWidth().padding(vertical = 40.dp), contentAlignment = Alignment.Center) {
        Text(
            if (loadError) "The store is unavailable right now — please try again soon." else "No items in this category yet — check back soon.",
            color = Ink2,
            style = MaterialTheme.typography.bodyMedium
        )
    }
}

@Composable
private fun StoreThumbView(thumb: StoreThumb, size: androidx.compose.ui.unit.Dp) {
    when (thumb) {
        is StoreThumb.Image -> AsyncImage(model = thumb.url, contentDescription = null, modifier = Modifier.size(size), contentScale = ContentScale.Fit)
        is StoreThumb.Portrait -> Box(
            modifier = Modifier.size(size).background(Color(0xFF0F0820), CircleShape),
            contentAlignment = Alignment.Center
        ) {
            AsyncImage(model = thumb.url, contentDescription = null, modifier = Modifier.size(size).background(Color.Transparent, CircleShape), contentScale = ContentScale.Crop)
        }
        StoreThumb.Disc -> Box(
            modifier = Modifier.size(size).background(Color(0xFFA0303A), CircleShape)
        )
        is StoreThumb.Emoji -> Box(modifier = Modifier.size(size), contentAlignment = Alignment.Center) {
            Text(thumb.glyph, style = MaterialTheme.typography.headlineMedium)
        }
    }
}

@Composable
private fun StoreItemCard(
    item: StoreItemDto,
    owned: Boolean,
    equipped: Boolean,
    onPreviewOrBuy: () -> Unit,
    onEquip: () -> Unit
) {
    val cur = storeItemCurrency(item)
    val price = storeItemPrice(item)
    val meta = STORE_TYPE_META[item.type]

    Column(
        modifier = Modifier
            .background(Panel, RoundedCornerShape(14.dp))
            .padding(14.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            if (owned) {
                Badge(text = "OWNED", background = Color(0xFF2F8F5B))
            } else if (item.tag != null) {
                Badge(text = item.tag, background = Color(0xFF7A4FBF))
            } else {
                Box {}
            }
        }
        Box(
            modifier = Modifier.fillMaxWidth().height(70.dp).clickable(onClick = onPreviewOrBuy),
            contentAlignment = Alignment.Center
        ) {
            StoreThumbView(storeThumbFor(item), size = 60.dp)
        }
        Text(item.name, color = androidx.compose.ui.graphics.Color.White, style = MaterialTheme.typography.titleSmall, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        Text(meta?.sub ?: "", color = Ink2, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 2.dp, bottom = 8.dp))

        when {
            owned -> {
                if (equipRequestFor(item) != null) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable(enabled = !equipped, onClick = onEquip)
                            .background(if (equipped) Color(0xFF2F8F5B).copy(alpha = 0.2f) else Gold.copy(alpha = 0.15f), RoundedCornerShape(8.dp))
                            .padding(vertical = 9.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(if (equipped) "EQUIPPED" else "Equip", color = if (equipped) Color(0xFF7EE6A4) else GoldLt, style = MaterialTheme.typography.labelMedium)
                    }
                } else {
                    Text("✓ OWNED", color = Color(0xFF3FBF6F), style = MaterialTheme.typography.labelMedium)
                }
            }
            price == 0 -> {
                Box(
                    modifier = Modifier.fillMaxWidth().clickable(onClick = onPreviewOrBuy).background(Gold, RoundedCornerShape(8.dp)).padding(vertical = 9.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text("Claim", color = Color(0xFF2A1607), style = MaterialTheme.typography.labelMedium)
                }
            }
            else -> {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "${if (cur == "DIAMONDS") "💎" else "🪙"} $price",
                        color = if (cur == "DIAMONDS") Color(0xFFFF9AA8) else Color(0xFFF2D493),
                        style = MaterialTheme.typography.labelMedium
                    )
                    Box(
                        modifier = Modifier.clickable(onClick = onPreviewOrBuy).background(Gold.copy(alpha = 0.85f), RoundedCornerShape(8.dp)).padding(horizontal = 14.dp, vertical = 8.dp)
                    ) {
                        Text("Buy", color = Color(0xFF2A1607), style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
        }
    }
}

@Composable
private fun Badge(text: String, background: Color) {
    Box(modifier = Modifier.background(background, RoundedCornerShape(5.dp)).padding(horizontal = 7.dp, vertical = 3.dp)) {
        Text(text, color = androidx.compose.ui.graphics.Color.White, style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun DealRow(item: StoreItemDto, owned: Boolean, onBuy: () -> Unit) {
    val cur = storeItemCurrency(item)
    val price = storeItemPrice(item)
    Row(
        modifier = Modifier.fillMaxWidth().background(Panel, RoundedCornerShape(14.dp)).padding(14.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        StoreThumbView(storeThumbFor(item), size = 52.dp)
        Column(modifier = Modifier.weight(1f)) {
            Text(item.name, color = androidx.compose.ui.graphics.Color.White, style = MaterialTheme.typography.titleSmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    "${if (cur == "DIAMONDS") "💎" else "🪙"} $price",
                    color = if (cur == "DIAMONDS") Color(0xFFFF9AA8) else Color(0xFFF2D493),
                    style = MaterialTheme.typography.labelMedium
                )
                Text("-${storeItemDiscountPct(item)}%", color = Color(0xFFA83744), style = MaterialTheme.typography.labelSmall)
            }
        }
        if (owned) {
            Text("✓ Owned", color = Color(0xFF3FBF6F), style = MaterialTheme.typography.labelMedium)
        } else {
            Box(modifier = Modifier.clickable(onClick = onBuy).background(Gold.copy(alpha = 0.85f), RoundedCornerShape(8.dp)).padding(horizontal = 14.dp, vertical = 8.dp)) {
                Text("Buy", color = Color(0xFF2A1607), style = MaterialTheme.typography.labelMedium)
            }
        }
    }
}

@Composable
private fun PurchaseConfirmSheet(item: StoreItemDto, balance: Int, onCancel: () -> Unit, onConfirm: () -> Unit) {
    val cur = storeItemCurrency(item)
    val price = storeItemPrice(item)
    Box(
        modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.6f)).clickable(onClick = onCancel),
        contentAlignment = Alignment.BottomCenter
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(Panel, RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp))
                .padding(24.dp)
                .clickable(enabled = false) {},
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("Confirm Purchase", color = Gold, style = MaterialTheme.typography.labelMedium)
            Text(item.name, color = GoldLt, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 8.dp))
            Text(
                "${if (cur == "DIAMONDS") "💎" else "🪙"} $price",
                color = if (cur == "DIAMONDS") Color(0xFFFF9AA8) else Color(0xFFF2D493),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(top = 8.dp)
            )
            Text("Your balance: $balance", color = Ink2, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 4.dp, bottom = 20.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                Box(
                    modifier = Modifier.weight(1f).clickable(onClick = onCancel).background(Color.Black.copy(alpha = 0.3f), RoundedCornerShape(10.dp)).padding(vertical = 13.dp),
                    contentAlignment = Alignment.Center
                ) { Text("Cancel", color = Ink, style = MaterialTheme.typography.labelLarge) }
                Box(
                    modifier = Modifier.weight(1f).clickable(onClick = onConfirm).background(Gold, RoundedCornerShape(10.dp)).padding(vertical = 13.dp),
                    contentAlignment = Alignment.Center
                ) { Text(if (price == 0) "Claim" else "Buy", color = Color(0xFF2A1607), style = MaterialTheme.typography.labelLarge) }
            }
        }
    }
}

@Composable
private fun PurchasingOverlay() {
    Box(modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.6f)), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator(color = Gold)
            Text("Processing…", color = Ink, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 12.dp))
        }
    }
}

@Composable
private fun PurchaseSuccessOverlay(item: StoreItemDto, onDismiss: () -> Unit) {
    Box(modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.6f)).clickable(onClick = onDismiss), contentAlignment = Alignment.Center) {
        Column(
            modifier = Modifier.background(Panel, RoundedCornerShape(18.dp)).padding(28.dp).clickable(enabled = false) {},
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("✓", color = Color(0xFF3FBF6F), style = MaterialTheme.typography.displaySmall)
            Text("Purchase Complete", color = GoldLt, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 8.dp))
            Text(item.name, color = Ink, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 4.dp))
            Text("Added to your locker", color = Ink2, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 2.dp, bottom = 16.dp))
            Box(
                modifier = Modifier.clickable(onClick = onDismiss).background(Gold, RoundedCornerShape(10.dp)).padding(horizontal = 24.dp, vertical = 12.dp)
            ) { Text("Keep Browsing", color = Color(0xFF2A1607), style = MaterialTheme.typography.labelLarge) }
        }
    }
}

@Composable
private fun PurchaseErrorOverlay(message: String, onDismiss: () -> Unit) {
    Box(modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.6f)).clickable(onClick = onDismiss), contentAlignment = Alignment.Center) {
        Column(
            modifier = Modifier.background(Panel, RoundedCornerShape(18.dp)).padding(28.dp).clickable(enabled = false) {},
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("⚠", style = MaterialTheme.typography.displaySmall)
            Text("Purchase Failed", color = GoldLt, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 8.dp))
            Text(message, color = Ink, style = MaterialTheme.typography.bodyMedium, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.padding(top = 4.dp, bottom = 16.dp))
            Box(
                modifier = Modifier.clickable(onClick = onDismiss).background(Gold, RoundedCornerShape(10.dp)).padding(horizontal = 24.dp, vertical = 12.dp)
            ) { Text("OK", color = Color(0xFF2A1607), style = MaterialTheme.typography.labelLarge) }
        }
    }
}
