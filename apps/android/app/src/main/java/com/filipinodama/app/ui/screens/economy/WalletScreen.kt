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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.android.billingclient.api.ProductDetails
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.billing.BillingRepository
import com.filipinodama.app.data.billing.PurchaseUiState
import com.filipinodama.app.data.billing.findActivity
import com.filipinodama.app.data.config.ConfigRepository
import com.filipinodama.app.data.economy.EconomyRepository
import com.filipinodama.app.data.economy.EconomyResult
import com.filipinodama.app.data.economy.LedgerEntryDto
import com.filipinodama.app.ui.components.CurrencyIcon
import com.filipinodama.app.ui.components.CurrencyIconKind
import com.filipinodama.app.ui.components.MockupBackButton
import com.filipinodama.app.ui.components.screenInsets
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel
import kotlinx.coroutines.launch

/**
 * Wallet — mobile-screen-inventory.md SCREEN 32 (`isWallet`,
 * data-screen-label="Wallet"), lines 3279-3334. Reached from Home's currency
 * chip ([com.filipinodama.app.ui.screens.HomeScreen] WalletChip/onOpenWallet,
 * finding ECON-2 — that chip was previously a no-op).
 *
 * Rows built:
 *  1. `‹` MockupBackButton -> back to Home.
 *  2. Eyebrow "✦ YOUR WALLET ✦" + title "Balance".
 *  3. Balance tiles — Gold (always live) + Diamonds. The diamond tile follows
 *     the EXACT SAME gate the rest of the app already uses for the diamond
 *     balance (HomeScreen's WalletChip, StoreScreen's header pill): hidden
 *     entirely while ConfigRepository.diamondTopUpEnabled is false, shown
 *     when true. This keeps Wallet consistent rather than inventing a third
 *     behavior.
 *  4. "Buy diamonds" pack section — real Google Play Billing packs
 *     ([BillingRepository]), rendered ONLY when
 *     ConfigRepository.diamondTopUpEnabled is true (dark today = nothing
 *     renders and Play Billing is never even connected). This is the ONE
 *     sanctioned real-money path on Android (Play Store policy forbids an
 *     external/PayMongo checkout here) — the economy layer's hard policy
 *     (EconomyDtos.kt / EconomyRepository.kt) that Android never calls
 *     apps/server's PayMongo payments surface still holds; this section talks
 *     ONLY to PlayBillingApi (api/payments/play/products,
 *     api/payments/play/verify), a completely separate endpoint family. Real
 *     Play-formatted prices only — never a fabricated price. The server is
 *     the sole crediting authority: BillingRepository forwards the purchase
 *     to POST /api/payments/play/verify and only consumes the Play purchase
 *     after that call confirms the credit.
 *  5. "Recent activity" — real GET /api/users/me/ledger rows (label/reason,
 *     relative timestamp, signed amount, correct currency icon). Honest empty
 *     state ("No activity yet") when the ledger is empty; honest error state
 *     with Retry on a failed fetch.
 */
@Composable
fun WalletScreen(onBack: () -> Unit = {}) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val authState by AuthRepository.state.collectAsState()
    val me = authState.user
    val diamondTopUpEnabled by ConfigRepository.diamondTopUpEnabled.collectAsState()
    val billingProducts by BillingRepository.products.collectAsState()
    val purchaseState by BillingRepository.purchaseState.collectAsState()

    var ledger by remember { mutableStateOf<List<LedgerEntryDto>?>(null) } // null = loading
    var ledgerError by remember { mutableStateOf(false) }

    suspend fun loadLedger() {
        ledger = null
        ledgerError = false
        when (val result = EconomyRepository.ledger()) {
            is EconomyResult.Success -> ledger = result.data.items
            is EconomyResult.Failure -> {
                ledger = emptyList()
                ledgerError = true
            }
        }
    }

    LaunchedEffect(Unit) { loadLedger() }

    // Buy-diamonds section: only ever connect to Play Billing / fetch products
    // when the dark gate is on. While diamondTopUpEnabled is false this whole
    // block never runs, matching "dark = no section, no network calls" for
    // the payments surface, same posture as before this was wired.
    LaunchedEffect(diamondTopUpEnabled) {
        if (diamondTopUpEnabled) {
            BillingRepository.connect(context)
            BillingRepository.loadProducts()
        }
    }

    // Re-sync the ledger + billing products after a purchase completes so the
    // balance tile and "Recent activity" reflect the server-confirmed credit.
    LaunchedEffect(purchaseState) {
        if (purchaseState is PurchaseUiState.Success) {
            loadLedger()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .screenInsets()
            .background(MaterialTheme.colorScheme.background)
            .verticalScroll(rememberScrollState())
            .padding(20.dp)
    ) {
        MockupBackButton(onClick = onBack)

        Text(
            "✦ YOUR WALLET ✦",
            color = Gold,
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(top = 16.dp)
        )
        Text(
            "Balance",
            color = Color(0xFFF4ECD6),
            style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.ExtraBold),
            modifier = Modifier.padding(top = 4.dp, bottom = 18.dp)
        )

        // Balance tiles.
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            BalanceTile(
                modifier = Modifier.weight(1f),
                kind = CurrencyIconKind.COIN,
                label = "Gold",
                value = me?.gold ?: 0,
                valueColor = Color(0xFFF0CF72),
                tint = Color(0xFFE8B84B)
            )
            // Diamond balance tile — same fail-closed gate as WalletChip/
            // StoreScreen's diamond pill (see file kdoc point 3).
            if (diamondTopUpEnabled) {
                BalanceTile(
                    modifier = Modifier.weight(1f),
                    kind = CurrencyIconKind.GEM,
                    label = "Diamonds",
                    value = me?.diamonds ?: 0,
                    valueColor = Color(0xFF8FB3FF),
                    tint = Color(0xFF5A96FF)
                )
            }
        }

        // "Buy diamonds" — see file kdoc point 4. Renders nothing while
        // diamondTopUpEnabled is false (dark today); Play Billing is never
        // even connected in that case (see the LaunchedEffect above).
        if (diamondTopUpEnabled) {
            BuyDiamondsSection(
                products = billingProducts,
                purchaseState = purchaseState,
                onBuy = { productDetails ->
                    val activity = context.findActivity()
                    if (activity != null) {
                        BillingRepository.launchPurchase(activity, productDetails)
                    }
                },
                onDismissState = { BillingRepository.dismissPurchaseState() }
            )
        }

        Text(
            "Recent activity",
            color = GoldLt,
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(top = 26.dp, bottom = 12.dp)
        )

        when {
            ledger == null -> Box(Modifier.fillMaxWidth().padding(vertical = 32.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Gold)
            }
            ledgerError -> Box(Modifier.fillMaxWidth().padding(vertical = 24.dp), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        "Couldn't load your recent activity.",
                        color = Ink2,
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Text(
                        "Retry",
                        color = GoldLt,
                        style = MaterialTheme.typography.labelLarge,
                        modifier = Modifier.padding(top = 12.dp).clickable { scope.launch { loadLedger() } }
                    )
                }
            }
            ledger!!.isEmpty() -> Box(Modifier.fillMaxWidth().padding(vertical = 24.dp), contentAlignment = Alignment.Center) {
                Text("No activity yet", color = Ink2, style = MaterialTheme.typography.bodyMedium)
            }
            else -> {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    ledger!!.forEach { entry -> LedgerRow(entry) }
                }
            }
        }

        Box(Modifier.size(24.dp))
    }
}

@Composable
private fun BalanceTile(
    modifier: Modifier = Modifier,
    kind: CurrencyIconKind,
    label: String,
    value: Int,
    valueColor: Color,
    tint: Color
) {
    Column(
        modifier = modifier
            .background(Panel, RoundedCornerShape(16.dp))
            .border(1.dp, tint.copy(alpha = 0.28f), RoundedCornerShape(16.dp))
            .padding(16.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            CurrencyIcon(kind = kind, size = 18.dp)
            Text(label, color = Color(0xFF8B7CAE), style = MaterialTheme.typography.labelMedium)
        }
        Text(
            value.toString(),
            color = valueColor,
            style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.ExtraBold),
            modifier = Modifier.padding(top = 8.dp)
        )
    }
}

/**
 * "Buy diamonds" pack list — mobile-screen-inventory.md SCREEN 32 row 4
 * ("pack list, same shape as Top-Up modal"). Packs come from
 * [BillingRepository.products] (real [ProductDetails] queried from Play), so
 * the price shown is always Play's own formatted string
 * (`oneTimePurchaseOfferDetails.formattedPrice`) — never a fabricated number.
 * An empty list (still loading, or the server/Play returned nothing) renders
 * an honest "Diamond packs aren't available right now" note instead of a
 * blank gap, matching this screen's existing honest-empty-state convention.
 */
@Composable
private fun BuyDiamondsSection(
    products: List<ProductDetails>,
    purchaseState: PurchaseUiState,
    onBuy: (ProductDetails) -> Unit,
    onDismissState: () -> Unit
) {
    val busy = purchaseState is PurchaseUiState.Purchasing || purchaseState is PurchaseUiState.Verifying

    Column(modifier = Modifier.padding(top = 26.dp)) {
        Text(
            "Buy diamonds",
            color = GoldLt,
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(bottom = 12.dp)
        )

        when (purchaseState) {
            is PurchaseUiState.Success -> {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Panel, RoundedCornerShape(14.dp))
                        .border(1.dp, Color(0xFF7FE0A3).copy(alpha = 0.35f), RoundedCornerShape(14.dp))
                        .padding(14.dp)
                        .clickable { onDismissState() },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    CurrencyIcon(kind = CurrencyIconKind.GEM, size = 18.dp)
                    Text(
                        "+${purchaseState.diamonds} diamonds credited. Tap to dismiss.",
                        color = Color(0xFF7FE0A3),
                        style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold)
                    )
                }
                Box(Modifier.padding(top = 10.dp))
            }
            is PurchaseUiState.Error -> {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Panel, RoundedCornerShape(14.dp))
                        .border(1.dp, Color(0xFFFF8F9C).copy(alpha = 0.35f), RoundedCornerShape(14.dp))
                        .padding(14.dp)
                        .clickable { onDismissState() },
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        purchaseState.message,
                        color = Color(0xFFFF8F9C),
                        style = MaterialTheme.typography.labelMedium
                    )
                }
                Box(Modifier.padding(top = 10.dp))
            }
            else -> {}
        }

        if (products.isEmpty()) {
            Text(
                if (busy) "Confirming your purchase…" else "Diamond packs aren't available right now.",
                color = Ink2,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(vertical = 8.dp)
            )
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                products.forEach { product ->
                    DiamondPackRow(product = product, enabled = !busy, onBuy = { onBuy(product) })
                }
            }
        }
    }
}

@Composable
private fun DiamondPackRow(product: ProductDetails, enabled: Boolean, onBuy: () -> Unit) {
    val offer = product.oneTimePurchaseOfferDetails
    val price = offer?.formattedPrice ?: "—"
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Panel, RoundedCornerShape(14.dp))
            .border(1.dp, Gold.copy(alpha = 0.2f), RoundedCornerShape(14.dp))
            .clickable(enabled = enabled) { onBuy() }
            .padding(14.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            CurrencyIcon(kind = CurrencyIconKind.GEM, size = 22.dp)
            Column {
                Text(
                    product.title,
                    color = Color(0xFFE6DCF5),
                    style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold)
                )
                if (!product.description.isNullOrBlank()) {
                    Text(
                        product.description,
                        color = Ink2,
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.padding(top = 2.dp)
                    )
                }
            }
        }
        Text(
            price,
            color = GoldLt,
            style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.ExtraBold)
        )
    }
}

@Composable
private fun LedgerRow(entry: LedgerEntryDto) {
    val positive = entry.amount >= 0
    val amountColor = if (positive) Color(0xFF7FE0A3) else Color(0xFFFF8F9C)
    val currencyKind = when (entry.currency) {
        "DIAMONDS" -> CurrencyIconKind.GEM
        "TROPHIES" -> CurrencyIconKind.TROPHY
        else -> CurrencyIconKind.COIN
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Panel, RoundedCornerShape(14.dp))
            .padding(14.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                ledgerReasonLabel(entry.reason),
                color = Color(0xFFE6DCF5),
                style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold)
            )
            Text(
                relativeTimeLabel(entry.createdAt),
                color = Ink2,
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.padding(top = 3.dp)
            )
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            CurrencyIcon(kind = currencyKind, size = 15.dp)
            Text(
                "${if (positive) "+" else ""}${entry.amount}",
                color = amountColor,
                style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.ExtraBold)
            )
        }
    }
}

/** Humanizes the ledger's raw `reason` code (e.g. "purchase", "daily_login") into a display label. */
private fun ledgerReasonLabel(reason: String?): String {
    if (reason.isNullOrBlank()) return "Wallet activity"
    return reason
        .replace('_', ' ')
        .split(' ')
        .joinToString(" ") { word -> word.replaceFirstChar { it.uppercase() } }
}

private fun relativeTimeLabel(iso: String): String {
    val then = try { java.time.Instant.parse(iso) } catch (_: Exception) { return "" }
    val secs = java.time.temporal.ChronoUnit.SECONDS.between(then, java.time.Instant.now()).coerceAtLeast(0)
    return when {
        secs < 45 -> "Just now"
        secs < 3600 -> "${secs / 60}m ago"
        secs < 86400 -> "${secs / 3600}h ago"
        secs < 604800 -> "${secs / 86400}d ago"
        else -> "${secs / 604800}w ago"
    }
}
