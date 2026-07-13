package com.filipinodama.app.ui.screens.social

import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.temporal.ChronoUnit

/**
 * NotificationsScreen — mobile-screen-inventory.md SCREEN 12, a Compose port
 * of apps/web NotificationsMenu.tsx as a dedicated full screen. Rows built:
 * "Mark all read", grouped Today/Yesterday/Earlier lists (relative times),
 * swipe-to-reveal dismiss (matches `_nswDown/_nswMove/_nswUp` — reveals a red
 * delete/archive action), unread dot, friend-request Accept/Decline actions,
 * empty state.
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

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Row(modifier = Modifier.fillMaxWidth().padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text("‹ Back", color = GoldLt, style = MaterialTheme.typography.labelLarge, modifier = Modifier.clickable(onClick = onBack))
                Text("Notifications", color = GoldLt, style = MaterialTheme.typography.headlineMedium, modifier = Modifier.padding(top = 10.dp))
            }
            val unread = data?.unreadCount ?: 0
            Text(
                "Mark all read",
                color = if (unread > 0) Gold else Ink2,
                style = MaterialTheme.typography.labelMedium,
                modifier = Modifier.clickable(enabled = unread > 0) { scope.launch { NotificationsRepository.markAll() } }
            )
        }

        when {
            state.loading && data == null -> Box(Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Gold) }
            state.error && data == null -> Box(Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Couldn't load notifications", color = Ink, style = MaterialTheme.typography.titleMedium)
                    Text("Try again", color = Gold, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 10.dp).clickable { scope.launch { NotificationsRepository.load() } })
                }
            }
            isEmpty -> Box(Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("🔔", style = MaterialTheme.typography.headlineLarge)
                    Text("You're all caught up", color = Ink, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 10.dp))
                    Text(
                        "No new notifications right now. Match invites, quest updates, and guild news will show up here.",
                        color = Ink2,
                        style = MaterialTheme.typography.bodySmall,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                        modifier = Modifier.padding(top = 6.dp)
                    )
                }
            }
            data != null -> LazyColumn(modifier = Modifier.fillMaxSize()) {
                val groups = listOf("Today" to data.groups.today, "Yesterday" to data.groups.yesterday, "Earlier" to data.groups.earlier)
                groups.forEach { (label, items) ->
                    if (items.isNotEmpty()) {
                        item {
                            Text(label.uppercase(), color = Ink2, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(horizontal = 20.dp, vertical = 10.dp))
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

    Box(modifier = Modifier.fillMaxWidth().height(if (pending) 130.dp else 86.dp)) {
        SwipeRevealRow(
            isOpen = isOpen,
            onOpenChange = onOpenChange,
            actions = {
                Row(modifier = Modifier.fillMaxSize(), horizontalArrangement = Arrangement.End) {
                    Box(
                        modifier = Modifier.fillMaxSize().width(132.dp)
                            .background(Color(0xFFA8202F))
                            .clickable(onClick = onDismiss),
                        contentAlignment = Alignment.Center
                    ) { Text("🗑 Dismiss", color = Color.White, style = MaterialTheme.typography.labelSmall) }
                }
            },
            content = {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(if (unread) Gold.copy(alpha = 0.06f) else Panel)
                        .clickable(onClick = onClick)
                        .padding(horizontal = 20.dp, vertical = 12.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(modifier = Modifier.size(38.dp).background(Color(0x33785AB4), RoundedCornerShape(10.dp)), contentAlignment = Alignment.Center) {
                            if (notif.type == "achievement") {
                                com.filipinodama.app.ui.components.CurrencyIcon(kind = com.filipinodama.app.ui.components.CurrencyIconKind.TROPHY, size = 20.dp)
                            } else {
                                Text(iconFor(notif.type), style = MaterialTheme.typography.titleMedium)
                            }
                        }
                        Column(modifier = Modifier.weight(1f).padding(start = 12.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                if (unread) {
                                    Box(modifier = Modifier.size(7.dp).background(Gold, CircleShape))
                                    Box(modifier = Modifier.width(6.dp))
                                }
                                Text(notif.title, color = Color.White, style = MaterialTheme.typography.bodyLarge)
                            }
                            if (notif.body != null) {
                                Text(notif.body, color = Ink, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 2.dp))
                            }
                            Text(relativeTime(notif.createdAt), color = Ink2, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 4.dp))
                        }
                    }
                    if (pending) {
                        Row(modifier = Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Box(
                                modifier = Modifier.weight(1f).clickable(onClick = onAccept)
                                    .background(Gold, RoundedCornerShape(7.dp)).padding(vertical = 9.dp),
                                contentAlignment = Alignment.Center
                            ) { Text("ACCEPT", color = Color(0xFF3A2405), style = MaterialTheme.typography.labelSmall) }
                            Box(
                                modifier = Modifier.weight(1f).clickable(onClick = onDecline)
                                    .background(Color.Black.copy(alpha = 0.3f), RoundedCornerShape(7.dp)).padding(vertical = 9.dp),
                                contentAlignment = Alignment.Center
                            ) { Text("DECLINE", color = Ink, style = MaterialTheme.typography.labelSmall) }
                        }
                    } else if (status != null) {
                        Text(if (status == "accepted") "✓ Accepted" else "Declined", color = Ink2, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 8.dp))
                    }
                }
            }
        )
    }
}
