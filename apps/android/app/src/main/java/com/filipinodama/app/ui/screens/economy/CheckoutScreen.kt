package com.filipinodama.app.ui.screens.economy

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.Icon
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.filipinodama.app.data.economy.EconomyRepository
import com.filipinodama.app.data.economy.EconomyResult
import com.filipinodama.app.data.economy.STORE_TYPE_META
import com.filipinodama.app.data.economy.StoreItemDto
import com.filipinodama.app.data.economy.StoreThumb
import com.filipinodama.app.data.economy.storeItemCurrency
import com.filipinodama.app.data.economy.storeItemPrice
import com.filipinodama.app.data.economy.storeThumbFor
import com.filipinodama.app.ui.components.CurrencyIcon
import com.filipinodama.app.ui.components.CurrencyIconKind
import com.filipinodama.app.ui.components.MockupBackButtonCheckout
import com.filipinodama.app.ui.components.screenInsets
import kotlinx.coroutines.launch

/**
 * Checkout — mockup lines 896-960 ("CHECKOUT" screen). Reached from the Store
 * top bar's 🛒 Cart button (line 795). Currency-agnostic by design: totals,
 * balances, shortfall, and Place-Order all key off each cart item's OWN
 * currency (via [storeItemCurrency]) rather than assuming gold, since this is
 * the real checkout path that will also carry diamond-priced items once
 * DIAMOND_TOPUP_ENABLED flips true.
 *
 * Placing an order loops [EconomyRepository.purchase] over the cart
 * sequentially (there is no batch-purchase endpoint) — on full success the
 * cart clears and the caller returns to the store; on a failure partway
 * through, already-purchased items are removed from the cart (they truly are
 * now owned) and the remainder stays so the user can retry.
 */

private enum class PlaceOrderState { IDLE, PLACING, ERROR }

@Composable
fun CheckoutScreen(
    cart: List<StoreItemDto>,
    goldBalance: Int,
    diamondBalance: Int,
    diamondTopUpEnabled: Boolean,
    onRemove: (String) -> Unit,
    onClear: () -> Unit,
    onBrowseStore: () -> Unit,
    onBack: () -> Unit,
    onOpenTopUp: () -> Unit,
    onOrderPlaced: (purchasedIds: Set<String>) -> Unit,
    // Universal rule: if placing the order fails because the user isn't signed
    // in, prompt sign-in instead of showing a generic error.
    onRequireSignIn: () -> Unit = {}
) {
    // Keep purchase details out of screenshots / Recents (M-2).
    com.filipinodama.app.ui.components.SecureScreen()
    val scope = rememberCoroutineScope()
    var placeState by remember { mutableStateOf(PlaceOrderState.IDLE) }
    var errorMessage by remember { mutableStateOf("") }

    val totalsByCurrency = remember(cart) {
        cart.groupBy { storeItemCurrency(it) }
            .mapValues { (_, items) -> items.sumOf { storeItemPrice(it) } }
    }
    fun balanceFor(currency: String): Int = if (currency == "DIAMONDS") diamondBalance else goldBalance
    val shortfallCurrency = remember(totalsByCurrency, goldBalance, diamondBalance) {
        totalsByCurrency.entries.firstOrNull { (currency, total) -> total > balanceFor(currency) }?.key
    }
    val hasShortfall = shortfallCurrency != null
    val cartEmpty = cart.isEmpty()

    fun placeOrder() {
        if (cartEmpty || hasShortfall || placeState == PlaceOrderState.PLACING) return
        placeState = PlaceOrderState.PLACING
        errorMessage = ""
        scope.launch {
            val purchased = mutableSetOf<String>()
            var failMessage: String? = null
            var authFailed = false
            for (item in cart) {
                when (val result = EconomyRepository.purchase(item.id)) {
                    is EconomyResult.Success -> purchased += item.id
                    is EconomyResult.Failure -> {
                        if (com.filipinodama.app.ui.components.isAuthError(result.code)) {
                            authFailed = true
                        } else {
                            failMessage = result.message
                        }
                        break
                    }
                }
            }
            when {
                authFailed -> {
                    // Not signed in — hand off to the guided sign-in prompt
                    // instead of showing a generic error (universal rule).
                    if (purchased.isNotEmpty()) onOrderPlaced(purchased)
                    placeState = PlaceOrderState.IDLE
                    onRequireSignIn()
                }
                failMessage == null -> {
                    placeState = PlaceOrderState.IDLE
                    onOrderPlaced(purchased)
                }
                else -> {
                    if (purchased.isNotEmpty()) onOrderPlaced(purchased)
                    errorMessage = failMessage
                    placeState = PlaceOrderState.ERROR
                }
            }
        }
    }

    Column(modifier = Modifier.fillMaxSize().screenInsets().background(MaterialTheme.colorScheme.background)) {
        // Header: ‹ back (36x36 checkout variant) + "Checkout" + Clear.
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp, 20.dp, 16.dp, 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            MockupBackButtonCheckout(onClick = onBack)
            Text(
                "Checkout",
                color = Color(0xFFF4ECD6),
                style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.ExtraBold, fontSize = 24.sp)
            )
            Box(modifier = Modifier.weight(1f))
            if (cart.isNotEmpty()) {
                Text(
                    "CLEAR",
                    color = Color(0xFFA68BD0),
                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold, letterSpacing = 0.5.sp),
                    modifier = Modifier.clickable(onClick = onClear)
                )
            }
        }

        if (cartEmpty) {
            CheckoutEmptyState(onBrowseStore = onBrowseStore)
        } else {
            Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
                val cartCountLabel = "${cart.size} ITEM${if (cart.size == 1) "" else "S"}"
                Text(
                    cartCountLabel,
                    color = Color(0xFF8B7CAE),
                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold, letterSpacing = 1.5.sp),
                    modifier = Modifier.padding(start = 20.dp, end = 20.dp, bottom = 12.dp)
                )

                Column(
                    modifier = Modifier.padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    cart.forEach { item ->
                        CartLineItem(item = item, onRemove = { onRemove(item.id) })
                    }
                }

                OrderSummary(
                    totalsByCurrency = totalsByCurrency,
                    goldBalance = goldBalance,
                    diamondBalance = diamondBalance,
                    shortfallCurrency = shortfallCurrency,
                    diamondTopUpEnabled = diamondTopUpEnabled,
                    onOpenTopUp = onOpenTopUp
                )

                // Place Order.
                Column(modifier = Modifier.padding(16.dp, 16.dp, 16.dp, 0.dp)) {
                    val label = when {
                        cartEmpty -> "Cart is empty"
                        hasShortfall -> "Not Enough Balance"
                        placeState == PlaceOrderState.PLACING -> "Placing Order…"
                        else -> "Place Order"
                    }
                    val enabled = !cartEmpty && !hasShortfall && placeState != PlaceOrderState.PLACING
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(
                                if (enabled) Brush.verticalGradient(listOf(Color(0xFFEFC25A), Color(0xFFC9971F)))
                                else Brush.verticalGradient(listOf(Color(0x331B1030), Color(0x331B1030))),
                                RoundedCornerShape(13.dp)
                            )
                            .clickable(enabled = enabled, onClick = ::placeOrder)
                            .padding(vertical = 15.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        if (placeState == PlaceOrderState.PLACING) {
                            CircularProgressIndicator(color = Color(0xFF2A1608), modifier = Modifier.size(18.dp))
                        } else {
                            Text(
                                label,
                                color = if (enabled) Color(0xFF2A1608) else Color(0xFF6F6091),
                                style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.ExtraBold)
                            )
                        }
                    }
                    Text(
                        "Items are delivered instantly to your inventory.",
                        color = Color(0xFF6F6091),
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp),
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth().padding(top = 10.dp)
                    )
                    if (placeState == PlaceOrderState.ERROR && errorMessage.isNotEmpty()) {
                        Text(
                            errorMessage,
                            color = Color(0xFFFF9AA6),
                            style = MaterialTheme.typography.labelSmall,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth().padding(top = 8.dp)
                        )
                    }
                }

                Box(Modifier.size(24.dp))
            }
        }
    }
}

/** Mockup `border-top:1px` hairline — a 1px rule along the top edge only. */
private fun Modifier.drawTopDivider(color: Color): Modifier = this.drawBehind {
    val stroke = 1.dp.toPx()
    drawLine(
        color = color,
        start = androidx.compose.ui.geometry.Offset(0f, stroke / 2f),
        end = androidx.compose.ui.geometry.Offset(size.width, stroke / 2f),
        strokeWidth = stroke
    )
}

@Composable
private fun CheckoutEmptyState(onBrowseStore: () -> Unit) {
    Box(Modifier.fillMaxWidth().padding(top = 70.dp, start = 40.dp, end = 40.dp, bottom = 40.dp), contentAlignment = Alignment.TopCenter) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                modifier = Modifier
                    .size(74.dp)
                    .background(Color(0x14E8B84B), RoundedCornerShape(20.dp))
                    .border(1.dp, Color(0x33E8B84B), RoundedCornerShape(20.dp)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Filled.ShoppingCart,
                    contentDescription = null,
                    tint = Color(0xFFF0CF72),
                    modifier = Modifier.size(34.dp)
                )
            }
            Text(
                "Your cart is empty",
                color = Color(0xFFF4ECD6),
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.ExtraBold, fontSize = 18.sp),
                modifier = Modifier.padding(top = 14.dp)
            )
            Text(
                "Browse the store and add boards, skins, and frames to your cart.",
                color = Color(0xFF8B7CAE),
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 14.dp)
            )
            Box(
                modifier = Modifier
                    .background(Brush.verticalGradient(listOf(Color(0xFFEFC25A), Color(0xFFC9971F))), RoundedCornerShape(13.dp))
                    .clickable(onClick = onBrowseStore)
                    .padding(horizontal = 26.dp, vertical = 13.dp)
                    .padding(top = 6.dp),
                contentAlignment = Alignment.Center
            ) {
                Text("Browse Store", color = Color(0xFF2A1608), style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.ExtraBold))
            }
        }
    }
}

@Composable
private fun CartLineItem(item: StoreItemDto, onRemove: () -> Unit) {
    val currency = storeItemCurrency(item)
    val price = storeItemPrice(item)
    val curColor = if (currency == "DIAMONDS") Color(0xFF8FB3FF) else Color(0xFFF0CF72)
    val sub = STORE_TYPE_META[item.type]?.sub ?: item.type

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xCC1B1030), RoundedCornerShape(16.dp))
            .border(1.dp, Color(0x24E8B84B), RoundedCornerShape(16.dp))
            .padding(12.dp, 11.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(13.dp)
    ) {
        Box(
            modifier = Modifier
                .size(56.dp)
                .background(Color(0xFF160B2C), RoundedCornerShape(12.dp))
                .border(1.dp, Color(0x2EE8B84B), RoundedCornerShape(12.dp)),
            contentAlignment = Alignment.Center
        ) {
            CheckoutThumb(storeThumbFor(item))
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(item.name, color = Color(0xFFE6DCF5), style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.ExtraBold, fontSize = 13.sp))
            Text(sub, color = Color(0xFF8B7CAE), style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp), modifier = Modifier.padding(top = 2.dp))
            Row(
                modifier = Modifier.padding(top = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(5.dp)
            ) {
                CurrencyIcon(kind = if (currency == "DIAMONDS") CurrencyIconKind.GEM else CurrencyIconKind.COIN, size = 14.dp)
                Text(price.toString(), color = curColor, style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.ExtraBold, fontSize = 13.sp))
            }
        }
        Box(
            modifier = Modifier
                .size(30.dp)
                .background(Color(0x1AFF5A6A), RoundedCornerShape(9.dp))
                .border(1.dp, Color(0x47FF5A6A), RoundedCornerShape(9.dp))
                .clickable(onClick = onRemove),
            contentAlignment = Alignment.Center
        ) {
            Text("×", color = Color(0xFFFF8F9C), style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold, fontSize = 15.sp))
        }
    }
}

@Composable
private fun CheckoutThumb(thumb: StoreThumb) {
    when (thumb) {
        is StoreThumb.Image -> coil.compose.AsyncImage(
            model = thumb.url,
            contentDescription = null,
            modifier = Modifier.size(40.dp),
            contentScale = androidx.compose.ui.layout.ContentScale.Fit
        )
        is StoreThumb.Portrait -> Box(
            modifier = Modifier.size(40.dp).background(Color(0xFF0F0820), CircleShape),
            contentAlignment = Alignment.Center
        ) {
            coil.compose.AsyncImage(
                model = thumb.url,
                contentDescription = null,
                modifier = Modifier.size(40.dp).background(Color.Transparent, CircleShape),
                contentScale = androidx.compose.ui.layout.ContentScale.Crop
            )
        }
        StoreThumb.Disc -> Box(modifier = Modifier.size(40.dp).background(Color(0xFFA0303A), CircleShape))
    }
}

@Composable
private fun OrderSummary(
    totalsByCurrency: Map<String, Int>,
    goldBalance: Int,
    diamondBalance: Int,
    shortfallCurrency: String?,
    diamondTopUpEnabled: Boolean,
    onOpenTopUp: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp, 20.dp, 16.dp, 0.dp)
            .background(Color(0xB31B1030), RoundedCornerShape(18.dp))
            .border(1.dp, Color(0x29E8B84B), RoundedCornerShape(18.dp))
            .padding(16.dp, 16.dp, 16.dp, 6.dp)
    ) {
        Text(
            "ORDER SUMMARY",
            color = Color(0xFF8B7CAE),
            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold, letterSpacing = 1.5.sp),
            modifier = Modifier.padding(bottom = 12.dp)
        )

        totalsByCurrency.forEach { (currency, total) ->
            val balance = if (currency == "DIAMONDS") diamondBalance else goldBalance
            val curColor = if (currency == "DIAMONDS") Color(0xFF8FB3FF) else Color(0xFFF0CF72)
            val label = if (currency == "DIAMONDS") "Diamond total" else "Gold total"
            val balOk = balance >= total
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    // Mockup (line 939): border-TOP only, a hairline divider —
                    // not a full box. Draw a 1px top rule via a thin Box above.
                    .drawTopDivider(Color(0x14E8B84B))
                    .padding(vertical = 6.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(label, color = Color(0xFFC9B8E0), style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold, fontSize = 12.sp))
                    Text(
                        "Balance $balance",
                        color = if (balOk) Color(0xFF7FE0A3) else Color(0xFFFF9AA6),
                        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold, fontSize = 10.sp),
                        modifier = Modifier.padding(top = 2.dp)
                    )
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    CurrencyIcon(kind = if (currency == "DIAMONDS") CurrencyIconKind.GEM else CurrencyIconKind.COIN, size = 17.dp)
                    Text(total.toString(), color = curColor, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.ExtraBold, fontSize = 17.sp))
                }
            }
        }

        if (shortfallCurrency != null) {
            val total = totalsByCurrency[shortfallCurrency] ?: 0
            val balance = if (shortfallCurrency == "DIAMONDS") diamondBalance else goldBalance
            val need = total - balance
            val unit = if (shortfallCurrency == "DIAMONDS") "diamonds" else "gold"
            val showTopUp = shortfallCurrency == "DIAMONDS" && diamondTopUpEnabled
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 10.dp, bottom = 4.dp)
                    .background(Color(0x1AFF5A6A), RoundedCornerShape(11.dp))
                    .border(1.dp, Color(0x40FF5A6A), RoundedCornerShape(11.dp))
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "You need $need more $unit.",
                    color = Color(0xFFFF9AA6),
                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold, fontSize = 11.5.sp),
                    modifier = Modifier.weight(1f)
                )
                if (showTopUp) {
                    Box(
                        modifier = Modifier
                            .background(Brush.verticalGradient(listOf(Color(0xFF7FA8FF), Color(0xFF4D78E0))), RoundedCornerShape(9.dp))
                            .clickable(onClick = onOpenTopUp)
                            .padding(horizontal = 12.dp, vertical = 7.dp)
                    ) {
                        Text("Top up", color = Color(0xFF0B1430), style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.ExtraBold, fontSize = 10.5.sp))
                    }
                }
            }
        }
    }
}
