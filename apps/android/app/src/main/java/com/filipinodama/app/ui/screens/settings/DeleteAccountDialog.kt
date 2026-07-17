package com.filipinodama.app.ui.screens.settings

import com.filipinodama.app.ui.components.royalDialogPanel
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.filipinodama.app.data.settings.SettingsRepository
import com.filipinodama.app.data.settings.SettingsResult
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel
import com.filipinodama.app.ui.theme.Red
import kotlinx.coroutines.launch

/**
 * Delete Account confirmation dialog — exact port of apps/web
 * SettingsPage.tsx's delete modal: typed "DELETE" confirmation gate, the
 * same warning copy (data erased permanently; App Store/Play purchases are
 * handled by the platform; deletion completes within 30 days per Privacy
 * Policy), and the same request: `DELETE /api/users/me { confirm: "DELETE" }`
 * via [SettingsRepository.deleteAccount] (which also clears local session
 * state on success, mirroring SettingsPage.tsx's `logout()` + redirect).
 *
 * The gating/transition logic itself lives in [DeleteAccountFlow] (a pure
 * state machine, same convention as StoreScreen's BuyFlow) so it is
 * independently unit-tested; this composable is just the state holder +
 * network call + rendering.
 */
@Composable
fun DeleteAccountDialog(onClose: () -> Unit, onDeleted: () -> Unit) {
    val scope = rememberCoroutineScope()
    var confirmText by remember { mutableStateOf("") }
    var state by remember { mutableStateOf<DeleteAccountState>(DeleteAccountState.Idle) }
    val deleting = state is DeleteAccountState.Deleting
    val ready = DeleteAccountFlow.isReady(confirmText)

    Dialog(onDismissRequest = { if (!deleting) onClose() }) {
        Column(
            // Scroll so the typed-DELETE confirm + buttons stay reachable with the
            // keyboard open / large font (versionCode-12 unreachable-CTA bug class).
            modifier = Modifier.fillMaxWidth().royalDialogPanel().verticalScroll(rememberScrollState()).padding(22.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Text("⚠️ Delete Your Account?", color = Red, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(
                "This permanently erases your profile, stats, match history, trophies, friends, and guild membership. This cannot be undone.",
                color = Ink,
                style = MaterialTheme.typography.bodySmall
            )
            Text(
                "Any active purchases are handled by the App Store or Google Play. Deletion completes within 30 days per our Privacy Policy.",
                color = Ink2,
                style = MaterialTheme.typography.labelSmall
            )
            Text("Type DELETE to confirm", color = Ink2, style = MaterialTheme.typography.labelSmall)
            OutlinedTextField(
                value = confirmText,
                onValueChange = { confirmText = it },
                singleLine = true,
                enabled = !deleting,
                placeholder = { Text("DELETE", color = Ink2) },
                modifier = Modifier.fillMaxWidth(),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = Ink,
                    unfocusedTextColor = Ink,
                    focusedBorderColor = Red,
                    unfocusedBorderColor = Red.copy(alpha = 0.4f)
                )
            )
            val errorState = state
            if (errorState is DeleteAccountState.Error) {
                Text(errorState.message, color = Red, style = MaterialTheme.typography.labelSmall)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                TextButton(onClick = { if (!deleting) onClose() }) { Text("Cancel", color = Ink) }
                TextButton(
                    enabled = ready && !deleting,
                    onClick = {
                        val next = DeleteAccountFlow.startDelete(confirmText, state)
                        if (next !is DeleteAccountState.Deleting) return@TextButton
                        state = next
                        scope.launch {
                            when (val result = SettingsRepository.deleteAccount()) {
                                is SettingsResult.Success -> {
                                    state = DeleteAccountFlow.succeed(state)
                                    onDeleted()
                                }
                                is SettingsResult.Failure -> {
                                    state = DeleteAccountFlow.fail(state, result.message)
                                }
                            }
                        }
                    }
                ) {
                    Text(if (deleting) "Deleting…" else "Delete Forever", color = Red, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}
