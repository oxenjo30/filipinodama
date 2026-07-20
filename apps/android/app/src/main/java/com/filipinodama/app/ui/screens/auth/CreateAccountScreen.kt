package com.filipinodama.app.ui.screens.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.AuthResult
import com.filipinodama.app.data.GoogleSignInHelper
import com.filipinodama.app.ui.components.screenInsets
import com.filipinodama.app.ui.theme.Bg
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink2
import kotlinx.coroutines.launch

/**
 * Create Account screen — mobile-screen-inventory.md §2 Screen 4 (Sign in /
 * Auth, `signup` mode): display-name/email/password fields + explicit Terms
 * & Conditions acceptance. The web client (AuthPage.tsx `requireTerms()`)
 * treats accepting Terms as REQUIRED before an account can be created — this
 * mirrors that exactly rather than making it optional.
 *
 * Username validation mirrors the server's registerSchema
 * (packages/shared/src/dto.ts): 3-16 chars, [a-zA-Z0-9_] only.
 */
@Composable
fun CreateAccountScreen(
    onBack: () -> Unit,
    onAccountCreated: () -> Unit
) {
    var username by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var agreed by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var googleBusy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val providers by AuthRepository.providers.collectAsState()

    // Same provider-availability fetch as LoginScreen (mirrors the web's
    // authStore.refreshProviders()); harmless to call again if the user
    // arrived here via LoginScreen's "Create Account" link — GET
    // /api/auth/providers is idempotent and cheap.
    LaunchedEffect(Unit) { AuthRepository.refreshProviders() }

    /**
     * Accepting Terms is required before ANY account-creating action here,
     * including Google — mirrors AuthPage.tsx's requireTerms() gate, which
     * `startOAuth("google")` calls first, before ever redirecting to Google.
     */
    fun requireTerms(): Boolean {
        if (agreed) return true
        error = "Please accept the Terms & Conditions to continue."
        return false
    }

    fun signInWithGoogle() {
        if (!requireTerms()) return
        error = null
        googleBusy = true
        scope.launch {
            val credentialResult = GoogleSignInHelper.requestIdToken(context, providers.googleClientId)
            when (val outcome = resolveCredentialResult(credentialResult)) {
                is GoogleSignInOutcome.Cancelled -> { /* user backed out — no error, no navigation */ }
                is GoogleSignInOutcome.Error -> error = outcome.message
                is GoogleSignInOutcome.SignedIn -> onAccountCreated()
                null -> {
                    val idToken = (credentialResult as GoogleSignInHelper.Result.Success).idToken
                    when (val serverOutcome = resolveServerAuthResult(AuthRepository.googleSignIn(idToken))) {
                        is GoogleSignInOutcome.SignedIn -> onAccountCreated()
                        is GoogleSignInOutcome.Error -> error = serverOutcome.message
                        is GoogleSignInOutcome.Cancelled -> { /* unreachable from a server result */ }
                    }
                }
            }
            googleBusy = false
        }
    }

    fun submit() {
        val cleanUsername = username.trim()
        val cleanEmail = email.trim().lowercase()
        val cleanPass = password.trim()

        if (!requireTerms()) return
        if (cleanUsername.isEmpty()) {
            error = "Please enter a display name."
            return
        }
        if (!cleanUsername.matches(Regex("^[a-zA-Z0-9_]{3,16}$"))) {
            error = "Display name must be 3-16 characters, letters/numbers/underscore only."
            return
        }
        if (cleanEmail.isEmpty() || !cleanEmail.matches(Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"))) {
            error = "Please enter a valid email address."
            return
        }
        if (cleanPass.length < 8) {
            error = "Password must be at least 8 characters."
            return
        }

        error = null
        busy = true
        scope.launch {
            when (val result = AuthRepository.register(cleanEmail, cleanPass, cleanUsername)) {
                is AuthResult.Success -> {
                    // Offer to SAVE the new credential to the vault before leaving.
                    commitAutofillOnAuthSuccess(context)
                    onAccountCreated()
                }
                is AuthResult.Failure -> error = result.message
            }
            busy = false
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Bg)
            .screenInsets()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 28.dp, vertical = 16.dp)
            .imePadding()
    ) {
        AuthBackButton(onClick = onBack)

        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
            // Wordmark — mockup lines 161-162 (shared by Sign in/Create):
            // "FILIPINO DAMA", no stars/"ROYAL" suffix.
            Text(
                text = "FILIPINO DAMA",
                color = Gold,
                style = MaterialTheme.typography.labelLarge.copy(letterSpacing = 4.sp),
                modifier = Modifier.padding(top = 12.dp)
            )
            Text(
                text = "Create your account",
                style = MaterialTheme.typography.headlineMedium,
                color = GoldLt,
                modifier = Modifier.padding(top = 8.dp)
            )
            Text(
                text = "Join the kingdom and start your climb.",
                color = Ink2,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = 4.dp, bottom = 28.dp)
            )
        }

        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Column {
                AuthLabel("DISPLAY NAME")
                AuthTextField(
                    value = username,
                    onValueChange = { username = it },
                    placeholder = "e.g. Datu Rico",
                    enabled = !busy,
                    autofill = AuthAutofill.USERNAME
                )
            }
            Column {
                AuthLabel("EMAIL")
                AuthTextField(
                    value = email,
                    onValueChange = { email = it },
                    placeholder = "you@example.com",
                    keyboardType = KeyboardType.Email,
                    enabled = !busy,
                    autofill = AuthAutofill.EMAIL
                )
            }
            Column {
                AuthLabel("PASSWORD")
                AuthTextField(
                    value = password,
                    onValueChange = { password = it },
                    placeholder = "••••••••",
                    isPassword = true,
                    enabled = !busy,
                    // NEW_PASSWORD so the manager offers to SAVE a new credential
                    // on signup (vs. filling an existing one on login).
                    autofill = AuthAutofill.NEW_PASSWORD
                )
            }

            error?.let { AuthErrorRow(it) }

            AuthPrimaryButton(
                text = if (busy) "Please wait…" else "Create Account",
                onClick = { submit() },
                enabled = !busy,
                loading = busy,
                modifier = Modifier.padding(top = 4.dp)
            )
        }

        AuthOrDivider()

        AuthGoogleButton(
            enabled = googleButtonEnabled(providers) && !busy,
            loading = googleBusy,
            onClick = { signInWithGoogle() },
            onDisabledClick = { error = "Google sign-in is not configured yet." }
        )

        Column(modifier = Modifier.fillMaxWidth()) {
            // Terms & Conditions acceptance — required for account creation via
            // EITHER path (email form or Google), matching AuthPage.tsx's
            // requireTerms() gate, which startOAuth("google") calls first too.
            Row(
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(9.dp),
                modifier = Modifier.padding(top = 18.dp)
            ) {
                Checkbox(
                    checked = agreed,
                    onCheckedChange = {
                        agreed = it
                        if (it) error = null
                    },
                    enabled = !busy && !googleBusy,
                    colors = CheckboxDefaults.colors(checkedColor = Gold, uncheckedColor = Ink2)
                )
                Text(
                    text = "I agree to the Terms & Conditions and Privacy Policy.",
                    color = Ink2,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 12.dp)
                )
            }
        }
    }
}
