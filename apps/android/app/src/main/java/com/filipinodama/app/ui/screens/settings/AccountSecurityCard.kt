package com.filipinodama.app.ui.screens.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.AuthResult
import com.filipinodama.app.data.GoogleSignInHelper
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel
import kotlinx.coroutines.launch

/**
 * Account security — change email, connect/disconnect Google.
 *
 * Every value shown comes from the SERVER's `account` block on /api/auth/me
 * (AuthSessionState.account), never from anything derived here. That is what
 * keeps this screen and the web Settings page in agreement wherever the player
 * signs in — most importantly `canUnlink`, which encodes "never remove your only
 * way back in" and must not be re-implemented per client.
 *
 * Guests see nothing: `canChangeEmail` is false for them, and there is no
 * account to secure until they register.
 */
@Composable
fun AccountSecurityCard() {
    val auth by AuthRepository.state.collectAsStateWithLifecycle()
    val account = auth.account
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    var expanded by rememberSaveable { mutableStateOf(false) }
    var newEmail by rememberSaveable { mutableStateOf("") }
    // Deliberately a plain remember, NOT rememberSaveable: rememberSaveable is
    // persisted through savedInstanceState, which would put a plaintext password
    // on disk. Losing it on rotation is the correct trade.
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    if (account == null || !account.canChangeEmail) return

    val googleLinked = account.linkedProviders.contains("google")

    Column(
        modifier = Modifier.fillMaxWidth().background(Panel, RoundedCornerShape(14.dp)).padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Text("Account security", color = Gold, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)

        // ── Email ───────────────────────────────────────────────────────────
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text("Email", color = Ink, style = MaterialTheme.typography.bodyMedium)
                Text(
                    account.email ?: "No email on this account",
                    color = Ink2,
                    style = MaterialTheme.typography.labelSmall
                )
            }
            TextButton(onClick = { expanded = !expanded }, enabled = !busy) {
                Text(if (expanded) "Cancel" else "Change", color = GoldLt)
            }
        }

        account.pendingEmail?.let { pending ->
            Text(
                "Awaiting confirmation at $pending. Your current email stays active until you tap the link we sent.",
                color = Gold,
                style = MaterialTheme.typography.labelSmall
            )
        }

        if (expanded) {
            OutlinedTextField(
                value = newEmail,
                onValueChange = { newEmail = it },
                label = { Text("New email") },
                singleLine = true,
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Email),
                colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Gold, cursorColor = Gold),
                modifier = Modifier.fillMaxWidth()
            )
            // Only asked for when the account actually HAS a password. An
            // OAuth-only player has none, and the confirmation link to the new
            // address is their proof of ownership instead.
            if (account.hasPassword) {
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("Current password") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Password),
                    colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Gold, cursorColor = Gold),
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp)
                )
            }
            Button(
                onClick = {
                    busy = true; error = null; message = null
                    scope.launch {
                        when (val r = AuthRepository.requestEmailChange(
                            newEmail.trim(),
                            if (account.hasPassword) password else null
                        )) {
                            is AuthResult.Success -> {
                                message = "Check ${newEmail.trim()} for a confirmation link."
                                newEmail = ""; password = ""; expanded = false
                            }
                            is AuthResult.Failure -> error = r.message
                        }
                        busy = false
                    }
                },
                enabled = !busy && newEmail.isNotBlank(),
                colors = ButtonDefaults.buttonColors(containerColor = Gold),
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp)
            ) { Text(if (busy) "Sending…" else "Send confirmation link", color = Panel) }
        }

        // ── Google ──────────────────────────────────────────────────────────
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text("Google", color = Ink, style = MaterialTheme.typography.bodyMedium)
                Text(
                    if (googleLinked) "Connected — you can sign in with Google" else "Not connected",
                    color = Ink2,
                    style = MaterialTheme.typography.labelSmall
                )
            }
            TextButton(
                onClick = {
                    busy = true; error = null; message = null
                    scope.launch {
                        if (googleLinked) {
                            when (val r = AuthRepository.unlinkGoogle()) {
                                is AuthResult.Success -> message = "Google disconnected."
                                is AuthResult.Failure -> error = r.message
                            }
                        } else {
                            // Same Credential Manager token as native sign-in —
                            // only the endpoint differs (link, not find-or-create).
                            when (val cred = GoogleSignInHelper.requestIdToken(context, null)) {
                                is GoogleSignInHelper.Result.Success ->
                                    when (val r = AuthRepository.linkGoogle(cred.idToken)) {
                                        is AuthResult.Success -> message = "Google connected."
                                        is AuthResult.Failure -> error = r.message
                                    }
                                is GoogleSignInHelper.Result.Cancelled -> { /* user backed out */ }
                                is GoogleSignInHelper.Result.Failure -> error = cred.message
                            }
                        }
                        busy = false
                    }
                },
                // The server refuses an unlink that would strand the player; the
                // button is disabled to explain that BEFORE the tap rather than
                // failing afterwards.
                enabled = !busy && (!googleLinked || account.canUnlink)
            ) {
                Text(if (googleLinked) "Disconnect" else "Connect", color = if (googleLinked) Ink2 else GoldLt)
            }
        }

        if (googleLinked && !account.canUnlink) {
            Text(
                "Set a password first — Google is currently your only way to sign in.",
                color = Ink2,
                style = MaterialTheme.typography.labelSmall
            )
        }

        message?.let { Text(it, color = GoldLt, style = MaterialTheme.typography.labelSmall) }
        error?.let { Text(it, color = androidx.compose.ui.graphics.Color(0xFFFF8398), style = MaterialTheme.typography.labelSmall) }
    }
}
