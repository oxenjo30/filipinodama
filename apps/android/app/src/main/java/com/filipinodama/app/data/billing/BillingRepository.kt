package com.filipinodama.app.data.billing

import android.app.Activity
import android.content.Context
import android.util.Log
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.ConsumeParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.consumePurchase
import com.android.billingclient.api.queryProductDetails
import com.filipinodama.app.data.ApiClient
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.AuthSessionKey
import com.filipinodama.app.data.economy.EconomyRepository
import com.filipinodama.app.data.isCurrentAuthSession
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * BillingRepository — Google Play Billing (Play Billing Library 7.1.1) client
 * for the real-money diamond top-up, matching this scaffold's singleton-object
 * convention (see [AuthRepository], [EconomyRepository]) rather than a DI
 * framework or ViewModel.
 *
 * THE HARD RULE: the SERVER is the sole crediting authority. This repository
 * never adds diamonds to any local/cached balance itself — it only launches
 * the Play purchase flow, forwards the completed purchase to
 * `POST /api/payments/play/verify`, and — ONLY after that call reports
 * `credited || alreadyProcessed` — tells Play the purchase is fulfilled via
 * [BillingClient.consumePurchase]. Diamonds are a CONSUMABLE product (the same
 * pack can be bought again and again), so this uses `consumeAsync`
 * (`consumePurchase` KTX extension), never `acknowledgePurchase` alone — an
 * unconsumed one-time product would block the user from buying that pack
 * again. If the server call fails, the purchase is intentionally left
 * un-consumed/un-acknowledged so Play's own refund-after-3-days safety net
 * stays intact and a retry (e.g. next app foreground) can still recover it.
 *
 * Everything here is reached only from behind
 * [com.filipinodama.app.data.config.ConfigRepository.diamondTopUpEnabled] —
 * dark today. `connect()` is safe to call even while dark; it just won't be
 * invoked from any composable while the gate is off.
 */
object BillingRepository {

    private const val TAG = "BillingRepository"

    private val api: PlayBillingApi by lazy { ApiClient.create<PlayBillingApi>() }

    @Volatile
    private var billingClient: BillingClient? = null

    @Volatile
    private var connecting = false

    /** Session that launched the currently open Play purchase sheet. */
    @Volatile
    private var activePurchaseSessionKey: AuthSessionKey? = null

    private val _products = MutableStateFlow<List<ProductDetails>>(emptyList())
    /** Play's own product listing (real formatted prices) — never fabricated. */
    val products: StateFlow<List<ProductDetails>> = _products.asStateFlow()

    /**
     * Purchase feedback is tagged with the account that started it. The public
     * state also observes auth changes, so an account switch immediately turns
     * an older player's verification/result into [PurchaseUiState.Idle] even
     * when it races with an in-flight billing callback.
     */
    private val _purchaseState = MutableStateFlow(
        SessionPurchaseUiState(sessionKey = null, state = PurchaseUiState.Idle)
    )
    private val purchaseStateScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    val purchaseState: StateFlow<PurchaseUiState> = combine(_purchaseState, AuthRepository.state) { purchase, auth ->
        purchaseUiStateForSession(
            requestSession = purchase.sessionKey,
            currentSession = com.filipinodama.app.data.authSessionKey(auth),
            desiredState = purchase.state,
        )
    }.stateIn(
        scope = purchaseStateScope,
        started = SharingStarted.Eagerly,
        initialValue = PurchaseUiState.Idle,
    )

    private val purchasesUpdatedListener = PurchasesUpdatedListener { billingResult, purchases ->
        val initiatingSession = activePurchaseSessionKey
        when (billingResult.responseCode) {
            BillingClient.BillingResponseCode.OK -> {
                if (purchases.isNullOrEmpty()) {
                    initiatingSession?.let { publishPurchaseState(it, PurchaseUiState.Idle) }
                    activePurchaseSessionKey = null
                    return@PurchasesUpdatedListener
                }
                purchases.forEach { purchase -> handlePurchase(purchase, initiatingSession) }
                activePurchaseSessionKey = null
            }
            BillingClient.BillingResponseCode.USER_CANCELED -> {
                // Quiet — matches the mockup's "cancel" affordance, no error toast.
                initiatingSession?.let { publishPurchaseState(it, PurchaseUiState.Idle) }
                activePurchaseSessionKey = null
            }
            BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED -> {
                // A pending consumable from a previous session Play still thinks is
                // "owned" — reconcile it via queryPurchases so it gets verified +
                // consumed instead of stranding the user unable to buy again.
                reconcileUnfinishedPurchases(initiatingSession)
                activePurchaseSessionKey = null
            }
            else -> {
                initiatingSession?.let { sessionKey ->
                    publishPurchaseState(sessionKey, PurchaseUiState.Error(
                        billingResult.debugMessage.ifBlank { "Purchase could not be started." }
                    ))
                }
                activePurchaseSessionKey = null
            }
        }
    }

    /** Idempotent — safe to call from every screen that might show the buy UI. */
    fun connect(context: Context) {
        val existing = billingClient
        if (existing != null && existing.isReady) return
        if (connecting) return
        connecting = true

        val client = billingClient ?: BillingClient.newBuilder(context.applicationContext)
            .setListener(purchasesUpdatedListener)
            .enablePendingPurchases(
                com.android.billingclient.api.PendingPurchasesParams.newBuilder()
                    .enableOneTimeProducts()
                    .build()
            )
            .build()
        billingClient = client

        client.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(billingResult: BillingResult) {
                connecting = false
                if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                    reconcileUnfinishedPurchases()
                } else {
                    Log.w(TAG, "Billing setup failed: ${billingResult.debugMessage}")
                }
            }

            override fun onBillingServiceDisconnected() {
                connecting = false
                // Play's guidance: retry the connection on the next relevant user
                // action rather than looping forever in the background.
            }
        })
    }

    /**
     * Queries the server for the enabled pack -> Play product-id map, then
     * queries Play itself for real ProductDetails (formatted price, title).
     * No-ops (leaves [products] empty) when the server reports the feature
     * disabled — the dark gate is enforced server-side too, not just by the
     * caller checking ConfigRepository first.
     */
    suspend fun loadProducts() {
        val client = billingClient
        if (client == null || !client.isReady) {
            _products.value = emptyList()
            return
        }
        val serverProducts = try {
            val envelope = api.products()
            if (envelope.ok) envelope.data else null
        } catch (e: Exception) {
            null
        } ?: run {
            _products.value = emptyList()
            return
        }
        if (!serverProducts.enabled || serverProducts.products.isEmpty()) {
            _products.value = emptyList()
            return
        }

        val productList = serverProducts.products.map { p ->
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(p.productId)
                .setProductType(BillingClient.ProductType.INAPP)
                .build()
        }
        val params = QueryProductDetailsParams.newBuilder().setProductList(productList).build()

        val result = try {
            client.queryProductDetails(params)
        } catch (e: Exception) {
            _products.value = emptyList()
            return
        }
        if (result.billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
            _products.value = result.productDetailsList ?: emptyList()
        } else {
            _products.value = emptyList()
        }
    }

    /** Launches the Play purchase sheet for a single INAPP product. */
    fun launchPurchase(activity: Activity, productDetails: ProductDetails) {
        val client = billingClient
        if (client == null || !client.isReady) {
            publishPurchaseState(PurchaseUiState.Error("Store connection isn't ready yet. Try again in a moment."))
            return
        }
        // Diamond packs are one-time (INAPP) products, not subscriptions — v7.1.1's
        // OneTimePurchaseOfferDetails carries no offer token to forward (offer
        // tokens in this API apply to subscription offers), so ProductDetails
        // alone is sufficient here.
        val productDetailsParamsList = listOf(
            BillingFlowParams.ProductDetailsParams.newBuilder()
                .setProductDetails(productDetails)
                .build()
        )
        // ACCOUNT BINDING — required. The server FAILS CLOSED without it.
        //
        // Without an obfuscated account id, a Play purchase token is a BEARER
        // credential: whoever redeems it first gets the diamonds, and the real
        // buyer's client is then told `alreadyProcessed`, reads that as success,
        // CONSUMES the purchase (destroying the entitlement and Play's 3-day
        // refund window) and shows "+N diamonds credited" to someone who
        // received nothing.
        //
        // Google echoes this value back on the purchase, and the server rejects
        // any purchase whose token doesn't match the CALLER's own — so a token
        // lifted from another account is worthless. Must stay byte-for-byte
        // identical to the server's playAccountToken() (payments.ts).
        val sessionKey = AuthRepository.currentSessionKey()
        val accountToken = playAccountToken(sessionKey.userId)
        if (accountToken == null) {
            publishPurchaseState(sessionKey, PurchaseUiState.Error("Sign in to buy diamonds."))
            return
        }

        val flowParams = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(productDetailsParamsList)
            .setObfuscatedAccountId(accountToken)
            .build()

        activePurchaseSessionKey = sessionKey
        publishPurchaseState(sessionKey, PurchaseUiState.Purchasing)
        val billingResult = client.launchBillingFlow(activity, flowParams)
        if (billingResult.responseCode != BillingClient.BillingResponseCode.OK) {
            publishPurchaseState(sessionKey, PurchaseUiState.Error(
                billingResult.debugMessage.ifBlank { "Couldn't open the purchase flow." }
            ))
            activePurchaseSessionKey = null
        }
        // Further progress is reported via purchasesUpdatedListener.
    }

    fun dismissPurchaseState() {
        _purchaseState.value = SessionPurchaseUiState(sessionKey = null, state = PurchaseUiState.Idle)
    }

    /**
     * On reconnect (or ITEM_ALREADY_OWNED), re-checks Play for any PURCHASED
     * consumable that was never consumed — e.g. the app died between Play
     * confirming the purchase and the server-verify round trip completing.
     * Runs the exact same verify -> consume path so no purchase is silently
     * lost, and no diamonds are ever credited without a fresh, successful
     * server verification of that specific purchase token.
     */
    private fun reconcileUnfinishedPurchases(initiatingSession: AuthSessionKey? = null) {
        val client = billingClient ?: return
        client.queryPurchasesAsync(
            com.android.billingclient.api.QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.INAPP)
                .build()
        ) { billingResult, purchases ->
            if (billingResult.responseCode != BillingClient.BillingResponseCode.OK) return@queryPurchasesAsync
            purchases
                .filter { it.purchaseState == com.android.billingclient.api.Purchase.PurchaseState.PURCHASED }
                .forEach { handlePurchase(it, initiatingSession) }
        }
    }

    /**
     * Verify-then-consume for one Purchase. NEVER consumes/acknowledges
     * before the server confirms the credit — a failed/timed-out verify call
     * leaves the purchase exactly as Play reported it, so it will be retried
     * (next launch's [reconcileUnfinishedPurchases], or the user re-opening
     * the Wallet) instead of silently losing the player's payment.
     */
    private fun handlePurchase(
        purchase: com.android.billingclient.api.Purchase,
        initiatingSession: AuthSessionKey? = null,
    ) {
        if (purchase.purchaseState != com.android.billingclient.api.Purchase.PurchaseState.PURCHASED) {
            return
        }
        val productId = purchase.products.firstOrNull() ?: return
        val purchaseToken = purchase.purchaseToken
        val sessionKey = purchaseSessionForCallback(
            initiatingSession = initiatingSession,
            currentSession = AuthRepository.currentSessionKey(),
            purchaseAccountId = purchase.accountIdentifiers?.obfuscatedAccountId,
        ) ?: return

        publishPurchaseState(sessionKey, PurchaseUiState.Verifying)
        CoroutineScope(Dispatchers.IO).launch {
            val result = try {
                val envelope = api.verifyPlay(PlayVerifyRequest(productId = productId, purchaseToken = purchaseToken))
                if (envelope.ok && envelope.data != null) VerifyOutcome.Success(envelope.data) else {
                    VerifyOutcome.Failure(envelope.error?.message ?: "Purchase could not be verified. Please contact support if you were charged.")
                }
            } catch (e: Exception) {
                VerifyOutcome.Failure("Couldn't reach the server to confirm your purchase. It will be retried automatically.")
            }

            when (result) {
                is VerifyOutcome.Success -> {
                    // Server confirmed the credit (or that it was already applied
                    // for this token) — now, and only now, fulfil the purchase with
                    // Play. Diamonds are consumable -> consumeAsync, not acknowledge.
                    val client = billingClient
                    var consumeOk = true
                    if (client != null) {
                        val consumeResult = client.consumePurchase(
                            ConsumeParams.newBuilder().setPurchaseToken(purchaseToken).build()
                        )
                        consumeOk = consumeResult.billingResult.responseCode == BillingClient.BillingResponseCode.OK
                    }
                    // Reflect the server-confirmed balance everywhere (Home currency
                    // header, Wallet tile, etc.) via the same balance refresh path
                    // the rest of the economy surface uses after a purchase/claim.
                    if (isCurrentPurchaseSession(sessionKey)) {
                        AuthRepository.refreshMe(sessionKey)
                    }
                    publishPurchaseState(sessionKey, PurchaseUiState.Success(
                        diamonds = result.data.diamonds,
                        consumed = consumeOk
                    ))
                }
                is VerifyOutcome.Failure -> {
                    publishPurchaseState(sessionKey, PurchaseUiState.Error(result.message))
                }
            }
        }
    }

    private fun publishPurchaseState(state: PurchaseUiState) {
        publishPurchaseState(AuthRepository.currentSessionKey(), state)
    }

    private fun publishPurchaseState(sessionKey: AuthSessionKey, state: PurchaseUiState) {
        _purchaseState.value = SessionPurchaseUiState(sessionKey = sessionKey, state = state)
    }

    private fun isCurrentPurchaseSession(sessionKey: AuthSessionKey): Boolean =
        isCurrentAuthSession(AuthRepository.state.value, sessionKey)

    private sealed class VerifyOutcome {
        data class Success(val data: PlayVerifyResponse) : VerifyOutcome()
        data class Failure(val message: String) : VerifyOutcome()
    }
}

private data class SessionPurchaseUiState(
    val sessionKey: AuthSessionKey?,
    val state: PurchaseUiState,
)

/**
 * Makes stale purchase feedback disappear instead of letting one player see a
 * verification or result belonging to another account on the same device.
 */
internal fun purchaseUiStateForSession(
    requestSession: AuthSessionKey?,
    currentSession: AuthSessionKey,
    desiredState: PurchaseUiState,
): PurchaseUiState =
    if (requestSession == null || requestSession == currentSession) desiredState else PurchaseUiState.Idle

/**
 * Resolves which account may verify a Play callback. A live purchase keeps the
 * exact session that launched the Play sheet; a recovered purchase may use the
 * current session only when Google's echoed account binding matches it.
 */
internal fun purchaseSessionForCallback(
    initiatingSession: AuthSessionKey?,
    currentSession: AuthSessionKey,
    purchaseAccountId: String?,
): AuthSessionKey? {
    val requestSession = initiatingSession ?: currentSession
    if (requestSession != currentSession) return null
    val expectedAccountId = playAccountToken(requestSession.userId) ?: return null
    return requestSession.takeIf { purchaseAccountId == expectedAccountId }
}

/**
 * The account token bound to a Google Play purchase — SHA-256 of the user id,
 * hex, or null when signed out.
 *
 * MUST stay byte-for-byte identical to the server's `playAccountToken`
 * (apps/server/src/modules/payments.ts) or every purchase is rejected as "not
 * yours" — the server compares the value Google echoes back against its own
 * derivation.
 *
 * Hashed rather than sending the raw id: Google's guidance is that
 * obfuscatedAccountId must not contain anything identifying a user, and it is
 * capped at 64 characters — sha256 hex is exactly 64 and one-way. Deterministic,
 * so both sides derive it independently with no extra round trip and nothing to
 * store.
 *
 * Top-level + internal so it is unit-testable against a known vector.
 */
internal fun playAccountToken(userId: String?): String? {
    if (userId.isNullOrBlank()) return null
    return java.security.MessageDigest.getInstance("SHA-256")
        .digest(userId.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it) }
}

/** UI-facing purchase state — the WalletScreen buy-diamonds section observes this. */
sealed class PurchaseUiState {
    data object Idle : PurchaseUiState()
    data object Purchasing : PurchaseUiState()
    /** Purchase completed on Play's side; server verification in flight. */
    data object Verifying : PurchaseUiState()
    data class Success(val diamonds: Int, val consumed: Boolean) : PurchaseUiState()
    data class Error(val message: String) : PurchaseUiState()
}
