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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import com.filipinodama.app.data.engine.RankTiers
import com.filipinodama.app.data.social.DmRepository
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
import com.filipinodama.app.ui.components.LocalSnackbar
import com.filipinodama.app.ui.components.PullRefreshContainer
import com.filipinodama.app.ui.components.isAuthError
import com.filipinodama.app.ui.components.screenInsets
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Green
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel
import com.filipinodama.app.ui.theme.TextDefault
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
    onOpenChat: (String) -> Unit,
    onRequireSignIn: () -> Unit = {}
) {
    val me = AuthRepository.state.collectAsState().value.user
    val onlineSet by PresenceRepository.online.collectAsState()
    // Per-friend unread DM counts — REAL data from DmRepository's conversation list
    // (GET /api/dm), keyed by the other user's id. Drives the 💬 button's red
    // unread bubble (mockup line 2113). loadConversations() is invoked in the entry
    // LaunchedEffect so this is populated; nothing here is fabricated.
    val dmState by DmRepository.state.collectAsState()
    val unreadByFriend = remember(dmState.conversations) {
        dmState.conversations.associate { it.user.id to it.unread }
    }
    val scope = rememberCoroutineScope()
    val snackbar = LocalSnackbar.current

    var loading by remember { mutableStateOf(true) }
    // True when the friends list load itself failed — so a network error renders a
    // distinct "couldn't load — retry" state instead of the genuine-empty "no
    // friends yet" copy (they were previously indistinguishable).
    var loadFailed by remember { mutableStateOf(false) }
    var friends by remember { mutableStateOf<List<FriendUserDto>>(emptyList()) }
    var incoming by remember { mutableStateOf<List<FriendRequestDto>>(emptyList()) }
    var suggested by remember { mutableStateOf<List<FriendUserDto>>(emptyList()) }
    var query by remember { mutableStateOf("") }
    var busyIds by remember { mutableStateOf(setOf<String>()) }
    var mutedIds by remember { mutableStateOf(setOf<String>()) }
    var swipeState by remember { mutableStateOf(SwipeListState()) }
    var addOpen by remember { mutableStateOf(false) }

    // Extracted as a suspend fun (not just scope.launch'd) so pull-to-refresh can
    // await it directly via PullRefreshContainer's onRefresh.
    suspend fun refreshData() {
        loading = true
        // The friends list is the primary content; a failure there drives the
        // error state. Requests/suggested are secondary — their failure just
        // leaves those sections empty (not worth an error banner).
        when (val f = FriendsRepository.friends()) {
            is SocialResult.Success -> { friends = f.data.friends; loadFailed = false }
            is SocialResult.Failure -> loadFailed = true
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

    fun refresh() {
        scope.launch { refreshData() }
    }

    LaunchedEffect(me?.id) {
        if (me == null) {
            loading = false
            return@LaunchedEffect
        }
        PresenceRepository.start()
        refresh()
        // Populate per-friend unread counts for the 💬 badge (real GET /api/dm).
        DmRepository.loadConversations()
    }

    // Surface a failed social action instead of settling as if nothing happened.
    // A mid-session token expiry surfaces an auth code here (the me==null gate only
    // fires at load) — route those to the sign-in prompt like every other screen,
    // rather than swallowing them silently.
    fun surface(result: SocialResult.Failure) {
        if (isAuthError(result.code)) onRequireSignIn() else snackbar.show(result.message)
    }

    fun accept(req: FriendRequestDto) {
        if (busyIds.contains(req.id)) return
        busyIds = busyIds + req.id
        scope.launch {
            when (val r = FriendsRepository.acceptRequest(req.id)) {
                is SocialResult.Success -> {
                    incoming = incoming.filter { it.id != req.id }
                    friends = listOf(req.user) + friends
                }
                is SocialResult.Failure -> surface(r)
            }
            busyIds = busyIds - req.id
        }
    }

    fun decline(req: FriendRequestDto) {
        if (busyIds.contains(req.id)) return
        busyIds = busyIds + req.id
        scope.launch {
            when (val r = FriendsRepository.declineRequest(req.id)) {
                is SocialResult.Success -> incoming = incoming.filter { it.id != req.id }
                is SocialResult.Failure -> surface(r)
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
                is SocialResult.Failure -> surface(result)
            }
            busyIds = busyIds - u.id
        }
    }

    fun removeFriend(u: FriendUserDto) {
        swipeState = swipeState.close(u.id)
        scope.launch {
            when (val r = FriendsRepository.removeFriend(u.id)) {
                is SocialResult.Success -> friends = friends.filter { it.id != u.id }
                is SocialResult.Failure -> surface(r)
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
        // Mockup's dedicated Add-a-friend SCREEN (isAddFriend replaces
        // isFriends), not a dialog — live search results with per-row Add.
        AddFriendScreen(
            onBack = {
                addOpen = false
                refresh()
            },
            onOpenProfile = onOpenProfile
        )
        return
    }

    Column(modifier = Modifier.fillMaxSize().screenInsets().background(MaterialTheme.colorScheme.background)) {
        Row(modifier = Modifier.fillMaxWidth().padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
            // Mockup Friends header (line 2800): the ‹ chevron square button, then
            // the eyebrow + title. NOT a "‹ Back" text link (owner round-3 fix).
            com.filipinodama.app.ui.components.MockupBackButton(onClick = onBack)
            Column(modifier = Modifier.weight(1f).padding(start = 12.dp)) {
                Text("✦ YOUR CIRCLE ✦", color = Gold, style = MaterialTheme.typography.labelMedium)
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

        // Pull down anywhere in the scrollable body to RE-FETCH friends/requests/
        // suggested from the server (refreshData() — the same calls the entry
        // LaunchedEffect runs), so a pull gets the latest, not a cosmetic spinner.
        PullRefreshContainer(onRefresh = { refreshData() }) {
        Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        // Stat tiles — mockup order/labels/colors EXACTLY (line 3298-3300):
        // Online now (#6ee0a0 green) · Total friends (#f4d886 gold) · Requests.
        Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            SummaryTile("Online now", onlineCount.toString(), Color(0xFF6EE0A0), Modifier.weight(1f))
            SummaryTile("Total friends", friends.size.toString(), Color(0xFFF4D886), Modifier.weight(1f))
            SummaryTile("Requests", incoming.size.toString(), Color(0xFFC9A6FF), Modifier.weight(1f))
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
                // Mockup header (line 2081): "Requests · N" — not "Friend Requests".
                SectionCard(title = "Requests · ${incoming.size}") {
                    incoming.forEach { req ->
                        FriendRequestRow(req = req, busy = busyIds.contains(req.id), onOpen = { onOpenProfile(req.user.id) }, onAccept = { accept(req) }, onDecline = { decline(req) })
                    }
                }
            }

            if (loadFailed && friends.isEmpty()) {
                // A load failure is NOT an empty circle — show a distinct error +
                // Retry so the user knows the list didn't load (was previously
                // indistinguishable from having no friends).
                SectionCard(title = "Friends") {
                    Text("Couldn't load your friends. Check your connection and try again.", color = Ink2, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(vertical = 12.dp))
                    GameButton("Retry", { refresh() })
                }
            } else if (friends.isEmpty()) {
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
                                unread = unreadByFriend[f.id] ?: 0,
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
                    // Mockup "Offline" header carries NO count (unlike "Online · N" /
                    // "Requests · N") — line 2124.
                    SectionCard(title = "Offline") {
                        offlineFriends.forEach { f ->
                            FriendSwipeRow(
                                friend = f,
                                online = false,
                                muted = mutedIds.contains(f.id),
                                unread = unreadByFriend[f.id] ?: 0,
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
        } // Column (scrollable body)
        } // PullRefreshContainer
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
private fun PresenceDot(online: Boolean, inMatch: Boolean = false, modifier: Modifier = Modifier) {
    // 3-state (mockup line 3272): in a live match → amber #f0a94b; online →
    // green; offline → grey. in-match implies online.
    val color = when {
        inMatch -> Color(0xFFF0A94B)
        online -> Green
        else -> Ink2
    }
    Box(modifier = modifier.size(12.dp).background(color, CircleShape))
}

@Composable
private fun FriendRequestRow(req: FriendRequestDto, busy: Boolean, onOpen: () -> Unit, onAccept: () -> Unit, onDecline: () -> Unit) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        AvatarView(avatarUrl = req.user.avatarUrl, frameId = req.user.frameId, size = 44.dp, onClick = onOpen)
        Column(modifier = Modifier.weight(1f).padding(start = 12.dp).clickable(onClick = onOpen)) {
            Text(req.user.displayName, color = Color.White, style = MaterialTheme.typography.bodyLarge)
            Text("${req.user.tag} · ${req.user.rankTier}", color = Ink2, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 2.dp))
        }
        // Mockup (lines 2088-2089): compact 40x40 icon buttons — green ✓ (accept)
        // in a green-tinted square, grey ✕ (decline) transparent. Same
        // onAccept/onDecline wiring + busy-disable as the old text buttons.
        Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            Box(
                modifier = Modifier.size(40.dp)
                    .clickable(enabled = !busy, onClick = onAccept)
                    .background(Green.copy(alpha = 0.18f), RoundedCornerShape(10.dp))
                    .border(1.dp, Green.copy(alpha = 0.55f), RoundedCornerShape(10.dp)),
                contentAlignment = Alignment.Center
            ) { Text("✓", color = Green, style = MaterialTheme.typography.titleMedium) }
            Box(
                modifier = Modifier.size(40.dp)
                    .clickable(enabled = !busy, onClick = onDecline)
                    .border(1.dp, Gold.copy(alpha = 0.2f), RoundedCornerShape(10.dp)),
                contentAlignment = Alignment.Center
            ) { Text("✕", color = Ink2, style = MaterialTheme.typography.titleMedium) }
        }
    }
}

@Composable
private fun FriendSwipeRow(
    friend: FriendUserDto,
    online: Boolean,
    muted: Boolean,
    unread: Int,
    isOpen: Boolean,
    onOpenChange: (Boolean) -> Unit,
    onOpenProfile: () -> Unit,
    onMessage: (() -> Unit)?,
    onMute: () -> Unit,
    onDelete: () -> Unit
) {
    // Inline tier chip — tier + color derived from the friend's trophy count
    // (the authoritative source, exactly like web FriendsPage.tsx tierOf()); the
    // hex accent is parsed the same way SeasonScreen does, falling back to Ink2.
    val tier = RankTiers.forTrophies(friend.trophies)
    val tierColor = try {
        Color(android.graphics.Color.parseColor(tier.accent))
    } catch (_: Exception) {
        Ink2
    }
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
                        // in-match (amber) only counts while the friend is also online.
                        PresenceDot(online = online, inMatch = online && friend.inMatch, modifier = Modifier.align(Alignment.BottomEnd))
                    }
                    Column(modifier = Modifier.weight(1f).padding(start = 12.dp)) {
                        // Name row = displayName + inline tier chip (dot + label). The
                        // MOBILE mockup (line 2109) omits the #tag here to save the tight
                        // horizontal space (the wider web FriendRow shows it); tier color
                        // is derived from trophies exactly like web tierOf().
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                            Text(
                                friend.displayName,
                                color = if (online) Color.White else Color(0xFFEFE7FB),
                                style = MaterialTheme.typography.bodyLarge,
                                maxLines = 1
                            )
                            Box(
                                modifier = Modifier.size(7.dp).background(tierColor, CircleShape)
                            )
                            Text(tier.label, color = tierColor, style = MaterialTheme.typography.labelSmall, maxLines = 1)
                            if (muted) Text("🔕", color = Ink2, style = MaterialTheme.typography.labelSmall)
                        }
                        // Honest status line — tier now carries the rank signal, so the
                        // trophy count is dropped here (mockup line 2110 shows only the
                        // status label). In a match → amber "In a match"; online → green
                        // "Online now"; else grey "Offline".
                        val inGame = online && friend.inMatch
                        Text(
                            if (inGame) "In a match" else if (online) "Online now" else "Offline",
                            color = if (inGame) Color(0xFFF0A94B) else if (online) Green else Ink2,
                            style = MaterialTheme.typography.labelSmall,
                            modifier = Modifier.padding(top = 3.dp)
                        )
                    }
                    // Trailing actions: 💬 message button (with unread bubble) for online
                    // rows, then a discoverable ⋯ overflow menu (Mute/Unmute + Remove).
                    if (onMessage != null) {
                        Box {
                            Box(
                                modifier = Modifier.clickable(onClick = onMessage)
                                    .background(Gold.copy(alpha = 0.12f), RoundedCornerShape(8.dp))
                                    .padding(horizontal = 12.dp, vertical = 10.dp)
                            ) { Text("💬", style = MaterialTheme.typography.bodyMedium) }
                            // Unread bubble — REAL per-friend count from DmRepository
                            // (mockup line 2113). Only shown when there are unread DMs.
                            if (unread > 0) {
                                Box(
                                    modifier = Modifier.align(Alignment.TopEnd)
                                        .padding(top = 1.dp, end = 1.dp)
                                        .size(16.dp)
                                        .background(Color(0xFFA8202F), CircleShape)
                                        .border(2.dp, Panel, CircleShape),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        if (unread > 9) "9+" else unread.toString(),
                                        color = Color.White,
                                        style = MaterialTheme.typography.labelSmall
                                    )
                                }
                            }
                        }
                    }
                    FriendRowMenu(muted = muted, onMute = onMute, onDelete = onDelete)
                }
            }
        )
    }
}

/**
 * Discoverable overflow menu for a friend row — a ⋯ (kebab) icon button that
 * opens a DropdownMenu with Mute/Unmute and a red "Remove friend". This is the
 * VISIBLE unfriend affordance (the swipe-to-reveal Delete remains too); "Remove
 * friend" is wired to the same onDelete (removeFriend → DELETE /api/friends/:id).
 */
@Composable
private fun FriendRowMenu(muted: Boolean, onMute: () -> Unit, onDelete: () -> Unit) {
    var menuOpen by remember { mutableStateOf(false) }
    Box {
        Box(
            modifier = Modifier.clickable { menuOpen = true }
                .padding(horizontal = 8.dp, vertical = 10.dp),
            contentAlignment = Alignment.Center
        ) { Text("⋯", color = Ink2, style = MaterialTheme.typography.titleMedium) }
        DropdownMenu(
            expanded = menuOpen,
            onDismissRequest = { menuOpen = false },
            modifier = Modifier.background(Panel)
        ) {
            DropdownMenuItem(
                text = { Text(if (muted) "Unmute" else "Mute", color = TextDefault) },
                onClick = { menuOpen = false; onMute() }
            )
            DropdownMenuItem(
                text = { Text("Remove friend", color = Color(0xFFFF8F9E)) },
                onClick = { menuOpen = false; onDelete() }
            )
        }
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

/**
 * Add a friend — the mockup's dedicated live-search screen (mobile-split.txt
 * lines 2963-3001, `{{ isAddFriend }}`): back button + "✦ FIND PLAYERS ✦"
 * eyebrow + "Add a friend" title, search input ("Search by name or player
 * tag (#ABCD)…"), tag-sharing tip, then live results — avatar, name+tag,
 * tier·trophies, and a per-row gold "＋ Add" that flips to a green "Sent ✓"
 * pill. Search uses the same real GET /api/users/search the Global Search
 * screen uses; Add sends the real POST /friends/request by userId (the
 * previous blind exact-tag dialog is replaced — that flow forced users to
 * know the whole tag, the mockup's search-first flow is strictly better AND
 * is what the design specifies).
 */
@Composable
private fun AddFriendScreen(onBack: () -> Unit, onOpenProfile: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    val me = com.filipinodama.app.data.AuthRepository.state.collectAsState().value.user
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<com.filipinodama.app.data.social.UserSearchResultDto>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var sentIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    var errorMsg by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(query) {
        val q = query.trim()
        if (q.length < 2) {
            results = emptyList()
            loading = false
            return@LaunchedEffect
        }
        loading = true
        kotlinx.coroutines.delay(250)
        when (val r = com.filipinodama.app.data.social.SearchRepository.searchUsers(q)) {
            is SocialResult.Success -> results = r.data.items.filter { it.id != me?.id }
            is SocialResult.Failure -> results = emptyList()
        }
        loading = false
    }

    fun add(userId: String) {
        if (userId in sentIds) return
        scope.launch {
            when (val result = FriendsRepository.sendRequest(userId)) {
                is SocialResult.Success -> sentIds = sentIds + userId
                is SocialResult.Failure -> errorMsg = result.message
            }
        }
    }

    Column(modifier = Modifier.fillMaxSize().screenInsets().imePadding().background(MaterialTheme.colorScheme.background).padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(bottom = 16.dp)) {
            com.filipinodama.app.ui.components.MockupBackButton(onClick = onBack)
            Column {
                Text("✦ FIND PLAYERS ✦", color = Color(0xFFC79A4E), style = MaterialTheme.typography.labelSmall)
                Text("Add a friend", color = Color(0xFFF4D886), style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 2.dp))
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0x991B1030), RoundedCornerShape(13.dp))
                .border(1.dp, Color(0x29E8B84B), RoundedCornerShape(13.dp))
                .padding(horizontal = 12.dp, vertical = 3.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text("🔍", color = Color(0xFF8B7CAE), style = MaterialTheme.typography.labelLarge)
            Box(modifier = Modifier.weight(1f)) {
                if (query.isEmpty()) {
                    Text("Search by name or player tag (#ABCD)…", color = Color(0xFF6F6091), style = MaterialTheme.typography.bodySmall)
                }
                androidx.compose.foundation.text.BasicTextField(
                    value = query,
                    onValueChange = { query = it },
                    singleLine = true,
                    textStyle = androidx.compose.ui.text.TextStyle(color = Color(0xFFEFE7FB), fontSize = MaterialTheme.typography.bodySmall.fontSize),
                    cursorBrush = androidx.compose.ui.graphics.SolidColor(Gold),
                    modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp)
                )
            }
        }
        Text(
            "Tip: share your tag so friends can add you back.",
            color = Color(0xFF6F5F92),
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(top = 8.dp, bottom = 16.dp, start = 4.dp)
        )

        if (errorMsg != null) {
            Text(errorMsg!!, color = Color(0xFFFF8FAE), style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(bottom = 8.dp))
        }

        when {
            loading -> Box(Modifier.fillMaxWidth().padding(top = 24.dp), contentAlignment = Alignment.Center) {
                androidx.compose.material3.CircularProgressIndicator(color = Gold)
            }
            else -> Column(verticalArrangement = Arrangement.spacedBy(9.dp), modifier = Modifier.verticalScroll(rememberScrollState())) {
                results.forEach { p ->
                    val tier = com.filipinodama.app.data.engine.RankTiers.forTrophies(p.trophies)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color(0xCC1B1030), RoundedCornerShape(14.dp))
                            .border(1.dp, Color(0x1FE8B84B), RoundedCornerShape(14.dp))
                            .padding(horizontal = 13.dp, vertical = 11.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        com.filipinodama.app.ui.screens.profile.AvatarView(
                            avatarUrl = p.avatarUrl, size = 44.dp, frameId = p.frameId, ring = false,
                            onClick = { onOpenProfile(p.id) }
                        )
                        Column(modifier = Modifier.weight(1f).clickable { onOpenProfile(p.id) }) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                                Text(p.displayName, color = Color.White, style = MaterialTheme.typography.titleSmall, maxLines = 1)
                                Text(p.tag, color = Color(0xFF8B7CAE), style = MaterialTheme.typography.labelSmall)
                            }
                            Text("${tier.label} · ${p.trophies} 🏆", color = Color(0xFFC9A4FF), style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 3.dp))
                        }
                        if (p.id in sentIds) {
                            Box(
                                modifier = Modifier
                                    .background(Color(0x243FBF6F), RoundedCornerShape(10.dp))
                                    .border(1.dp, Color(0x4D3FBF6F), RoundedCornerShape(10.dp))
                                    .padding(horizontal = 13.dp, vertical = 9.dp)
                            ) { Text("Sent ✓", color = Color(0xFF7FE0A3), style = MaterialTheme.typography.labelMedium) }
                        } else {
                            Box(
                                modifier = Modifier
                                    .clickable { add(p.id) }
                                    .background(
                                        androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Color(0xFFF0C24B), Color(0xFFC9971F))),
                                        RoundedCornerShape(10.dp)
                                    )
                                    .border(1.dp, Color(0x73E8B84B), RoundedCornerShape(10.dp))
                                    .padding(horizontal = 15.dp, vertical = 9.dp)
                            ) { Text("＋ Add", color = Color(0xFF1A0F2E), style = MaterialTheme.typography.labelMedium) }
                        }
                    }
                }
            }
        }
    }
}
