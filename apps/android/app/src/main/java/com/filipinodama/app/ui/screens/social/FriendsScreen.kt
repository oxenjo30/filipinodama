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
import androidx.compose.ui.window.Dialog
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.social.FriendRequestDto
import com.filipinodama.app.data.social.FriendUserDto
import com.filipinodama.app.data.social.FriendsRepository
import com.filipinodama.app.data.social.PresenceRepository
import com.filipinodama.app.data.social.SocialResult
import com.filipinodama.app.ui.screens.game.GameButton
import com.filipinodama.app.ui.screens.game.GameButtonVariant
import com.filipinodama.app.ui.screens.profile.AvatarView
import com.filipinodama.app.ui.components.CurrencyAmount
import com.filipinodama.app.ui.components.CurrencyIconKind
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Green
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel
import kotlinx.coroutines.launch

/**
 * FriendsScreen — mobile-screen-inventory.md SCREEN 26, a Compose port of
 * apps/web FriendsPage.tsx. LIVE presence via [PresenceRepository] (subscribed
 * exactly like the web store); rows built: summary tiles, search filter,
 * Requests (accept/decline), Online/Offline sections (swipe-to-reveal
 * Mute/Delete — Delete wired to real unfriend via DELETE /api/friends/:id;
 * Mute is UI-local per-row state since there is no server mute-friend
 * endpoint, mirrored honestly as a client-only toggle, matching the
 * prototype's `fdr.chatMuted` local-storage-only behavior), Suggested Players,
 * Add Friend modal (by #tag).
 */
@Composable
fun FriendsScreen(
    onBack: () -> Unit,
    onOpenProfile: (String) -> Unit,
    onOpenChat: (String) -> Unit
) {
    val me = AuthRepository.state.collectAsState().value.user
    val onlineSet by PresenceRepository.online.collectAsState()
    val scope = rememberCoroutineScope()

    var loading by remember { mutableStateOf(true) }
    var friends by remember { mutableStateOf<List<FriendUserDto>>(emptyList()) }
    var incoming by remember { mutableStateOf<List<FriendRequestDto>>(emptyList()) }
    var suggested by remember { mutableStateOf<List<FriendUserDto>>(emptyList()) }
    var query by remember { mutableStateOf("") }
    var busyIds by remember { mutableStateOf(setOf<String>()) }
    var mutedIds by remember { mutableStateOf(setOf<String>()) }
    var swipeState by remember { mutableStateOf(SwipeListState()) }
    var addOpen by remember { mutableStateOf(false) }

    fun refresh() {
        scope.launch {
            loading = true
            when (val f = FriendsRepository.friends()) {
                is SocialResult.Success -> friends = f.data.friends
                is SocialResult.Failure -> {}
            }
            when (val r = FriendsRepository.requests()) {
                is SocialResult.Success -> incoming = r.data.incoming
                is SocialResult.Failure -> {}
            }
            when (val s = FriendsRepository.suggested()) {
                is SocialResult.Success -> suggested = s.data.suggested
                is SocialResult.Failure -> {}
            }
            loading = false
        }
    }

    LaunchedEffect(me?.id) {
        if (me == null) {
            loading = false
            return@LaunchedEffect
        }
        PresenceRepository.start()
        refresh()
    }

    fun accept(req: FriendRequestDto) {
        if (busyIds.contains(req.id)) return
        busyIds = busyIds + req.id
        scope.launch {
            when (FriendsRepository.acceptRequest(req.id)) {
                is SocialResult.Success -> {
                    incoming = incoming.filter { it.id != req.id }
                    friends = listOf(req.user) + friends
                }
                is SocialResult.Failure -> {}
            }
            busyIds = busyIds - req.id
        }
    }

    fun decline(req: FriendRequestDto) {
        if (busyIds.contains(req.id)) return
        busyIds = busyIds + req.id
        scope.launch {
            when (FriendsRepository.declineRequest(req.id)) {
                is SocialResult.Success -> incoming = incoming.filter { it.id != req.id }
                is SocialResult.Failure -> {}
            }
            busyIds = busyIds - req.id
        }
    }

    fun addSuggested(u: FriendUserDto) {
        if (busyIds.contains(u.id)) return
        busyIds = busyIds + u.id
        scope.launch {
            when (val result = FriendsRepository.sendRequest(u.id)) {
                is SocialResult.Success -> {
                    suggested = suggested.filter { it.id != u.id }
                    if (result.data.status == "accepted") friends = listOf(u) + friends
                }
                is SocialResult.Failure -> {}
            }
            busyIds = busyIds - u.id
        }
    }

    fun removeFriend(u: FriendUserDto) {
        swipeState = swipeState.close(u.id)
        scope.launch {
            when (FriendsRepository.removeFriend(u.id)) {
                is SocialResult.Success -> friends = friends.filter { it.id != u.id }
                is SocialResult.Failure -> {}
            }
        }
    }

    val filteredFriends = remember(friends, query) {
        val q = query.trim().lowercase()
        if (q.isEmpty()) friends else friends.filter {
            it.displayName.lowercase().contains(q) || it.tag.lowercase().contains(q) || it.rankTier.lowercase().contains(q)
        }
    }
    val onlineFriends = filteredFriends.filter { onlineSet.contains(it.id) }
    val offlineFriends = filteredFriends.filter { !onlineSet.contains(it.id) }
    val onlineCount = friends.count { onlineSet.contains(it.id) }

    if (me == null) {
        Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background), contentAlignment = Alignment.Center) {
            Text("Sign in to build your circle", color = GoldLt, style = MaterialTheme.typography.titleLarge)
        }
        return
    }

    if (addOpen) {
        AddFriendDialog(onClose = { addOpen = false }, onSent = { refresh() })
    }

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).verticalScroll(rememberScrollState())) {
        Row(modifier = Modifier.fillMaxWidth().padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text("‹ Back", color = GoldLt, style = MaterialTheme.typography.labelLarge, modifier = Modifier.clickable(onClick = onBack))
                Text("✦ YOUR CIRCLE ✦", color = Gold, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 10.dp))
                Text("Friends", color = GoldLt, style = MaterialTheme.typography.headlineMedium, modifier = Modifier.padding(top = 2.dp))
            }
            Box(
                modifier = Modifier
                    .clickable { addOpen = true }
                    .background(Gold.copy(alpha = 0.14f), RoundedCornerShape(10.dp))
                    .padding(horizontal = 16.dp, vertical = 12.dp)
            ) {
                Text("＋ Add", color = GoldLt, style = MaterialTheme.typography.labelLarge)
            }
        }

        Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            SummaryTile("Friends", friends.size.toString(), GoldLt, Modifier.weight(1f))
            SummaryTile("Online Now", onlineCount.toString(), Green, Modifier.weight(1f))
            SummaryTile("Requests", incoming.size.toString(), Color(0xFFFF9AA6), Modifier.weight(1f))
        }

        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            placeholder = { Text("Search friends by name or tier…", color = Ink2.copy(alpha = 0.6f)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp),
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

        if (loading) {
            Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Gold) }
        } else {
            if (incoming.isNotEmpty()) {
                SectionCard(title = "Friend Requests · ${incoming.size}") {
                    incoming.forEach { req ->
                        FriendRequestRow(req = req, busy = busyIds.contains(req.id), onOpen = { onOpenProfile(req.user.id) }, onAccept = { accept(req) }, onDecline = { decline(req) })
                    }
                }
            }

            if (friends.isEmpty()) {
                SectionCard(title = "Friends · 0") {
                    Text("You haven't added any friends yet. Add players to challenge them to matches and climb together.", color = Ink2, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(vertical = 12.dp))
                    GameButton("＋ Add a Friend", { addOpen = true })
                }
            } else if (filteredFriends.isEmpty()) {
                SectionCard(title = "Friends · ${friends.size}") {
                    Text("No friends match “${query.trim()}”.", color = Ink2, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(vertical = 16.dp))
                }
            } else {
                if (onlineFriends.isNotEmpty()) {
                    SectionCard(title = "Online · ${onlineFriends.size}") {
                        onlineFriends.forEach { f ->
                            FriendSwipeRow(
                                friend = f,
                                online = true,
                                muted = mutedIds.contains(f.id),
                                isOpen = swipeState.isOpen(f.id),
                                onOpenChange = { open -> swipeState = if (open) swipeState.open(f.id) else swipeState.close(f.id) },
                                onOpenProfile = { onOpenProfile(f.id) },
                                onMessage = { onOpenChat(f.id) },
                                onMute = { mutedIds = if (mutedIds.contains(f.id)) mutedIds - f.id else mutedIds + f.id; swipeState = swipeState.close(f.id) },
                                onDelete = { removeFriend(f) }
                            )
                        }
                    }
                }
                if (offlineFriends.isNotEmpty()) {
                    SectionCard(title = "Offline · ${offlineFriends.size}") {
                        offlineFriends.forEach { f ->
                            FriendSwipeRow(
                                friend = f,
                                online = false,
                                muted = mutedIds.contains(f.id),
                                isOpen = swipeState.isOpen(f.id),
                                onOpenChange = { open -> swipeState = if (open) swipeState.open(f.id) else swipeState.close(f.id) },
                                onOpenProfile = { onOpenProfile(f.id) },
                                onMessage = null,
                                onMute = { mutedIds = if (mutedIds.contains(f.id)) mutedIds - f.id else mutedIds + f.id; swipeState = swipeState.close(f.id) },
                                onDelete = { removeFriend(f) }
                            )
                        }
                    }
                }
            }

            if (suggested.isNotEmpty()) {
                SectionCard(title = "Suggested Players") {
                    suggested.forEach { s ->
                        SuggestedRow(user = s, busy = busyIds.contains(s.id), onOpen = { onOpenProfile(s.id) }, onAdd = { addSuggested(s) })
                    }
                }
            }
        }
    }
}

@Composable
private fun SummaryTile(label: String, value: String, color: Color, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.background(Panel, RoundedCornerShape(12.dp)).padding(vertical = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(value, color = color, style = MaterialTheme.typography.titleLarge)
        Text(label, color = Ink2, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 3.dp))
    }
}

@Composable
private fun SectionCard(title: String, content: @Composable () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp).background(Panel, RoundedCornerShape(16.dp)).padding(18.dp)) {
        Text(title, color = GoldLt, style = MaterialTheme.typography.titleMedium)
        Column(modifier = Modifier.padding(top = 10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            content()
        }
    }
}

@Composable
private fun PresenceDot(online: Boolean, modifier: Modifier = Modifier) {
    Box(modifier = modifier.size(12.dp).background(if (online) Green else Ink2, CircleShape))
}

@Composable
private fun FriendRequestRow(req: FriendRequestDto, busy: Boolean, onOpen: () -> Unit, onAccept: () -> Unit, onDecline: () -> Unit) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        AvatarView(avatarUrl = req.user.avatarUrl, frameId = req.user.frameId, size = 44.dp, onClick = onOpen)
        Column(modifier = Modifier.weight(1f).padding(start = 12.dp).clickable(onClick = onOpen)) {
            Text(req.user.displayName, color = Color.White, style = MaterialTheme.typography.bodyLarge)
            Text("${req.user.tag} · ${req.user.rankTier}", color = Ink2, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 2.dp))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(
                modifier = Modifier.clickable(enabled = !busy, onClick = onAccept)
                    .background(Green.copy(alpha = 0.18f), RoundedCornerShape(8.dp))
                    .padding(horizontal = 14.dp, vertical = 9.dp)
            ) { Text("Accept", color = Green, style = MaterialTheme.typography.labelMedium) }
            Box(
                modifier = Modifier.clickable(enabled = !busy, onClick = onDecline)
                    .background(Color.Black.copy(alpha = 0.25f), RoundedCornerShape(8.dp))
                    .padding(horizontal = 14.dp, vertical = 9.dp)
            ) { Text("Decline", color = Ink2, style = MaterialTheme.typography.labelMedium) }
        }
    }
}

@Composable
private fun FriendSwipeRow(
    friend: FriendUserDto,
    online: Boolean,
    muted: Boolean,
    isOpen: Boolean,
    onOpenChange: (Boolean) -> Unit,
    onOpenProfile: () -> Unit,
    onMessage: (() -> Unit)?,
    onMute: () -> Unit,
    onDelete: () -> Unit
) {
    Box(modifier = Modifier.fillMaxWidth().height(64.dp)) {
        SwipeRevealRow(
            isOpen = isOpen,
            onOpenChange = onOpenChange,
            actions = {
                Row(modifier = Modifier.fillMaxSize(), horizontalArrangement = Arrangement.End) {
                    Box(
                        modifier = Modifier.fillMaxSize().weight(1f)
                            .background(Color(0xFF5A3A8C))
                            .clickable(onClick = onMute),
                        contentAlignment = Alignment.Center
                    ) { Text(if (muted) "🔔 Unmute" else "🔔 Mute", color = Color.White, style = MaterialTheme.typography.labelSmall) }
                    Box(
                        modifier = Modifier.fillMaxSize().weight(1f)
                            .background(Color(0xFFA8202F))
                            .clickable(onClick = onDelete),
                        contentAlignment = Alignment.Center
                    ) { Text("🗑 Delete", color = Color.White, style = MaterialTheme.typography.labelSmall) }
                }
            },
            content = {
                Row(
                    modifier = Modifier.fillMaxSize().background(Panel).clickable(onClick = onOpenProfile).padding(horizontal = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box {
                        AvatarView(avatarUrl = friend.avatarUrl, frameId = friend.frameId, size = 44.dp)
                        PresenceDot(online = online, modifier = Modifier.align(Alignment.BottomEnd))
                    }
                    Column(modifier = Modifier.weight(1f).padding(start = 12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(friend.displayName, color = Color.White, style = MaterialTheme.typography.bodyLarge)
                            if (muted) Text(" 🔕", color = Ink2, style = MaterialTheme.typography.labelSmall)
                        }
                        CurrencyAmount(
                            kind = CurrencyIconKind.TROPHY,
                            text = friend.trophies.toString(),
                            prefix = if (online) "Online now · " else "Offline · ",
                            color = if (online) Green else Ink2,
                            style = MaterialTheme.typography.labelSmall,
                            modifier = Modifier.padding(top = 2.dp)
                        )
                    }
                    if (onMessage != null) {
                        Box(
                            modifier = Modifier.clickable(onClick = onMessage)
                                .background(Gold.copy(alpha = 0.12f), RoundedCornerShape(8.dp))
                                .padding(horizontal = 12.dp, vertical = 10.dp)
                        ) { Text("💬", style = MaterialTheme.typography.bodyMedium) }
                    }
                }
            }
        )
    }
}

@Composable
private fun SuggestedRow(user: FriendUserDto, busy: Boolean, onOpen: () -> Unit, onAdd: () -> Unit) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        AvatarView(avatarUrl = user.avatarUrl, frameId = user.frameId, size = 44.dp, onClick = onOpen)
        Column(modifier = Modifier.weight(1f).padding(start = 12.dp).clickable(onClick = onOpen)) {
            Text(user.displayName, color = Color.White, style = MaterialTheme.typography.bodyLarge)
            CurrencyAmount(kind = CurrencyIconKind.TROPHY, text = user.trophies.toString(), prefix = "${user.tag} · ", color = Ink2, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 2.dp))
        }
        Box(
            modifier = Modifier.clickable(enabled = !busy, onClick = onAdd)
                .background(Green.copy(alpha = 0.18f), RoundedCornerShape(8.dp))
                .padding(horizontal = 14.dp, vertical = 9.dp)
        ) { Text("＋ Add", color = Green, style = MaterialTheme.typography.labelMedium) }
    }
}

@Composable
private fun AddFriendDialog(onClose: () -> Unit, onSent: () -> Unit) {
    val scope = rememberCoroutineScope()
    var tag by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }

    fun send() {
        val trimmed = tag.trim()
        if (trimmed.isEmpty() || busy) return
        busy = true
        scope.launch {
            when (val result = FriendsRepository.sendRequestByTag(trimmed)) {
                is SocialResult.Success -> {
                    tag = ""
                    onSent()
                    onClose()
                }
                is SocialResult.Failure -> message = result.message
            }
            busy = false
        }
    }

    Dialog(onDismissRequest = { if (!busy) onClose() }) {
        Column(modifier = Modifier.fillMaxWidth().background(Panel, RoundedCornerShape(18.dp)).padding(24.dp)) {
            Text("Add a Friend", color = GoldLt, style = MaterialTheme.typography.headlineSmall)
            Text("Enter their player tag to send a request", color = Ink2, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 4.dp, bottom = 16.dp))
            OutlinedTextField(
                value = tag,
                onValueChange = { tag = it },
                placeholder = { Text("#3947", color = Ink2.copy(alpha = 0.6f)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
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
            Text("A tag looks like #3947 — find it on a player's profile.", color = Ink2, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 8.dp))
            if (message != null) {
                Text(message!!, color = Color(0xFFFF8FAE), style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 8.dp))
            }
            Box(modifier = Modifier.padding(top = 20.dp)) {
                GameButton(if (busy) "Sending…" else "Send Request", { send() }, enabled = !busy && tag.trim().isNotEmpty())
            }
        }
    }
}
