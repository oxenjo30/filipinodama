package com.filipinodama.app.ui.screens.social

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.social.DmConversationDto
import com.filipinodama.app.data.social.DmMessageDto
import com.filipinodama.app.data.social.DmRepository
import com.filipinodama.app.data.social.PresenceRepository
import com.filipinodama.app.ui.screens.profile.AvatarView
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Green
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel
import kotlinx.coroutines.launch

/**
 * DmConversationListScreen — the left pane of apps/web MessagesPage.tsx as a
 * standalone screen (Android has no two-pane desktop layout; each pane is its
 * own screen, matching the "explicit back target per screen" convention).
 * Real conversations from GET /api/dm, live previews/unread via DmRepository's
 * socket subscription + refresh-on-message.
 */
@Composable
fun DmConversationListScreen(onBack: () -> Unit, onOpenThread: (String) -> Unit) {
    val me = AuthRepository.state.collectAsState().value.user
    val dmState by DmRepository.state.collectAsState()
    val onlineSet by PresenceRepository.online.collectAsState()
    val scope = rememberCoroutineScope()

    LaunchedEffect(me?.id) {
        if (me == null) return@LaunchedEffect
        PresenceRepository.start()
        DmRepository.loadConversations()
    }

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(20.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            com.filipinodama.app.ui.components.MockupBackButton(onClick = onBack)
            Text("Messages", color = GoldLt, style = MaterialTheme.typography.headlineMedium)
        }

        if (me == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Sign in to message your friends.", color = Ink2, style = MaterialTheme.typography.bodyMedium)
            }
            return@Column
        }

        if (dmState.loadingList && dmState.conversations.isEmpty()) {
            Box(Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Gold) }
        } else if (dmState.conversations.isEmpty()) {
            Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                Text("No conversations yet.\nMessage a friend from your Friends list to start.", color = Ink2, style = MaterialTheme.typography.bodyMedium, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            }
        } else {
            LazyColumn(modifier = Modifier.fillMaxSize()) {
                items(dmState.conversations, key = { it.channelId }) { c ->
                    ConversationRow(conversation = c, online = onlineSet.contains(c.user.id), onClick = { onOpenThread(c.user.id) })
                }
            }
        }
    }
}

@Composable
private fun ConversationRow(conversation: DmConversationDto, online: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box {
            AvatarView(avatarUrl = conversation.user.avatarUrl, size = 42.dp)
            Box(modifier = Modifier.align(Alignment.BottomEnd).size(12.dp).background(if (online) Green else Ink2, CircleShape))
        }
        Column(modifier = Modifier.weight(1f).padding(start = 12.dp)) {
            Text(conversation.user.displayName, color = Color.White, style = MaterialTheme.typography.bodyLarge)
            Text(
                conversation.lastMessage ?: "Say hello 👋",
                color = if (conversation.unread > 0) Color(0xFFEFE7FB) else Ink2,
                style = MaterialTheme.typography.bodySmall,
                maxLines = 1,
                modifier = Modifier.padding(top = 2.dp)
            )
        }
        if (conversation.unread > 0) {
            Box(
                modifier = Modifier.size(20.dp).background(Color(0xFFA8202F), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Text(if (conversation.unread > 99) "99+" else conversation.unread.toString(), color = Color.White, style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

/**
 * DmThreadScreen — the right pane of apps/web MessagesPage.tsx: message
 * bubbles with author + time, a composer, and a per-message Report action
 * (context="dm") wired to [ReportPlayerDialog], mirroring MessagesPage.tsx's
 * per-bubble Report button.
 */
@Composable
fun DmThreadScreen(userId: String, onBack: () -> Unit) {
    val me = AuthRepository.state.collectAsState().value.user
    val dmState by DmRepository.state.collectAsState()
    val onlineSet by PresenceRepository.online.collectAsState()
    val scope = rememberCoroutineScope()
    var draft by remember { mutableStateOf("") }
    var reportTarget by remember { mutableStateOf<Pair<String, String>?>(null) } // id to body
    // Phase 7 retry affordance: bump to re-run the thread-open call below.
    var retryTick by remember { mutableStateOf(0) }

    LaunchedEffect(userId, retryTick) {
        DmRepository.openThread(userId)
    }

    val myId = me?.id ?: ""
    val openUser = dmState.openUser
    val headerOnline = openUser != null && onlineSet.contains(openUser.id)

    if (reportTarget != null && openUser != null) {
        ReportPlayerDialog(
            accusedId = openUser.id,
            context = "dm",
            messageId = reportTarget!!.first,
            quotedText = reportTarget!!.second,
            onClose = { reportTarget = null }
        )
    }

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Row(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            com.filipinodama.app.ui.components.MockupBackButton(onClick = onBack, modifier = Modifier.padding(end = 12.dp))
            if (openUser != null) AvatarView(avatarUrl = openUser.avatarUrl, size = 38.dp)
            Column(modifier = Modifier.weight(1f).padding(start = 10.dp)) {
                Text(openUser?.displayName ?: if (dmState.loadingThread) "Loading…" else "Conversation", color = GoldLt, style = MaterialTheme.typography.titleMedium)
                if (openUser != null) {
                    Text(if (headerOnline) "● Online now" else "○ Offline", color = if (headerOnline) Green else Ink2, style = MaterialTheme.typography.labelSmall)
                }
            }
        }

        val listState = rememberLazyListState()
        LaunchedEffect(dmState.messages.size) {
            if (dmState.messages.isNotEmpty()) listState.animateScrollToItem(dmState.messages.size - 1)
        }

        Box(modifier = Modifier.weight(1f)) {
            when {
                dmState.loadingThread && dmState.messages.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Gold) }
                dmState.error != null && dmState.messages.isEmpty() -> Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(dmState.error!!, color = Ink2, style = MaterialTheme.typography.bodyMedium, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                        Text(
                            "Retry",
                            color = GoldLt,
                            style = MaterialTheme.typography.labelLarge,
                            modifier = Modifier.padding(top = 12.dp).clickable { retryTick++ }
                        )
                    }
                }
                dmState.messages.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("No messages yet.\nSay hello 👋", color = Ink2, style = MaterialTheme.typography.bodyMedium, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                }
                else -> LazyColumn(state = listState, modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
                    items(dmState.messages, key = { it.id }) { m ->
                        MessageBubble(message = m, mine = m.author.id == myId, onReport = { reportTarget = m.id to m.body })
                    }
                }
            }
        }

        Row(modifier = Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = draft,
                onValueChange = { draft = it },
                placeholder = { Text("Message ${openUser?.displayName ?: "your friend"}…", color = Ink2.copy(alpha = 0.6f)) },
                modifier = Modifier.weight(1f),
                singleLine = true,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = Color.White,
                    unfocusedTextColor = Color.White,
                    focusedBorderColor = Gold,
                    unfocusedBorderColor = Gold.copy(alpha = 0.25f),
                    focusedContainerColor = Color.Black.copy(alpha = 0.3f),
                    unfocusedContainerColor = Color.Black.copy(alpha = 0.3f),
                    cursorColor = Gold
                )
            )
            Box(
                modifier = Modifier
                    .padding(start = 8.dp)
                    .clickable(enabled = !dmState.sending && draft.isNotBlank()) {
                        val body = draft.trim()
                        draft = ""
                        scope.launch { DmRepository.send(userId, body) }
                    }
                    .background(Gold, RoundedCornerShape(10.dp))
                    .padding(horizontal = 16.dp, vertical = 14.dp)
            ) {
                Text("Send", color = Color(0xFF2A1607), style = MaterialTheme.typography.labelMedium)
            }
        }
    }
}

@Composable
private fun MessageBubble(message: DmMessageDto, mine: Boolean, onReport: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
        horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start
    ) {
        Column(horizontalAlignment = if (mine) Alignment.End else Alignment.Start, modifier = Modifier.fillMaxWidth(0.82f)) {
            if (!mine) {
                Text(message.author.displayName, color = Color(0xFFC9A6FF), style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(bottom = 3.dp))
            }
            Box(
                modifier = Modifier
                    .background(
                        if (mine) Gold else Color.White.copy(alpha = 0.06f),
                        RoundedCornerShape(topStart = 14.dp, topEnd = 14.dp, bottomStart = if (mine) 14.dp else 4.dp, bottomEnd = if (mine) 4.dp else 14.dp)
                    )
                    .padding(horizontal = 13.dp, vertical = 9.dp)
            ) {
                Text(message.body, color = if (mine) Color(0xFF2A1607) else Color(0xFFEFE7FB), style = MaterialTheme.typography.bodyMedium)
            }
            if (!mine) {
                Text(
                    "Report",
                    color = Ink2,
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier.padding(top = 3.dp).clickable(onClick = onReport)
                )
            }
        }
    }
}
