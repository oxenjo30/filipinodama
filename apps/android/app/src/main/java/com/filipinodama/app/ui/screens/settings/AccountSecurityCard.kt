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
import androidx.compose.runtime.LaunchedEffect
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
 * Shown to everyone with an account block, but the ACTIONS are gated by the
 * server: canChangeEmail is false for guests and for accounts with no password,
 * and canUnlink is false when a provider is the only way left to sign in.
 */
@Composable
fun AccountSecurityCard() {
    val auth by AuthRepository.state.collectAsStateWithLifecycle()
    val account = auth.account
    // The Google client id comes from the SERVER (GET /api/auth/providers), the
    // same way LoginScreen gets it. Passing null here made Connect fail on every
    // normal build with "Google sign-in is not configured yet", because the
    // BuildConfig fallback is only ever set as a local-dev gradle property.
    val providers by AuthRepository.providers.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { AuthRepository.refreshProviders() }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    var expanded by rememberSaveable { mutableStateOf(false) }
    var newEmail by rememberSaveable { mutableStateOf("") }
    // Deliberately a plain remember, NOT rememberSaveable: rememberSaveable is
    // persisted through savedInstanceState, which would put a plaintext password
    // on disk. Losing it on rotation is the correct trade.
    var password by remember { mutableStateOf("") }
    // Re-auth password for connect/disconnect, which the server now requires.
    // Plain remember, never rememberSaveable — see the note on `password`.
    var linkPassword by remember { mutableStateOf("") }
    var askLinkPassword by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    // Render whenever there IS an account block. The earlier
    // `!canChangeEmail -> return` hid the WHOLE card — email row and Google row
    // together — from guests and from OAuth-only players, who lost the only
    // place either value was shown. Now the card always shows what is true, and
    // only the actions are gated.
    if (account == null) return

    // Every other screen that renders a credential sets FLAG_SECURE; this one
    // renders the current password and did not, so it leaked into screenshots,
    // screen recordings and the Recents thumbnail.
    if (expanded || askLinkPassword) {
        com.filipinodama.app.ui.components.SecureScreen()
    }

    val googleLinked = account.linkedProviders.contains("google")
    // A guest cannot link (the server refuses) and has nothing to unlink, so the
    // button must not be offered at all rather than failing on tap.
    val isGuest = auth.user?.isGuest == true

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
            if (account.canChangeEmail) {
                TextButton(onClick = { expanded = !expanded }, enabled = !busy) {
                    Text(if (expanded) "Cancel" else "Change", color = GoldLt)
                }
            }
        }

        if (!account.canChangeEmail && !auth.user?.isGuest.orFalse()) {
            Text(
                "Set a password on your account before changing your email.",
                color = Ink2,
                style = MaterialTheme.typography.labelSmall
            )
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
            // Always required now: the server refuses an email change on an
            // account with no password, because "the confirmation link proves
            // ownership" is circular when the attacker picks the address.
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
                    // The server requires the current password for both
                    // directions. Ask for it first rather than firing a call
                    // that is going to be refused.
                    if (account.hasPassword && linkPassword.isBlank()) { askLinkPassword = true; return@TextButton }
                    busy = true; error = null; message = null
                    scope.launch {
                        if (googleLinked) {
                            when (val r = AuthRepository.unlinkGoogle(linkPassword.ifBlank { null })) {
                                is AuthResult.Success -> { message = "Google disconnected."; linkPassword = ""; askLinkPassword = false }
                                is AuthResult.Failure -> error = r.message
                            }
                        } else {
                            // Same Credential Manager token as native sign-in —
                            // only the endpoint differs (link, not find-or-create).
                            when (val cred = GoogleSignInHelper.requestIdToken(context, providers.googleClientId)) {
                                is GoogleSignInHelper.Result.Success ->
                                    when (val r = AuthRepository.linkGoogle(cred.idToken, linkPassword.ifBlank { null })) {
                                        is AuthResult.Success -> { message = "Google connected."; linkPassword = ""; askLinkPassword = false }
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
                enabled = !busy && providers.google && (if (googleLinked) account.canUnlink else account.canLink)
            ) {
                Text(if (googleLinked) "Disconnect" else "Connect", color = if (googleLinked) Ink2 else GoldLt)
            }
        }

        if (askLinkPassword && account.hasPassword) {
            OutlinedTextField(
                value = linkPassword,
                onValueChange = { linkPassword = it },
                label = { Text("Current password") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Password),
                colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Gold, cursorColor = Gold),
                modifier = Modifier.fillMaxWidth().padding(top = 6.dp)
            )
            Text(
                "Confirm your password, then tap ${if (googleLinked) "Disconnect" else "Connect"} again.",
                color = Ink2,
                style = MaterialTheme.typography.labelSmall
            )
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

private fun Boolean?.orFalse(): Boolean = this ?: false
