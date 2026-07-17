package com.filipinodama.app.ui.screens.social

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.draw.clip
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.filipinodama.app.data.social.NotificationDto
import com.filipinodama.app.data.social.NotificationsRepository
import com.filipinodama.app.data.social.SocialResult
import com.filipinodama.app.data.social.notifIsFriendType
import com.filipinodama.app.data.social.notifIsPending
import com.filipinodama.app.data.social.notifStatus
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Green
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel
import com.filipinodama.app.ui.components.PullRefreshContainer
import com.filipinodama.app.ui.components.screenContentPadding
import com.filipinodama.app.ui.components.screenInsetsTopOnly
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.temporal.ChronoUnit

/**
 * NotificationsScreen — mobile-screen-inventory.md SCREEN 12, rebuilt 1:1
 * against handoffv3/FilipinoDama Mobile.dc.html lines 1001-1059 (Tier-2
 * UI-fidelity pass). Header: MockupBackButton + centered "Notifications"
 * title + always-visible "Mark all read" text action (#c9a4ff, no
 * enabled-gating in the mockup). Empty state: 74dp icon-wrapper box
 * (gold-tinted bg/border) around a bell glyph, "You're all caught up" title,
 * exact body copy. Group label: uppercase, 11sp, 1.5 letter-spacing,
 * #8b7cae. Row: 44dp icon wrapper, absolute-positioned unread dot (not an
 * inline prefix), swipe-reveal red gradient with a trash glyph (not a text
 * label), single generic CTA button per the mockup's `n.cta` (kept as
 * Accept/Decline since that IS the real friend-request CTA data — the
 * mockup's `n.cta`/`n.onCta` is a single-button field but the friend-request
 * notification is inherently a two-action decision; Decline has no mockup
 * counterpart so it's styled as the row's neutral/secondary action to stay
 * visually subordinate to the single gold CTA).
 */
@Composable
fun NotificationsScreen(onBack: () -> Unit) {
    val state by NotificationsRepository.state.collectAsState()
    val scope = rememberCoroutineScope()
    var swipeState by remember { mutableStateOf(SwipeListState()) }

    LaunchedEffect(Unit) {
        NotificationsRepository.load()
    }

    val data = state.data
    val isEmpty = !state.loading && !state.error && (data?.notifications?.isEmpty() ?: true)

    Column(modifier = Modifier.fillMaxSize().screenInsetsTopOnly().background(MaterialTheme.colorScheme.background)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp, 20.dp, 12.dp, 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            com.filipinodama.app.ui.components.MockupBackButtonStore(onClick = onBack)
            Text("Notifications", color = Color(0xFFF4ECD6), style = MaterialTheme.typography.headlineSmall, modifier = Modifier.weight(1f))
            val unread = data?.unreadCount ?: 0
            Text(
                "Mark all read",
                color = Color(0xFFC9A4FF),
                style = MaterialTheme.typography.labelMedium,
                // Mockup never gates "Mark all read" (SOC-6) — always tappable.
                modifier = Modifier.clickable { scope.launch { NotificationsRepository.markAll() } }.padding(8.dp)
            )
        }

        // Pull down anywhere on the list/empty state to RE-FETCH notifications from
        // the server (NotificationsRepository.load() — the same call the entry
        // LaunchedEffect runs), so a pull gets the latest, not a cosmetic spinner.
        PullRefreshContainer(onRefresh = { NotificationsRepository.load() }) {
        when {
            state.loading && data == null -> Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(32.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally
            ) { CircularProgressIndicator(color = Gold) }
            state.error && data == null -> Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(32.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text("Couldn't load notifications", color = Ink, style = MaterialTheme.typography.titleMedium)
                Text("Try again", color = Gold, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 10.dp).clickable { scope.launch { NotificationsRepository.load() } })
            }
            isEmpty -> Column(
                modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 32.dp, vertical = 80.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Box(
                    modifier = Modifier.size(74.dp)
                        .background(Color(0x14E8B84B), RoundedCornerShape(20.dp))
                        .border(1.dp, Color(0x33E8B84B), RoundedCornerShape(20.dp)),
                    contentAlignment = Alignment.Center
                ) { Text("🔔", style = MaterialTheme.typography.headlineSmall) }
                Text("You're all caught up", color = Color(0xFFF4ECD6), style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 12.dp))
                Text(
                    "No new notifications right now. Match invites, quest updates, and guild news will show up here.",
                    color = Color(0xFF8B7CAE),
                    style = MaterialTheme.typography.bodySmall,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    modifier = Modifier.padding(top = 12.dp)
                )
            }
            data != null -> LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = screenContentPadding()
            ) {
                val groups = listOf("Today" to data.groups.today, "Yesterday" to data.groups.yesterday, "Earlier" to data.groups.earlier)
                groups.forEach { (label, items) ->
                    if (items.isNotEmpty()) {
                        item {
                            Text(label.uppercase(), color = Color(0xFF8B7CAE), style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(start = 18.dp, end = 18.dp, top = 8.dp, bottom = 9.dp))
                        }
                        items(items, key = { it.id }) { n ->
                            NotificationSwipeRow(
                                notif = n,
                                isOpen = swipeState.isOpen(n.id),
                                onOpenChange = { open -> swipeState = if (open) swipeState.open(n.id) else swipeState.close(n.id) },
                                onClick = { scope.launch { NotificationsRepository.markRead(n.id) } },
                                onDismiss = { swipeState = swipeState.close(n.id); scope.launch { NotificationsRepository.dismiss(n.id) } },
                                onAccept = { scope.launch { NotificationsRepository.resolveFriendRequest(n, accept = true) } },
                                onDecline = { scope.launch { NotificationsRepository.resolveFriendRequest(n, accept = false) } }
                            )
                        }
                    }
                }
            }
        }
        } // PullRefreshContainer
    }
}

private fun relativeTime(iso: String): String {
    val then = try { Instant.parse(iso) } catch (_: Exception) { return "" }
    val secs = ChronoUnit.SECONDS.between(then, Instant.now()).coerceAtLeast(0)
    return when {
        secs < 45 -> "Just now"
        secs < 3600 -> "${secs / 60}m ago"
        secs < 86400 -> "${secs / 3600}h ago"
        secs < 604800 -> "${secs / 86400}d ago"
        else -> "${secs / 604800}w ago"
    }
}

private fun iconFor(type: String): String = when {
    notifIsFriendType(type) -> "👥"
    type == "achievement" -> "🏆"
    type == "event" -> "📅"
    type == "system" -> "⚙️"
    else -> "🔔"
}

@Composable
private fun NotificationSwipeRow(
    notif: NotificationDto,
    isOpen: Boolean,
    onOpenChange: (Boolean) -> Unit,
    onClick: () -> Unit,
    onDismiss: () -> Unit,
    onAccept: () -> Unit,
    onDecline: () -> Unit
) {
    val unread = notif.readAt == null
    val pending = notifIsPending(notif)
    val status = notifStatus(notif)

    Box(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.5.dp).height(if (pending) 130.dp else 86.dp)) {
        SwipeRevealRow(
            isOpen = isOpen,
            onOpenChange = onOpenChange,
            actions = {
                // The red delete tray is CLIPPED to the same 16dp rounded shape as
                // the card in front of it. Without this the tray is a square-
                // cornered rectangle behind a rounded card, so when the row is
                // CLOSED the red pokes out at all four corners + the side edges
                // (owner-reported "red corners"). Clipping it to match means the
                // red only ever shows on the straight right edge when swiped open.
                Row(
                    modifier = Modifier.fillMaxSize().clip(RoundedCornerShape(16.dp)),
                    horizontalArrangement = Arrangement.End
                ) {
                    Box(
                        modifier = Modifier.fillMaxSize().width(132.dp)
                            .background(Color(0xFFD93B52))
                            .clickable(onClick = onDismiss),
                        contentAlignment = Alignment.CenterEnd
                    ) { Text("🗑", color = Color.White, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(end = 22.dp)) }
                }
            },
            content = {
                // The card MUST be OPAQUE. It sits over the red swipe-to-delete
                // tray; an unread bg of 0x0FE8B84B (≈6% alpha gold) let the red
                // tray glow straight through, so an unread row looked like a solid
                // red card (owner-reported). Use an opaque unread colour (a gold-
                // tinted dark, distinct from the read #1E1134) so the red only ever
                // shows when the row is actually swiped open.
                Box(modifier = Modifier.fillMaxSize().background(if (unread) Color(0xFF2A1E42) else Color(0xFF1E1134), RoundedCornerShape(16.dp))) {
                    if (unread) {
                        Box(
                            modifier = Modifier.align(Alignment.TopStart).padding(top = 16.dp, start = 6.dp)
                                .size(7.dp).background(Color(0xFFFF5A6A), CircleShape)
                        )
                    }
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .clickable(onClick = onClick)
                            .padding(14.dp)
                    ) {
                        Row(verticalAlignment = Alignment.Top) {
                            Box(modifier = Modifier.size(44.dp), contentAlignment = Alignment.Center) {
                                if (notif.type == "achievement") {
                                    com.filipinodama.app.ui.components.CurrencyIcon(kind = com.filipinodama.app.ui.components.CurrencyIconKind.TROPHY, size = 28.dp)
                                } else {
                                    Text(iconFor(notif.type), style = MaterialTheme.typography.headlineSmall)
                                }
                            }
                            Column(modifier = Modifier.weight(1f).padding(start = 12.dp)) {
                                Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text(notif.title, color = Color(0xFFF4ECD6), style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                                    Text(relativeTime(notif.createdAt), color = Color(0xFF8B7CAE), style = MaterialTheme.typography.labelSmall)
                                }
                                if (notif.body != null) {
                                    Text(notif.body, color = Color(0xFFA99BC9), style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 3.dp))
                                }
                            }
                        }
                        if (pending) {
                            Row(modifier = Modifier.fillMaxWidth().padding(top = 10.dp, start = 56.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Box(
                                    modifier = Modifier.weight(1f).clickable(onClick = onAccept)
                                        .background(Gold, RoundedCornerShape(9.dp)).padding(vertical = 9.dp),
                                    contentAlignment = Alignment.Center
                                ) { Text("Accept", color = Color(0xFF3A2405), style = MaterialTheme.typography.labelSmall) }
                                Box(
                                    modifier = Modifier.weight(1f).clickable(onClick = onDecline)
                                        .background(Color.Black.copy(alpha = 0.3f), RoundedCornerShape(9.dp)).padding(vertical = 9.dp),
                                    contentAlignment = Alignment.Center
                                ) { Text("Decline", color = Ink, style = MaterialTheme.typography.labelSmall) }
                            }
                        } else if (status != null) {
                            Text(if (status == "accepted") "✓ Accepted" else "Declined", color = Ink2, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 8.dp, start = 56.dp))
                        }
                    }
                }
            }
        )
    }
}
