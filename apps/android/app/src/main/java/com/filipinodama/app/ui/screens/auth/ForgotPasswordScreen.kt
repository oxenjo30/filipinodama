package com.filipinodama.app.ui.screens.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Icon
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.AuthResult
import com.filipinodama.app.ui.theme.Bg
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import kotlinx.coroutines.launch

/**
 * Forgot Password screen — email input -> POST /api/auth/password/forgot ->
 * honest "check your email" success state, matching AuthPage.tsx's
 * forgot-password panel exactly (the server always returns `{ sent: true }`
 * regardless of whether the address exists, so the success copy is shown
 * unconditionally on a non-error response — never reveals email enumeration).
 */
@Composable
fun ForgotPasswordScreen(onBack: () -> Unit) {
    var email by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var done by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun submit() {
        val cleanEmail = email.trim().lowercase()
        if (cleanEmail.isEmpty() || !cleanEmail.matches(Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"))) {
            error = "Please enter a valid email address."
            return
        }
        error = null
        busy = true
        scope.launch {
            when (val result = AuthRepository.forgotPassword(cleanEmail)) {
                is AuthResult.Success -> done = true
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
            .padding(horizontal = 28.dp, vertical = 16.dp)
    ) {
        AuthBackButton(onClick = onBack)

        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 24.dp)
        ) {
            if (done) {
                Box(
                    modifier = Modifier
                        .size(60.dp)
                        .background(Color(0xFF3FBF6F).copy(alpha = 0.16f), CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(imageVector = Icons.Filled.Check, contentDescription = null, tint = Color(0xFF7EE6A4))
                }
                Text(
                    text = "Check your email",
                    style = MaterialTheme.typography.headlineMedium,
                    color = GoldLt,
                    modifier = Modifier.padding(top = 16.dp)
                )
                Text(
                    text = "We've sent a reset link to ",
                    color = Ink,
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 12.dp)
                )
                Text(
                    text = email.trim(),
                    color = GoldLt,
                    fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Center
                )
                Text(
                    text = "It may take a minute to arrive.",
                    color = Ink,
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 4.dp, bottom = 24.dp)
                )
                AuthPrimaryButton(text = "Back to sign in", onClick = onBack)
                AuthTextLink(
                    text = "Didn't get it? Resend",
                    onClick = { submit() },
                    enabled = !busy,
                    modifier = Modifier.padding(top = 8.dp)
                )
            } else {
                Text(
                    text = "🔑",
                    style = MaterialTheme.typography.headlineLarge,
                    modifier = Modifier
                        .background(Gold.copy(alpha = 0.12f), androidx.compose.foundation.shape.RoundedCornerShape(16.dp))
                        .padding(14.dp)
                )
                Text(
                    text = "Reset your password",
                    style = MaterialTheme.typography.headlineMedium,
                    color = GoldLt,
                    modifier = Modifier.padding(top = 16.dp)
                )
                Text(
                    text = "Enter your email and we'll send you a link to set a new password.",
                    color = Ink2,
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 8.dp, bottom = 24.dp)
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

                    error?.let { AuthErrorRow(it) }

                    AuthPrimaryButton(
                        text = if (busy) "Sending…" else "Send reset link",
                        onClick = { submit() },
                        enabled = !busy,
                        loading = busy
                    )
                }
            }
        }
    }
}
