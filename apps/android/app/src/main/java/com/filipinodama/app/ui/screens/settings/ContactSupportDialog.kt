package com.filipinodama.app.ui.screens.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.filipinodama.app.data.settings.SettingsRepository
import com.filipinodama.app.data.settings.SettingsResult
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel
import com.filipinodama.app.ui.theme.Red
import kotlinx.coroutines.launch

/**
 * Contact Support dialog — the authenticated-filer branch of
 * apps/web ContactPage.tsx, ported: category chip-select, Subject, Message
 * (min 10 chars, matches server `bodySchema`), POST /api/support/tickets via
 * [SettingsRepository.createTicket]. No mailto/guest fallback here — Settings
 * is only reachable when signed in and this row is hidden for guests
 * (SettingsScreen already gates it), matching the server's own
 * GUEST_CANNOT_FILE rejection.
 */
private val CATEGORIES = listOf("General", "Account", "Bug Report", "Billing")
private const val MIN_MESSAGE_LENGTH = 10

@Composable
fun ContactSupportDialog(onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    var category by remember { mutableStateOf(CATEGORIES[0]) }
    var subject by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var sentTicketId by remember { mutableStateOf<String?>(null) }

    Dialog(onDismissRequest = { if (!sending) onClose() }) {
        Column(
            // Scroll so the form's CTA stays reachable with the keyboard open or a
            // large accessibility font (versionCode-12 unreachable-CTA bug class).
            modifier = Modifier.fillMaxWidth().background(Panel, RoundedCornerShape(18.dp)).verticalScroll(rememberScrollState()).padding(22.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            if (sentTicketId != null) {
                Text("✓ Ticket Submitted", color = GoldLt, style = MaterialTheme.typography.titleMedium)
                Text(
                    "We'll get back to you in your notifications. Reference: $sentTicketId",
                    color = Ink,
                    style = MaterialTheme.typography.bodyMedium
                )
                TextButton(onClick = onClose) { Text("Done", color = Gold) }
                return@Column
            }

            Text("Contact Support", color = GoldLt, style = MaterialTheme.typography.titleMedium)
            Text("We usually reply within 24-48 hours", color = Ink2, style = MaterialTheme.typography.labelSmall)

            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                CATEGORIES.forEach { c ->
                    val active = category == c
                    Text(
                        c,
                        color = if (active) Gold else Ink2,
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier
                            .clickable { category = c }
                            .background(if (active) Gold.copy(alpha = 0.15f) else androidx.compose.ui.graphics.Color.Transparent, RoundedCornerShape(999.dp))
                            .padding(horizontal = 10.dp, vertical = 6.dp)
                    )
                }
            }

            OutlinedTextField(
                value = subject,
                onValueChange = { subject = it },
                label = { Text("Subject", color = Ink2) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                colors = fieldColors()
            )
            OutlinedTextField(
                value = message,
                onValueChange = {
                    message = it
                    if (error != null && it.trim().length >= MIN_MESSAGE_LENGTH) error = null
                },
                label = { Text("Message", color = Ink2) },
                modifier = Modifier.fillMaxWidth().height(120.dp),
                colors = fieldColors()
            )
            if (error != null) {
                Text(error!!, color = Red, style = MaterialTheme.typography.labelSmall)
            }

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                TextButton(onClick = { if (!sending) onClose() }) { Text("Cancel", color = Ink) }
                TextButton(onClick = {
                    if (subject.trim().isEmpty()) {
                        error = "Please fill in a subject."
                        return@TextButton
                    }
                    val trimmed = message.trim()
                    if (trimmed.length < MIN_MESSAGE_LENGTH) {
                        error = "Please write at least $MIN_MESSAGE_LENGTH characters."
                        return@TextButton
                    }
                    sending = true
                    scope.launch {
                        when (val result = SettingsRepository.createTicket(category, subject.trim(), trimmed)) {
                            is SettingsResult.Success -> sentTicketId = result.data.id
                            is SettingsResult.Failure -> error = result.message
                        }
                        sending = false
                    }
                }) {
                    Text(if (sending) "Sending…" else "Submit Request", color = Gold)
                }
            }
        }
    }
}

@Composable
private fun fieldColors() = OutlinedTextFieldDefaults.colors(
    focusedTextColor = Ink,
    unfocusedTextColor = Ink,
    focusedBorderColor = Gold,
    unfocusedBorderColor = Ink2
)
