package com.filipinodama.app.ui.screens.settings

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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.filipinodama.app.data.settings.SettingsRepository
import com.filipinodama.app.data.settings.SettingsResult
import com.filipinodama.app.data.settings.TicketDetailResponse
import com.filipinodama.app.data.settings.TicketSummary
import com.filipinodama.app.ui.components.MockupBackButton
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Green
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel
import kotlinx.coroutines.launch

/**
 * My Tickets — parity with apps/web's support-ticket thread view. Lists the
 * signed-in player's own tickets (GET /api/support/tickets) with status +
 * message count + last-updated, and opens a read-only thread (GET
 * /api/support/tickets/:id) showing staff replies. Filing stays in
 * [ContactSupportDialog]; this is the "can I see the reply / status" half the
 * app previously lacked (SettingsApi.myTickets had zero call sites).
 *
 * Read-only by design: the server exposes no player-side reply endpoint
 * (staff actions are admin-only), so there is no compose box — matching the
 * server contract, not faking a capability.
 */
@Composable
fun MyTicketsScreen(onBack: () -> Unit = {}) {
    val scope = rememberCoroutineScope()
    var tickets by remember { mutableStateOf<List<TicketSummary>?>(null) }
    var loadError by remember { mutableStateOf<String?>(null) }
    // Selected ticket id → its detail is fetched into `detail`. Null = list view.
    var openId by remember { mutableStateOf<String?>(null) }

    suspend fun load() {
        loadError = null
        when (val r = SettingsRepository.myTickets()) {
            is SettingsResult.Success -> tickets = r.data.items
            is SettingsResult.Failure -> loadError = r.message
        }
    }

    LaunchedEffect(Unit) { load() }

    if (openId != null) {
        // System/gesture back should return to the ticket LIST (matching the
        // in-app back button), not pop the whole destination out to Settings.
        androidx.activity.compose.BackHandler { openId = null }
        TicketThreadView(ticketId = openId!!, onBack = { openId = null })
        return
    }

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(20.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            MockupBackButton(onClick = onBack)
            Column(modifier = Modifier.padding(start = 12.dp)) {
                Text("✦ SUPPORT ✦", color = Gold, style = MaterialTheme.typography.labelMedium)
                Text("My Tickets", color = GoldLt, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 2.dp))
            }
        }

        Box(Modifier.padding(top = 20.dp)) {
            when {
                tickets == null && loadError == null ->
                    Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Gold) }
                loadError != null -> Column(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text(loadError ?: "Couldn't load your tickets.", color = Ink2, style = MaterialTheme.typography.bodyMedium)
                    Box(
                        modifier = Modifier
                            .clickable { scope.launch { tickets = null; load() } }
                            .background(Gold.copy(alpha = 0.16f), RoundedCornerShape(10.dp))
                            .padding(horizontal = 20.dp, vertical = 10.dp)
                    ) { Text("Retry", color = GoldLt, style = MaterialTheme.typography.labelLarge) }
                }
                tickets!!.isEmpty() -> Text(
                    "You haven't filed any support tickets yet.",
                    color = Ink2,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp)
                )
                else -> Column(
                    modifier = Modifier.verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    tickets!!.forEach { t -> TicketRow(t) { openId = t.id } }
                }
            }
        }
    }
}

@Composable
private fun TicketRow(t: TicketSummary, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .background(Panel, RoundedCornerShape(14.dp))
            .padding(14.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(t.subject, color = GoldLt, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f), maxLines = 1)
            StatusPill(t.status)
        }
        Row(
            modifier = Modifier.padding(top = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(t.category, color = Ink2, style = MaterialTheme.typography.labelMedium)
            Text("· ${t.msgCount} message${if (t.msgCount == 1) "" else "s"}", color = Ink2, style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
private fun StatusPill(status: String) {
    // OPEN / PENDING (awaiting) vs RESOLVED / CLOSED — green when resolved.
    val resolved = status.equals("RESOLVED", true) || status.equals("CLOSED", true)
    val color = if (resolved) Green else Gold
    Box(
        modifier = Modifier
            .background(color.copy(alpha = 0.16f), RoundedCornerShape(100.dp))
            .padding(horizontal = 10.dp, vertical = 3.dp)
    ) {
        Text(status.lowercase().replaceFirstChar { it.uppercase() }, color = if (resolved) Color(0xFF7EE6A4) else GoldLt, style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun TicketThreadView(ticketId: String, onBack: () -> Unit) {
    var detail by remember(ticketId) { mutableStateOf<TicketDetailResponse?>(null) }
    var error by remember(ticketId) { mutableStateOf<String?>(null) }

    LaunchedEffect(ticketId) {
        error = null
        when (val r = SettingsRepository.ticketDetail(ticketId)) {
            is SettingsResult.Success -> detail = r.data
            is SettingsResult.Failure -> error = r.message
        }
    }

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(20.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            MockupBackButton(onClick = onBack)
            Text("Ticket", color = GoldLt, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(start = 12.dp))
        }

        when {
            detail == null && error == null ->
                Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Gold) }
            error != null -> Text(error ?: "Couldn't load this ticket.", color = Ink2, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 24.dp))
            else -> {
                val d = detail!!
                Text(d.ticket.subject, color = GoldLt, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 16.dp))
                Row(modifier = Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(d.ticket.category, color = Ink2, style = MaterialTheme.typography.labelMedium)
                    StatusPill(d.ticket.status)
                }
                Column(
                    modifier = Modifier.padding(top = 16.dp).verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    if (d.thread.isEmpty()) {
                        Text("No messages on this ticket yet.", color = Ink2, style = MaterialTheme.typography.bodyMedium)
                    } else {
                        d.thread.forEach { m ->
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(
                                        if (m.isStaff) Gold.copy(alpha = 0.10f) else Panel,
                                        RoundedCornerShape(12.dp)
                                    )
                                    .border(
                                        1.dp,
                                        if (m.isStaff) Gold.copy(alpha = 0.30f) else Color(0x22FFFFFF),
                                        RoundedCornerShape(12.dp)
                                    )
                                    .padding(12.dp)
                            ) {
                                Text(
                                    if (m.isStaff) (m.authorName ?: "Support") + " · Staff" else (m.authorName ?: "You"),
                                    color = if (m.isStaff) GoldLt else Ink2,
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(m.body, color = Ink, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 4.dp))
                            }
                        }
                    }
                }
            }
        }
    }
}
