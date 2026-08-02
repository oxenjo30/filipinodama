package com.filipinodama.app.ui.screens.social

import com.filipinodama.app.ui.components.royalDialogPanel
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.filipinodama.app.data.social.REPORT_REASONS
import com.filipinodama.app.data.social.ReportRepository
import com.filipinodama.app.data.social.SocialResult
import com.filipinodama.app.ui.screens.game.GameButton
import com.filipinodama.app.ui.screens.game.GameButtonVariant
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel
import kotlinx.coroutines.launch

/**
 * ReportPlayerDialog — shared report flow, a Compose port of apps/web
 * ReportPlayerModal.tsx. Three entry points wire this in (mirrors web exactly):
 *   - DmThreadScreen:      context="dm"      — per-message report, quoting the
 *                          reported player's own message (messageId required).
 *   - PublicProfileScreen: context="profile" — the server requires a non-empty
 *                          note for profile reports.
 *   - GuildHallScreen:     context="guild"   — per-message report from the
 *                          Guild Chat tab, quoting the reported player's own
 *                          guild-chat message (messageId required, same as dm).
 */
@Composable
fun ReportPlayerDialog(
    accusedId: String,
    context: String, // "dm" | "profile" | "guild"
    messageId: String? = null,
    quotedText: String? = null,
    onClose: () -> Unit,
    onSubmitted: (String) -> Unit = {}
) {
    val scope = rememberCoroutineScope()
    // Default to the mockup's first/default reason (Cheating / bot).
    // Saveable: a configuration change (rotation, fold, split screen, font-size
    // change) destroys the Activity, and a plain `remember` would silently wipe
    // the reason + the up-to-500-char description the reporter just wrote.
    // `busy` stays a plain remember — restoring "busy = true" would leave the
    // dialog wedged on "Submitting…" with no in-flight request to finish it.
    var reason by rememberSaveable { mutableStateOf(REPORT_REASONS.first().first) }
    var note by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var toast by remember { mutableStateOf<String?>(null) }

    val noteRequired = context == "profile"
    val noteMissing = noteRequired && note.trim().isEmpty()

    fun submit() {
        if (noteMissing) {
            toast = "Please describe the problem."
            return
        }
        busy = true
        scope.launch {
            when (val result = ReportRepository.submit(
                accusedId = accusedId,
                reason = reason,
                note = note.trim().ifEmpty { null },
                context = context,
                messageId = messageId
            )) {
                is SocialResult.Success -> {
                    busy = false
                    onSubmitted("Report submitted — thanks for helping keep the game fair.")
                    onClose()
                }
                is SocialResult.Failure -> {
                    busy = false
                    toast = result.message
                }
            }
        }
    }

    Dialog(onDismissRequest = { if (!busy) onClose() }) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .royalDialogPanel()
                .padding(24.dp)
                .verticalScroll(rememberScrollState())
        ) {
            Text("REPORT", color = Gold, style = MaterialTheme.typography.labelMedium)
            Text("Report player", color = GoldLt, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 4.dp))
            Text(
                "Tell us what happened. Our moderators review every report.",
                color = Ink,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 6.dp, bottom = 16.dp)
            )

            if (quotedText != null) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.Black.copy(alpha = 0.3f), RoundedCornerShape(8.dp))
                        .padding(12.dp)
                ) {
                    Text("“$quotedText”", color = Ink, style = MaterialTheme.typography.bodySmall)
                }
                Box(modifier = Modifier.height(16.dp))
            }

            Text("REASON", color = Ink2, style = MaterialTheme.typography.labelSmall)
            Column(modifier = Modifier.padding(top = 8.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                REPORT_REASONS.forEach { (value, label) ->
                    val selected = reason == value
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { reason = value }
                            .background(if (selected) Gold.copy(alpha = 0.14f) else Color.Black.copy(alpha = 0.2f), RoundedCornerShape(9.dp))
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(label, color = if (selected) GoldLt else Ink, style = MaterialTheme.typography.bodyMedium)
                        if (selected) Text("✓", color = Gold, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }

            Text(
                if (noteRequired) "WHAT'S WRONG? (REQUIRED)" else "ADD CONTEXT (OPTIONAL)",
                color = Ink2,
                style = MaterialTheme.typography.labelSmall
            )
            OutlinedTextField(
                value = note,
                onValueChange = { if (it.length <= 500) note = it },
                placeholder = { Text(if (noteRequired) "Describe what happened…" else "Anything else we should know…", color = Ink2.copy(alpha = 0.6f)) },
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                minLines = 3,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = Color.White,
                    unfocusedTextColor = Color.White,
                    focusedBorderColor = Gold,
                    unfocusedBorderColor = Gold.copy(alpha = 0.3f),
                    focusedContainerColor = Color.Black.copy(alpha = 0.3f),
                    unfocusedContainerColor = Color.Black.copy(alpha = 0.3f),
                    cursorColor = Gold
                )
            )
            Text(
                "${note.length}/500",
                color = Ink2,
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.fillMaxWidth().padding(top = 4.dp, bottom = 4.dp),
                textAlign = androidx.compose.ui.text.style.TextAlign.End
            )

            if (toast != null) {
                Text(toast!!, color = Color(0xFFFF8FAE), style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 8.dp))
            }

            Row(modifier = Modifier.fillMaxWidth().padding(top = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                GameButton("Cancel", { if (!busy) onClose() }, variant = GameButtonVariant.PURPLE, modifier = Modifier.weight(1f))
                GameButton(if (busy) "Submitting…" else "Submit report", { if (!busy) submit() }, variant = GameButtonVariant.RED, enabled = !busy, modifier = Modifier.weight(1f))
            }
        }
    }
}
