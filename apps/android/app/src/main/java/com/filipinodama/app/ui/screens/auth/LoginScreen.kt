package com.filipinodama.app.ui.screens.auth

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.filipinodama.app.R
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.AuthResult
import com.filipinodama.app.ui.theme.Bg
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink2
import kotlinx.coroutines.launch

/**
 * Login screen — mobile-screen-inventory.md §2 Screen 4 (Sign in / Auth,
 * `signin` mode): email + password fields, inline error row, primary CTA,
 * "Continue as guest", legal footnote. Validation rules and error-copy
 * conventions mirror apps/web/src/features/auth/AuthPage.tsx `submit()` /
 * `playAsGuest()` exactly (client-side friendly validation before firing a
 * request; on failure surface the server's own message, never invented copy).
 */
@Composable
fun LoginScreen(
    onLoginSuccess: () -> Unit,
    onGuestSuccess: () -> Unit,
    onCreateAccount: () -> Unit,
    onForgotPassword: () -> Unit
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun submit() {
        val cleanEmail = email.trim().lowercase()
        val cleanPass = password.trim()
        if (cleanEmail.isEmpty() || !cleanEmail.matches(Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"))) {
            error = "Please enter a valid email address."
            return
        }
        if (cleanPass.isEmpty()) {
            error = "Please enter your password."
            return
        }
        error = null
        busy = true
        scope.launch {
            when (val result = AuthRepository.login(cleanEmail, cleanPass)) {
                is AuthResult.Success -> onLoginSuccess()
                is AuthResult.Failure -> error = result.message
            }
            busy = false
        }
    }

    fun playAsGuest() {
        error = null
        busy = true
        scope.launch {
            when (val result = AuthRepository.guest()) {
                is AuthResult.Success -> onGuestSuccess()
                is AuthResult.Failure -> error = result.message
            }
            busy = false
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Bg)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 28.dp, vertical = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Image(
            painter = painterResource(id = R.drawable.logo_sun),
            contentDescription = null,
            contentScale = ContentScale.Fit,
            modifier = Modifier
                .size(56.dp)
                .background(Gold.copy(alpha = 0.12f), CircleShape)
                .padding(8.dp)
        )
        Text(
            text = "✦ FILIPINODAMA ROYAL ✦",
            color = Gold,
            style = MaterialTheme.typography.labelLarge,
            modifier = Modifier.padding(top = 16.dp)
        )
        Text(
            text = "Welcome back",
            style = MaterialTheme.typography.headlineMedium,
            color = GoldLt,
            modifier = Modifier.padding(top = 8.dp)
        )
        Text(
            text = "Sign in to return to the board.",
            color = Ink2,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(top = 4.dp, bottom = 28.dp)
        )

        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Column {
                AuthLabel("EMAIL")
                AuthTextField(
                    value = email,
                    onValueChange = { email = it },
                    placeholder = "you@example.com",
                    keyboardType = KeyboardType.Email,
                    enabled = !busy
                )
            }
            Column {
                AuthLabel("PASSWORD")
                AuthTextField(
                    value = password,
                    onValueChange = { password = it },
                    placeholder = "••••••••",
                    isPassword = true,
                    enabled = !busy
                )
            }

            error?.let { AuthErrorRow(it) }

            AuthPrimaryButton(
                text = if (busy) "Please wait…" else "Sign In",
                onClick = { submit() },
                enabled = !busy,
                loading = busy,
                modifier = Modifier.padding(top = 4.dp)
            )

            AuthTextLink(
                text = "Forgot your password?",
                onClick = onForgotPassword,
                enabled = !busy,
                modifier = Modifier.align(Alignment.CenterHorizontally)
            )
        }

        OrDivider()

        AuthSecondaryButton(
            text = "Continue as Guest",
            onClick = { playAsGuest() },
            enabled = !busy
        )

        Text(
            text = "Don't have an account?",
            color = Ink2,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.padding(top = 20.dp)
        )
        AuthTextLink(
            text = "Create Account",
            onClick = onCreateAccount,
            enabled = !busy
        )

        Text(
            text = "By continuing you agree to our Terms & Privacy Policy.",
            color = Ink2,
            style = MaterialTheme.typography.bodySmall,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 24.dp)
        )
    }
}

/** Thin "or" divider row between the primary form and the guest CTA. */
@Composable
private fun OrDivider() {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 20.dp)
    ) {
        Box(
            modifier = Modifier
                .weight(1f)
                .height(1.dp)
                .background(Gold.copy(alpha = 0.16f))
        )
        Text(text = "or", color = Ink2, style = MaterialTheme.typography.labelMedium)
        Box(
            modifier = Modifier
                .weight(1f)
                .height(1.dp)
                .background(Gold.copy(alpha = 0.16f))
        )
    }
}
