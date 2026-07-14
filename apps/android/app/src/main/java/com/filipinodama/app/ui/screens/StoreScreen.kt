package com.filipinodama.app.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.filipinodama.app.ui.components.CurrencyAmount
import com.filipinodama.app.ui.components.CurrencyIcon
import com.filipinodama.app.ui.components.CurrencyIconKind
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.economy.EconomyRepository
import com.filipinodama.app.data.economy.EconomyResult
import com.filipinodama.app.data.economy.STORE_TYPE_META
import com.filipinodama.app.data.economy.STORE_TYPE_ORDER
import com.filipinodama.app.data.economy.StoreItemDto
import com.filipinodama.app.data.economy.StoreThumb
import com.filipinodama.app.data.economy.equipRequestFor
import com.filipinodama.app.data.economy.isItemEquipped
import com.filipinodama.app.data.economy.storeItemBasePrice
import com.filipinodama.app.data.economy.storeItemCurrency
import com.filipinodama.app.data.economy.storeItemDiscountPct
import com.filipinodama.app.data.economy.storeItemIsDeal
import com.filipinodama.app.data.economy.storeItemPrice
import com.filipinodama.app.data.economy.storeThumbFor
import com.filipinodama.app.ui.screens.economy.BuyFlow
import com.filipinodama.app.ui.screens.economy.BuyFlowState
import com.filipinodama.app.ui.screens.economy.CheckoutScreen
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
    // Phase 7 retry affordance: bump to re-run the catalog load below.
    var retryTick by remember { mutableStateOf(0) }

    // Store Item Preview bottom sheet (mobile-screen-inventory.md "[MODAL:
    // Store Item Preview]", storePrevShow, finding ECON-1) — a card/deal-row
    // tap now opens this preview FIRST instead of jumping straight to
    // PurchaseConfirmSheet; the preview's own Buy button is what enters
    // BuyFlow.startConfirm. Kept as a plain nullable var (not folded into
    // BuyFlowState) since it's a distinct pre-buy step, not part of the
    // buy/purchase state machine itself.
    var previewItem by remember { mutableStateOf<StoreItemDto?>(null) }

    // Cart + Checkout (mockup line 795 Cart button, lines 896-960 Checkout
    // screen) — de-duplicated by item id, currency-agnostic (never assumes
    // gold; see CheckoutScreen.kt). Add-to-cart coexists with the existing
    // immediate-Buy flow above: Buy purchases now, the cart queues for a
    // single batched checkout later.
    var cart by remember { mutableStateOf<List<StoreItemDto>>(emptyList()) }
    var showCheckout by remember { mutableStateOf(false) }
    val cartIds = remember(cart) { cart.map { it.id }.toSet() }

    fun addToCart(item: StoreItemDto) {
        if (item.id !in cartIds) cart = cart + item
    }
    fun removeFromCart(itemId: String) {
        cart = cart.filter { it.id != itemId }
    }

    // Hoisted (not Row-local) — CheckoutScreen's dark-gated Top-up affordance
    // needs the same flag the header's diamond pill already reads.
    val diamondTopUpEnabled by com.filipinodama.app.data.config.ConfigRepository.diamondTopUpEnabled.collectAsState()

    if (showCheckout) {
        CheckoutScreen(
            cart = cart,
            goldBalance = me?.gold ?: 0,
            diamondBalance = me?.diamonds ?: 0,
            diamondTopUpEnabled = diamondTopUpEnabled,
            onRemove = { id -> removeFromCart(id) },
            onClear = { cart = emptyList() },
            onBrowseStore = { showCheckout = false },
            onBack = { showCheckout = false },
            onOpenTopUp = { /* dark while diamondTopUpEnabled is false; nav target TBD when diamonds go live */ },
            onOrderPlaced = { purchasedIds ->
                owned = owned + purchasedIds
                cart = cart.filter { it.id !in purchasedIds }
                if (cart.isEmpty()) showCheckout = false
            }
        )
        return
    }

    LaunchedEffect(retryTick) {
        items = null
        loadError = false
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
        // Header: title + gold/diamond balances (display only — no "+", mockup's
        // diamond "+"/top-up affordance intentionally omitted per the earned-only
        // policy). Mockup values: title font 800 24px Cinzel #f4ecd6; gold chip
        // bg rgba(232,184,75,.1) border rgba(232,184,75,.28); diamond chip bg
        // rgba(90,150,255,.1) border rgba(90,150,255,.3) (mobile-split.txt:1121-1130).
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp, 20.dp, 16.dp, 12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Store", color = Color(0xFFF4ECD6), style = MaterialTheme.typography.headlineSmall.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.ExtraBold))
            Row(horizontalArrangement = Arrangement.spacedBy(7.dp), verticalAlignment = Alignment.CenterVertically) {
                BalancePill(icon = CurrencyIconKind.COIN, value = me?.gold ?: 0, color = Color(0xFFF0CF72), tint = Color(0xFFE8B84B))
                // Diamond balance hidden while DIAMOND_TOPUP_ENABLED is off
                // (owner directive: "hide the earned-diamond balance display
                // for now" — monetization is dark). Store only ever sells
                // gold-priced items in this build; the pill stays flag-gated,
                // not deleted, so it comes back automatically once the flag
                // flips true.
                if (diamondTopUpEnabled) {
                    BalancePill(icon = CurrencyIconKind.GEM, value = me?.diamonds ?: 0, color = Color(0xFF8FB3FF), tint = Color(0xFF5A96FF))
                }
                // Cart button (mockup line 795) — REPLACES the former
                // Inventory/backpack (🎒) affordance in the Store top bar.
                // Inventory remains reachable via Profile -> Inventory
                // (onOpenInventory param kept for that caller); it is simply
                // no longer surfaced here, matching the mockup exactly.
                Box(
                    modifier = Modifier
                        .clickable(onClick = { showCheckout = true })
                        .background(Color(0x1AE8B84B), CircleShape)
                        .border(1.dp, Color(0x47E8B84B), CircleShape)
                        .padding(10.dp)
                ) {
                    Text("🛒", color = Color(0xFFF0CF72), style = MaterialTheme.typography.labelLarge)
                    if (cart.isNotEmpty()) {
                        Box(
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .offset(x = 5.dp, y = (-5).dp)
                                .defaultMinSize(minWidth = 18.dp, minHeight = 18.dp)
                                .background(Brush.verticalGradient(listOf(Color(0xFFFF6A7A), Color(0xFFD63B52))), CircleShape)
                                .padding(horizontal = 4.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(cart.size.toString(), color = Color.White, style = MaterialTheme.typography.labelSmall.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.ExtraBold, fontSize = 10.sp))
                        }
                    }
                }
            }
        }

        // Category tabs — real catalog types only. Mockup pill: selected =
        // gold gradient bg #efc25a→#c9971f, ink text #2a1608, border
        // rgba(232,184,75,.5); unselected = bg rgba(27,16,48,.7), text
        // #9a8bbf, border rgba(232,184,75,.14) (mobile-split.txt:4787).
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            CategoryChip(label = "Featured", selected = tab == "All", onClick = { tab = "All" })
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
                grid.isEmpty() -> EmptyStoreState(loadError, onRetry = { retryTick++ })
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
                                inCart = item.id in cartIds,
                                onPreviewOrBuy = { previewItem = item },
                                onAddToCart = { addToCart(item) },
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
                        DealRow(
                            item = item,
                            owned = item.id in owned,
                            inCart = item.id in cartIds,
                            onBuy = { previewItem = item },
                            onAddToCart = { addToCart(item) }
                        )
                    }
                }
            }

            Box(Modifier.height(24.dp))
        }
    }

    // Store Item Preview bottom sheet (finding ECON-1) — emitted AFTER the
    // main screen content above, as its own overlay sibling exactly like the
    // buyFlow overlay below it, so it paints on top rather than being
    // occluded. Its own Buy button hands off to the SAME BuyFlow.startConfirm
    // the card used to call directly; Add to Cart reuses the existing
    // addToCart from the cart work.
    previewItem?.let { item ->
        StoreItemPreviewSheet(
            item = item,
            owned = item.id in owned,
            inCart = item.id in cartIds,
            onClose = { previewItem = null },
            onBuy = {
                previewItem = null
                buyFlow = BuyFlow.startConfirm(item)
            },
            onAddToCart = { addToCart(item) }
        )
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
private fun BalancePill(icon: CurrencyIconKind, value: Int, color: Color, tint: Color) {
    Row(
        modifier = Modifier
            .background(tint.copy(alpha = 0.1f), RoundedCornerShape(100.dp))
            .border(1.dp, tint.copy(alpha = 0.3f), RoundedCornerShape(100.dp))
            .padding(horizontal = 10.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        CurrencyIcon(kind = icon, size = 15.dp)
        Text(value.toString(), color = color, style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
private fun CategoryChip(label: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clickable(onClick = onClick)
            .background(
                if (selected) androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Color(0xFFEFC25A), Color(0xFFC9971F))) else androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Color(0xB31B1030), Color(0xB31B1030))),
                RoundedCornerShape(100.dp)
            )
            .padding(horizontal = 15.dp, vertical = 9.dp)
    ) {
        Text(label, color = if (selected) Color(0xFF2A1608) else Color(0xFF9A8BBF), style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
private fun EmptyStoreState(loadError: Boolean, onRetry: () -> Unit = {}) {
    Box(Modifier.fillMaxWidth().padding(vertical = 40.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                if (loadError) "The store is unavailable right now — please try again soon." else "No items in this category yet — check back soon.",
                color = Ink2,
                style = MaterialTheme.typography.bodyMedium
            )
            if (loadError) {
                Text(
                    "Retry",
                    color = GoldLt,
                    style = MaterialTheme.typography.labelLarge,
                    modifier = Modifier.padding(top = 12.dp).clickable(onClick = onRetry)
                )
            }
        }
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
    inCart: Boolean,
    onPreviewOrBuy: () -> Unit,
    onAddToCart: () -> Unit,
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
        // Mockup tag scheme (mobile-split.txt:4759-4760): NEW=#3fbf6f on
        // rgba(63,191,111,.16); PREMIUM=#c9a4ff on rgba(201,164,255,.16);
        // SEASON=#f0cf72 on rgba(240,207,114,.16); VALUE=#8fb3ff on
        // rgba(90,150,255,.16); default=#ff8f9c on rgba(255,90,106,.16).
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            if (owned) {
                Badge(text = "OWNED", color = Color(0xFF7FE0A3), background = Color(0x2A3FBF6F))
            } else if (item.tag != null) {
                val (fg, bg) = when (item.tag) {
                    "NEW" -> Color(0xFF3FBF6F) to Color(0x293FBF6F)
                    "PREMIUM" -> Color(0xFFC9A4FF) to Color(0x29C9A4FF)
                    "SEASON" -> Color(0xFFF0CF72) to Color(0x29F0CF72)
                    "VALUE" -> Color(0xFF8FB3FF) to Color(0x295A96FF)
                    else -> Color(0xFFFF8F9C) to Color(0x29FF5A6A)
                }
                Badge(text = item.tag, color = fg, background = bg)
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
                    CurrencyAmount(
                        kind = if (cur == "DIAMONDS") CurrencyIconKind.GEM else CurrencyIconKind.COIN,
                        text = price.toString(),
                        color = if (cur == "DIAMONDS") Color(0xFFFF9AA8) else Color(0xFFF2D493),
                        style = MaterialTheme.typography.labelMedium
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                        // Add-to-cart (mockup line 3780-3784): + when not yet
                        // queued, flips to a no-op ✓ once in the cart. Removal
                        // only happens on the Checkout screen, matching the
                        // mockup's addToCart-is-idempotent-by-name behavior.
                        AddToCartButton(inCart = inCart, onAdd = onAddToCart)
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
}

/** Small +/✓ add-to-cart control shared by [StoreItemCard] and [DealRow] (mockup line 3780-3784). */
@Composable
private fun AddToCartButton(inCart: Boolean, onAdd: () -> Unit) {
    Box(
        modifier = Modifier
            .defaultMinSize(minWidth = 38.dp)
            .clickable(enabled = !inCart, onClick = onAdd)
            .background(if (inCart) Color(0x243FBF6F) else Color(0x14E8B84B), RoundedCornerShape(11.dp))
            .border(1.dp, if (inCart) Color(0x663FBF6F) else Color(0x4DE8B84B), RoundedCornerShape(11.dp))
            .padding(horizontal = 10.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            if (inCart) "✓" else "+",
            color = if (inCart) Color(0xFF7FE0A3) else Color(0xFFF0CF72),
            style = MaterialTheme.typography.labelLarge.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.ExtraBold)
        )
    }
}

@Composable
private fun Badge(text: String, color: Color, background: Color) {
    Box(modifier = Modifier.background(background, RoundedCornerShape(100.dp)).padding(horizontal = 8.dp, vertical = 3.dp)) {
        Text(text, color = color, style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun DealRow(item: StoreItemDto, owned: Boolean, inCart: Boolean, onBuy: () -> Unit, onAddToCart: () -> Unit) {
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
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                CurrencyAmount(
                    kind = if (cur == "DIAMONDS") CurrencyIconKind.GEM else CurrencyIconKind.COIN,
                    text = price.toString(),
                    color = if (cur == "DIAMONDS") Color(0xFFFF9AA8) else Color(0xFFF2D493),
                    style = MaterialTheme.typography.labelMedium
                )
                Text("-${storeItemDiscountPct(item)}%", color = Color(0xFFA83744), style = MaterialTheme.typography.labelSmall)
            }
        }
        if (owned) {
            Text("✓ Owned", color = Color(0xFF3FBF6F), style = MaterialTheme.typography.labelMedium)
        } else {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                AddToCartButton(inCart = inCart, onAdd = onAddToCart)
                Box(modifier = Modifier.clickable(onClick = onBuy).background(Gold.copy(alpha = 0.85f), RoundedCornerShape(8.dp)).padding(horizontal = 14.dp, vertical = 8.dp)) {
                    Text("Buy", color = Color(0xFF2A1607), style = MaterialTheme.typography.labelMedium)
                }
            }
        }
    }
}

/**
 * Store Item Preview bottom sheet — mobile-screen-inventory.md
 * "[MODAL: Store Item Preview]" (`storePrevShow`, .dc.html lines 964-990 /
 * 1364-1417), finding ECON-1. Opened by a card/deal-row tap BEFORE the
 * purchase confirm sheet. Reuses the existing [storeThumbFor] art resolution
 * (no new art loader) — for SKIN items the mockup does a 3D king/soldier
 * flip; here that is honestly simplified to a King/Soldier label-pill toggle
 * over the two real renders (red-king.png / red-man.png, the same asset
 * naming [storeThumbFor] already produces for skins) rather than inventing a
 * 3D flip animation or referencing image files that don't exist.
 */
@Composable
private fun StoreItemPreviewSheet(
    item: StoreItemDto,
    owned: Boolean,
    inCart: Boolean,
    onClose: () -> Unit,
    onBuy: () -> Unit,
    onAddToCart: () -> Unit
) {
    val cur = storeItemCurrency(item)
    val price = storeItemPrice(item)
    val basePrice = storeItemBasePrice(item)
    val isDeal = storeItemIsDeal(item)
    val meta = STORE_TYPE_META[item.type]
    val isSkin = item.type == "SKIN"
    var showSoldier by remember(item.id) { mutableStateOf(false) }

    Box(
        modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.6f)).clickable(onClick = onClose),
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
            // Close "✕" (top-right).
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                Box(
                    modifier = Modifier
                        .clickable(onClick = onClose)
                        .background(Color(0x1AE8B84B), CircleShape)
                        .padding(horizontal = 10.dp, vertical = 6.dp)
                ) {
                    Text("✕", color = Color(0xFFF0CF72), style = MaterialTheme.typography.labelMedium)
                }
            }

            // Big preview stage (150x150, radial-gradient bg).
            Box(
                modifier = Modifier
                    .size(150.dp)
                    .background(
                        Brush.radialGradient(listOf(Color(0x33E8B84B), Color(0x001B1030))),
                        RoundedCornerShape(20.dp)
                    )
                    .clickable(enabled = isSkin, onClick = { showSoldier = !showSoldier }),
                contentAlignment = Alignment.Center
            ) {
                val thumb = if (isSkin && showSoldier) {
                    val base = storeThumbFor(item)
                    if (base is StoreThumb.Image) StoreThumb.Image(base.url.replace("red-king.png", "red-man.png")) else base
                } else {
                    storeThumbFor(item)
                }
                StoreThumbView(thumb, size = 96.dp)
                if (isSkin) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .padding(bottom = 8.dp)
                            .background(Color(0xCC1B1030), RoundedCornerShape(100.dp))
                            .border(1.dp, Color(0x47E8B84B), RoundedCornerShape(100.dp))
                            .padding(horizontal = 10.dp, vertical = 4.dp)
                    ) {
                        Text(
                            if (showSoldier) "Soldier · tap to flip" else "King · tap to flip",
                            color = Color(0xFFF0CF72),
                            style = MaterialTheme.typography.labelSmall
                        )
                    }
                }
            }

            Text(item.name, color = Color.White, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 14.dp))
            Text(meta?.sub ?: item.type, color = Ink2, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 2.dp, bottom = 10.dp))

            if (price > 0) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (isDeal) {
                        Text(
                            basePrice.toString(),
                            color = Ink2,
                            style = MaterialTheme.typography.bodyMedium.copy(textDecoration = androidx.compose.ui.text.style.TextDecoration.LineThrough)
                        )
                    }
                    CurrencyAmount(
                        kind = if (cur == "DIAMONDS") CurrencyIconKind.GEM else CurrencyIconKind.COIN,
                        text = price.toString(),
                        color = if (cur == "DIAMONDS") Color(0xFFFF9AA8) else Color(0xFFF2D493),
                        style = MaterialTheme.typography.titleMedium
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 20.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Optional Add-to-Cart — only for unowned priced items, mirrors
                // the card's own AddToCartButton (StoreScreen's existing cart).
                if (!owned && price > 0) {
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clickable(enabled = !inCart, onClick = onAddToCart)
                            .background(if (inCart) Color(0x243FBF6F) else Color(0x14E8B84B), RoundedCornerShape(10.dp))
                            .border(1.dp, if (inCart) Color(0x663FBF6F) else Color(0x4DE8B84B), RoundedCornerShape(10.dp))
                            .padding(vertical = 13.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            if (inCart) "In Cart ✓" else "Add to Cart",
                            color = if (inCart) Color(0xFF7FE0A3) else Color(0xFFF0CF72),
                            style = MaterialTheme.typography.labelLarge
                        )
                    }
                }
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clickable(enabled = !owned, onClick = onBuy)
                        .background(if (owned) Color(0x331B1030) else Gold, RoundedCornerShape(10.dp))
                        .padding(vertical = 13.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        if (owned) "Owned" else if (price == 0) "Claim" else "Buy Now",
                        color = if (owned) Ink2 else Color(0xFF2A1607),
                        style = MaterialTheme.typography.labelLarge.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.ExtraBold)
                    )
                }
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
            CurrencyAmount(
                kind = if (cur == "DIAMONDS") CurrencyIconKind.GEM else CurrencyIconKind.COIN,
                text = price.toString(),
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
