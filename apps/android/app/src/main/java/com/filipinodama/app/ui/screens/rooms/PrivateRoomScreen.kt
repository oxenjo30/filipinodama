package com.filipinodama.app.ui.screens.rooms

import android.content.Intent
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.ClipboardManager
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.runtime.collectAsState
import com.filipinodama.app.BuildConfig
import com.filipinodama.app.R
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.engine.GameSettings
import com.filipinodama.app.data.rooms.RoomError
import com.filipinodama.app.data.rooms.RoomMemberDto
import com.filipinodama.app.data.rooms.RoomRepository
import com.filipinodama.app.data.rooms.RoomUiState
import com.filipinodama.app.data.rooms.isValidRoomCode
import com.filipinodama.app.data.social.DmRepository
import com.filipinodama.app.data.social.FriendUserDto
import com.filipinodama.app.data.social.FriendsRepository
import com.filipinodama.app.data.social.PresenceRepository
import com.filipinodama.app.data.social.SocialResult
import com.filipinodama.app.ui.screens.game.GameButton
import com.filipinodama.app.ui.screens.game.GameButtonVariant
import com.filipinodama.app.ui.screens.game.GameFrameCard
import com.filipinodama.app.ui.screens.profile.AvatarView
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Green
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel
import kotlinx.coroutines.launch

/**
 * Private Room — mobile-screen-inventory.md SCREEN 20 (`{{ isRoom }}`, lines
 * 2217-2461). Four sub-states matching the prototype's roomIsChoose /
 * roomIsHost / roomIsJoin / roomIsJoining flags exactly, driven off
 * [RoomRepository.state] (server-owned — nothing here is fabricated).
 *
 * Web reference: apps/web/src/features/rooms/PrivateRoomPage.tsx. The
 * "Invite Friends" card (row 13, deferred in Phase 4 pending a friends
 * system) is now wired (Phase 6b): real friends from FriendsRepository, each
 * row's "Invite" button DMs the room link via DmRepository.send — the same
 * real, persisted DM channel the Friends/Messages screens use, matching the
 * inventory's "share the room link to a friend via DM" spec. Deep-link
 * join-by-code and the room chat / share / host controls / spectate rows are
 * all fully wired below.
 */
@Composable
fun PrivateRoomScreen(
    deepLinkCode: String? = null,
    deepLinkSpectate: Boolean = false,
    onBack: () -> Unit,
    onEnterMatch: () -> Unit,
    // Hosting or joining a private room needs a real account (the room socket
    // is auth'd). An anonymous user is shown a confirm prompt first, then
    // routed to Login/Signup — instead of the old silent no-launch.
    onRequireSignIn: () -> Unit = {}
) {
    val ui by RoomRepository.state.collectAsState()
    val authState by AuthRepository.state.collectAsState()
    val myUserId = authState.user?.id
    val signedIn = authState.user != null && authState.user?.isGuest != true
    val scope = rememberCoroutineScope()
    var joinInput by remember { mutableStateOf("") }
    var mode by remember { mutableStateOf(RoomScreenMode.CHOOSE) }
    var toast by remember { mutableStateOf<String?>(null) }
    var resumeAttempted by remember { mutableStateOf(false) }
    // When set, the "sign in to host/join a room" confirm dialog is shown; its
    // label describes the action ("host a room" / "join a room").
    var signInPromptAction by remember { mutableStateOf<String?>(null) }

    // ── Deep link: ?code=X auto-join (or auto-spectate) ──
    LaunchedEffect(deepLinkCode) {
        if (deepLinkCode != null) {
            mode = RoomScreenMode.JOINING
            if (deepLinkSpectate) RoomRepository.spectate(deepLinkCode) else RoomRepository.join(deepLinkCode)
        }
    }

    // ── Resume an active room on bare entry (no deep link) — mirrors
    //    PrivateRoomPage.tsx's GET /api/rooms/mine resume-on-entry. ──
    LaunchedEffect(deepLinkCode) {
        if (deepLinkCode != null || resumeAttempted) return@LaunchedEffect
        resumeAttempted = true
        val code = RoomRepository.fetchMyRoomCode()
        if (code != null) {
            mode = RoomScreenMode.JOINING
            RoomRepository.join(code)
            toast = "Rejoined your synced room — picking up where you left off."
        }
    }

    // ── Once the server snapshot has a code, we're in the lobby (host, guest,
    //    or spectator — HostOrGuestLobby renders the right controls per role). ──
    LaunchedEffect(ui.code) {
        if (ui.code != null) mode = RoomScreenMode.LOBBY
    }

    // ── Host started the match (we're a player) → navigate out ──
    LaunchedEffect(ui.startedMatchId) {
        if (ui.startedMatchId != null) {
            RoomRepository.consumeStart()
            onEnterMatch()
        }
    }

    // ── Surface room errors as an honest toast ──
    LaunchedEffect(ui.error) {
        when (val e = ui.error) {
            is RoomError.NotFound -> { toast = "No room found for code ${e.code}."; mode = RoomScreenMode.JOIN }
            is RoomError.Banned -> { toast = "You're banned from that room."; mode = RoomScreenMode.JOIN }
            is RoomError.YouBanned -> { toast = "You're banned from that room."; mode = RoomScreenMode.CHOOSE }
            RoomError.Kicked -> { toast = "You were removed from the room."; mode = RoomScreenMode.CHOOSE }
            RoomError.Closed -> { toast = "The host closed the room."; mode = RoomScreenMode.CHOOSE }
            RoomError.ConnectFailed -> { toast = "Couldn't connect — check your connection."; mode = RoomScreenMode.CHOOSE }
            null -> {}
        }
    }

    // ── Timeout safety net: if we've been stuck JOINING for ~8s with no
    //    state and no error (e.g. a connect that neither succeeds nor throws
    //    in a timely way), bail out instead of spinning forever. ──
    LaunchedEffect(mode) {
        if (mode == RoomScreenMode.JOINING) {
            kotlinx.coroutines.delay(8000)
            if (mode == RoomScreenMode.JOINING && RoomRepository.state.value.code == null) {
                toast = "Couldn't connect — check your connection."
                mode = RoomScreenMode.CHOOSE
                RoomRepository.clearError()
            }
        }
    }

    // ── Leave the room when we unmount (frees the seat server-side) ──
    androidx.compose.runtime.DisposableEffect(Unit) {
        onDispose {
            RoomRepository.leave()
            RoomRepository.reset()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .statusBarsPadding() // keep the header clear of the status bar / notch
    ) {
        RoomHeader(onBack = onBack)

        when {
            ui.spectateMatchId != null -> {
                // Match is live and we're spectating from the lobby — hand off
                // immediately (mirrors roomStore.ts: page stays put for web, but
                // Android's board is a separate screen, so navigate into it).
                LaunchedEffect(ui.spectateMatchId) { onEnterMatch() }
            }
            mode == RoomScreenMode.JOINING -> JoiningState()
            ui.code != null -> HostOrGuestLobby(
                ui = ui,
                myUserId = myUserId,
                onStart = { RoomRepository.start() },
                onLeave = { onBack() },
                onKick = { RoomRepository.kick(it) },
                onBan = { RoomRepository.ban(it) },
                onSettings = { RoomRepository.setSettings(it) },
                onSendChat = { RoomRepository.sendChat(it) },
                onSpectateSelf = { onEnterMatch() }
            )
            mode == RoomScreenMode.JOIN -> JoinState(
                input = joinInput,
                onInputChange = { joinInput = it.uppercase().take(com.filipinodama.app.data.rooms.ROOM_CODE_LENGTH) },
                error = (ui.error as? RoomError.NotFound)?.let { "No room found for that code." }
                    ?: (ui.error as? RoomError.Banned)?.let { "You're banned from that room." },
                onSubmit = {
                    // Joining a room also requires an account (owner decision
                    // 2026-07-15): the realtime socket rejects unauthenticated
                    // connections, so every room player must be signed in. An
                    // anonymous user gets the same "Sign in required" prompt as
                    // hosting rather than a silent failed connection.
                    if (isValidRoomCode(joinInput)) {
                        if (!signedIn) { signInPromptAction = "join a room"; return@JoinState }
                        mode = RoomScreenMode.JOINING
                        scope.launch { RoomRepository.join(joinInput) }
                    }
                },
                onBack = { mode = RoomScreenMode.CHOOSE; RoomRepository.clearError() }
            )
            else -> ChooseState(
                onCreateRoom = {
                    if (!signedIn) signInPromptAction = "host a room"
                    else scope.launch { RoomRepository.create() }
                },
                // Joining also needs an account (see JoinState onSubmit) — prompt
                // sign-in before showing the code-entry screen for an anon user.
                onOpenJoin = {
                    if (!signedIn) signInPromptAction = "join a room"
                    else mode = RoomScreenMode.JOIN
                }
            )
        }

        if (toast != null) {
            LaunchedEffect(toast) {
                kotlinx.coroutines.delay(3000)
                toast = null
            }
            Box(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Panel, RoundedCornerShape(10.dp))
                        .border(1.dp, Gold.copy(alpha = 0.3f), RoundedCornerShape(10.dp))
                        .padding(12.dp)
                ) {
                    Text(toast!!, color = GoldLt, style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                }
            }
        }
    }

    // Sign-in-required prompt (owner: "create a modal prompt first that
    // creating a Host Room requires them to sign, if they click Okay, they
    // proceed to login"). Uses the shared royal-themed SignInRequiredDialog —
    // the same universal modal every gated action reuses.
    signInPromptAction?.let { action ->
        com.filipinodama.app.ui.components.SignInRequiredDialog(
            action = action,
            onDismiss = { signInPromptAction = null },
            onConfirm = {
                signInPromptAction = null
                onRequireSignIn()
            }
        )
    }
}

private enum class RoomScreenMode { CHOOSE, LOBBY, JOIN, JOINING }

/**
 * Tier-2 UI-fidelity pass (visual/color only — functionality unchanged):
 * header now uses the shared MockupBackButton + trailing mode-friend art
 * (mockup lines 2220-2227) instead of a bare "‹ Back" text link; choice
 * cards use the mockup's exact per-card gradient backgrounds/borders/icon
 * tints (violet for Host, blue for Join, rounded-SQUARE icon wrapper not a
 * circle) and exact copy ("Generate a code and invite a friend" / "Enter a
 * 6-character room code").
 */
@Composable
private fun RoomHeader(onBack: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().padding(16.dp, 20.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            com.filipinodama.app.ui.components.MockupBackButton(onClick = onBack)
            Image(painter = painterResource(id = R.drawable.mode_friend), contentDescription = null, modifier = Modifier.size(34.dp))
        }
        Text(
            text = "✦ Play with a Friend ✦",
            color = Color(0xFFC79A4E),
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(top = 12.dp)
        )
        Text(
            text = "Private Room",
            color = Color(0xFFF4D886),
            style = MaterialTheme.typography.headlineMedium,
            modifier = Modifier.padding(top = 4.dp)
        )
        Text(
            text = "Play a friend privately. Host a room and share the code, or join theirs.",
            color = Color(0xFF9A8BBF),
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(top = 6.dp)
        )
    }
}

@Composable
private fun ChooseState(onCreateRoom: () -> Unit, onOpenJoin: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        RoomChoiceCard(
            iconRes = R.drawable.me_crown,
            title = "Host a Room",
            desc = "Generate a code and invite a friend",
            iconTint = Color(0x24C9A4FF),
            borderColor = Color(0x4DC9A4FF),
            gradient = listOf(Color(0xFF33234A), Color(0xFF1A1030)),
            chevronColor = Color(0xFFC9A4FF),
            onClick = onCreateRoom
        )
        RoomChoiceCard(
            icon = "🔑",
            title = "Join with Code",
            desc = "Enter a 6-character room code",
            iconTint = Color(0x245A96FF),
            borderColor = Color(0x475A96FF),
            gradient = listOf(Color(0xFF1C2C3A), Color(0xFF1A1030)),
            chevronColor = Color(0xFF5A96FF),
            onClick = onOpenJoin
        )
    }
}

/** [icon] emoji for a mode with no matching handoff art; [iconRes] a bundled
 *  drawable for "Host a Room" (real me-crown.png instead of the 👑 emoji). */
@Composable
private fun RoomChoiceCard(
    title: String,
    desc: String,
    onClick: () -> Unit,
    iconTint: Color,
    borderColor: Color,
    gradient: List<Color>,
    chevronColor: Color,
    icon: String? = null,
    iconRes: Int? = null
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .background(androidx.compose.ui.graphics.Brush.linearGradient(gradient), RoundedCornerShape(18.dp))
            .border(1.dp, borderColor, RoundedCornerShape(18.dp))
            .padding(22.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Box(modifier = Modifier.size(52.dp).background(iconTint, RoundedCornerShape(14.dp)), contentAlignment = Alignment.Center) {
            if (iconRes != null) {
                Image(painter = painterResource(id = iconRes), contentDescription = null, modifier = Modifier.size(26.dp))
            } else if (icon != null) {
                Text(icon, style = MaterialTheme.typography.titleLarge)
            }
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(title, color = Color(0xFFF4D886), style = MaterialTheme.typography.titleMedium)
            Text(desc, color = Color(0xFF9A8BBF), style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 3.dp))
        }
        Text("›", color = chevronColor, style = MaterialTheme.typography.headlineSmall)
    }
}

/**
 * Join-code entry — mockup lines 2433-2449: 6 individual character boxes
 * (44x56dp, blue-tinted border) with an invisible full-bleed text field
 * overlay for real keyboard input (mirrors the mockup's own
 * `opacity:0` input-over-visual-boxes technique), not a plain
 * OutlinedTextField.
 */
@Composable
private fun JoinState(input: String, onInputChange: (String) -> Unit, error: String?, onSubmit: () -> Unit, onBack: () -> Unit) {
    val focusRequester = remember { FocusRequester() }
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text("ENTER ROOM CODE", color = Color(0xFF9A8BBF), style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 8.dp))
        Box(modifier = Modifier.fillMaxWidth().padding(top = 18.dp), contentAlignment = Alignment.Center) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                repeat(com.filipinodama.app.data.rooms.ROOM_CODE_LENGTH) { i ->
                    val ch = input.getOrNull(i)?.toString() ?: ""
                    Box(
                        modifier = Modifier.size(44.dp, 56.dp)
                            .background(Color(0xD91B1030), RoundedCornerShape(12.dp))
                            .border(1.dp, Color(0x4D5A96FF), RoundedCornerShape(12.dp)),
                        contentAlignment = Alignment.Center
                    ) { Text(ch, color = Color(0xFFCFE0FF), style = MaterialTheme.typography.headlineSmall) }
                }
            }
            androidx.compose.foundation.text.BasicTextField(
                value = input,
                onValueChange = onInputChange,
                singleLine = true,
                textStyle = androidx.compose.ui.text.TextStyle(color = Color.Transparent),
                cursorBrush = androidx.compose.ui.graphics.SolidColor(Color.Transparent),
                modifier = Modifier.fillMaxWidth().height(56.dp).focusRequester(focusRequester)
            )
        }
        LaunchedEffect(Unit) { focusRequester.requestFocus() }
        if (error != null) {
            Text(error, color = Color(0xFFFF8095), style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 14.dp))
        }
        val joinEnabled = isValidRoomCode(input)
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 18.dp)
                .clickable(enabled = joinEnabled, onClick = onSubmit)
                .background(
                    if (joinEnabled) androidx.compose.ui.graphics.Brush.linearGradient(listOf(Color(0xFF5A96FF), Color(0xFF3F6FDB)))
                    else androidx.compose.ui.graphics.Brush.linearGradient(listOf(Color(0x665A96FF), Color(0x663F6FDB))),
                    RoundedCornerShape(14.dp)
                )
                .padding(vertical = 15.dp),
            contentAlignment = Alignment.Center
        ) { Text("Join Room", color = Color.White, style = MaterialTheme.typography.titleMedium) }
        Text(
            "‹ Back",
            color = Color(0xFF8F7FB8),
            style = MaterialTheme.typography.labelLarge,
            modifier = Modifier.padding(top = 14.dp, bottom = 8.dp).clickable(onClick = onBack)
        )
    }
}

@Composable
private fun JoiningState() {
    Column(
        modifier = Modifier.fillMaxSize().padding(40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        CircularProgressIndicator(color = Gold)
        Text("Joining room…", color = GoldLt, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 16.dp))
        Text("Connecting you to the match", color = Ink2, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 4.dp))
    }
}

@Composable
private fun HostOrGuestLobby(
    ui: RoomUiState,
    myUserId: String?,
    onStart: () -> Unit,
    onLeave: () -> Unit,
    onKick: (String) -> Unit,
    onBan: (String) -> Unit,
    onSettings: (GameSettings) -> Unit,
    onSendChat: (String) -> Unit,
    onSpectateSelf: () -> Unit
) {
    val isHost = ui.isHostUser(myUserId)
    val clipboard = LocalClipboardManager.current
    val context = LocalContext.current
    var copyLabel by remember { mutableStateOf("Copy Code") }
    val roomUrl = "${BuildConfig.WEB_ORIGIN}/rooms?code=${ui.code}"

    // navigationBarsPadding() lifts the whole scroll content above the system
    // nav/gesture bar so the last item (Leave / Start Match) clears it instead of
    // jamming against it (the mobile mockup reserves 96px at the bottom for this).
    // imePadding lifts it above the soft keyboard when the room-chat composer is
    // focused. A small top contentPadding gives the first card breathing room
    // under the header.
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp)
            .navigationBarsPadding()
            .imePadding(),
        contentPadding = PaddingValues(top = 4.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            RoomCodeCard(
                code = ui.code ?: "",
                copyLabel = copyLabel,
                onCopyCode = {
                    clipboard.setText(AnnotatedString(ui.code ?: ""))
                    copyLabel = "Copied!"
                },
                onCopyLink = {
                    clipboard.setText(AnnotatedString(roomUrl))
                },
                onShare = {
                    val send = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_TEXT, "Join my FilipinoDama room: $roomUrl")
                    }
                    context.startActivity(Intent.createChooser(send, "Invite to room"))
                }
            )
        }

        item {
            PlayersCard(host = ui.host, guest = ui.guest, isHost = isHost, onKick = onKick, onBan = onBan)
        }

        if (isHost) {
            item { SettingsCard(settings = ui.settings, onSettings = onSettings) }
        }

        if (isHost) {
            item { InviteFriendsCard(roomUrl = roomUrl) }
        }

        item {
            SpectatorsCard(spectators = ui.spectators, isHost = isHost, onKick = onKick, roomUrl = roomUrl, clipboard = clipboard, onOpenSpectate = onSpectateSelf)
        }

        item {
            RoomChatCard(chat = ui.chat, onSend = onSendChat)
        }

        item {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(bottom = 24.dp)) {
                GameButton("Leave", onLeave, variant = GameButtonVariant.PURPLE)
                if (isHost) {
                    GameButton(
                        text = if (ui.guest != null) "▶ Start Match" else "Waiting for a guest…",
                        onClick = onStart,
                        enabled = ui.guest != null,
                        variant = GameButtonVariant.GOLD
                    )
                }
            }
        }
    }
}

@Composable
private fun RoomCodeCard(code: String, copyLabel: String, onCopyCode: () -> Unit, onCopyLink: () -> Unit, onShare: () -> Unit) {
    GameFrameCard {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
            Text("Room Code", color = Ink2, style = MaterialTheme.typography.labelSmall)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 8.dp)) {
                code.padEnd(6, ' ').take(6).forEach { ch ->
                    Box(
                        modifier = Modifier
                            .size(38.dp)
                            .background(Color.Black.copy(alpha = 0.3f), RoundedCornerShape(8.dp))
                            .border(1.dp, Gold.copy(alpha = 0.4f), RoundedCornerShape(8.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(if (ch == ' ') "" else ch.toString(), color = GoldLt, style = MaterialTheme.typography.titleMedium)
                    }
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                GameButton(copyLabel, onCopyCode, modifier = Modifier.weight(1f))
                GameButton("🔗 Link", onCopyLink, variant = GameButtonVariant.PURPLE, modifier = Modifier.weight(1f))
                GameButton("✉ Invite", onShare, variant = GameButtonVariant.PURPLE, modifier = Modifier.weight(1f))
            }
        }
    }
}

/**
 * 3-column VS players card, matching the mobile mockup (Mobile.dc.html
 * 1682-1705): Host seat | round "VS" badge | Guest seat (or a dashed "Waiting…"
 * placeholder). Real 64dp avatars, HOST / ● Ready badges, Kick/Ban under the
 * guest for the host. Replaces the old flat letter-avatar list that read as a
 * web port.
 */
@Composable
private fun PlayersCard(host: RoomMemberDto?, guest: RoomMemberDto?, isHost: Boolean, onKick: (String) -> Unit, onBan: (String) -> Unit) {
    GameFrameCard {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Host seat
            PlayerSeat(
                name = host?.name ?: "Host",
                avatarUrl = host?.avatarUrl,
                badge = "HOST",
                badgeColor = GoldLt,
                nameColor = GoldLt,
                modifier = Modifier.weight(1f)
            )

            // VS badge
            Box(
                modifier = Modifier
                    .size(46.dp)
                    .border(1.dp, Gold.copy(alpha = 0.4f), CircleShape)
                    .background(Color(0xB30F0720), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Text("VS", color = GoldLt, style = MaterialTheme.typography.titleSmall)
            }

            // Guest seat OR waiting placeholder
            if (guest != null) {
                Column(
                    modifier = Modifier.weight(1f),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    PlayerSeat(
                        name = guest.name,
                        avatarUrl = guest.avatarUrl,
                        badge = "● READY",
                        badgeColor = Color(0xFF3FBF6F),
                        nameColor = Color(0xFFFF8FAE),
                        avatarRingColor = Color(0x80FF8FAE)
                    )
                    if (isHost) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(7.dp),
                            modifier = Modifier.padding(top = 9.dp)
                        ) {
                            SmallActionChip("Kick") { onKick(guest.userId) }
                            SmallActionChip("Ban", danger = true) { onBan(guest.userId) }
                        }
                    }
                }
            } else {
                Column(
                    modifier = Modifier.weight(1f),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Box(
                        modifier = Modifier
                            .size(64.dp)
                            .border(2.dp, Gold.copy(alpha = 0.3f), CircleShape)
                            .background(Color(0x800F0720), CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("?", color = Gold.copy(alpha = 0.4f), style = MaterialTheme.typography.titleLarge)
                    }
                    Text("Waiting…", color = Ink2, style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
                    Text("No one has joined yet", color = Ink2, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 2.dp))
                }
            }
        }
    }
}

/** One seat in the VS players grid: centered 64dp avatar + name + a small badge. */
@Composable
private fun PlayerSeat(
    name: String,
    avatarUrl: String?,
    badge: String,
    badgeColor: Color,
    nameColor: Color,
    avatarRingColor: Color = Gold.copy(alpha = 0.5f),
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        com.filipinodama.app.ui.screens.profile.AvatarView(
            avatarUrl = avatarUrl,
            size = 64.dp,
            ring = true
        )
        Text(
            name,
            color = nameColor,
            style = MaterialTheme.typography.titleSmall,
            maxLines = 1,
            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 8.dp)
        )
        Box(
            modifier = Modifier
                .padding(top = 4.dp)
                .border(1.dp, badgeColor.copy(alpha = 0.4f), RoundedCornerShape(999.dp))
                .padding(horizontal = 9.dp, vertical = 2.dp)
        ) {
            Text(badge, color = badgeColor, style = MaterialTheme.typography.labelSmall)
        }
    }
}

@Composable
private fun SmallActionChip(text: String, danger: Boolean = false, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clickable(onClick = onClick)
            .background(if (danger) Color(0x33FF5A6A) else Color.White.copy(alpha = 0.08f), RoundedCornerShape(999.dp))
            .padding(horizontal = 10.dp, vertical = 6.dp)
    ) {
        Text(text, color = if (danger) Color(0xFFFF8FAE) else Ink, style = MaterialTheme.typography.labelSmall)
    }
}

/**
 * Host controls for game settings — maps to the server's REAL sanitizeSettings
 * fields (apps/server/src/realtime/rooms.ts): forcedMaxCapture (bool),
 * drawMoveLimit (10-200), moveTimerSec (5-600, optional/off). The mockup's
 * "Game Mode" / "Time Control" / "Move Timer" chip rows are represented here
 * with the actual settings the server accepts — not invented chip values the
 * server would silently discard.
 */
@Composable
private fun SettingsCard(settings: GameSettings, onSettings: (GameSettings) -> Unit) {
    GameFrameCard {
        Column {
            Text("Match Settings", color = Ink2, style = MaterialTheme.typography.labelSmall)

            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text("Forced max capture", color = Color.White, style = MaterialTheme.typography.bodyMedium)
                    Text("Must take the biggest available capture", color = Ink2, style = MaterialTheme.typography.labelSmall)
                }
                Switch(
                    checked = settings.forcedMaxCapture,
                    onCheckedChange = { onSettings(settings.copy(forcedMaxCapture = it)) },
                    colors = SwitchDefaults.colors(checkedThumbColor = Gold, checkedTrackColor = Gold.copy(alpha = 0.4f))
                )
            }

            Text("Move Timer", color = Color.White, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
                // Mockup move-timer options: Off / 15s / 30s / 60s (ROOM-2).
                listOf(null, 15, 30, 60).forEach { secs ->
                    val selected = settings.moveTimerSec == secs
                    Box(
                        modifier = Modifier
                            .clickable { onSettings(settings.copy(moveTimerSec = secs)) }
                            .background(if (selected) Gold.copy(alpha = 0.22f) else Color.White.copy(alpha = 0.06f), RoundedCornerShape(999.dp))
                            .border(1.dp, if (selected) Gold else Gold.copy(alpha = 0.15f), RoundedCornerShape(999.dp))
                            .padding(horizontal = 12.dp, vertical = 8.dp)
                    ) {
                        Text(if (secs == null) "Off" else "${secs}s", color = if (selected) GoldLt else Ink, style = MaterialTheme.typography.labelMedium)
                    }
                }
            }

            Text("Draw Move Limit: ${settings.drawMoveLimit}", color = Color.White, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
                listOf(20, 40, 80, 120).forEach { limit ->
                    val selected = settings.drawMoveLimit == limit
                    Box(
                        modifier = Modifier
                            .clickable { onSettings(settings.copy(drawMoveLimit = limit)) }
                            .background(if (selected) Gold.copy(alpha = 0.22f) else Color.White.copy(alpha = 0.06f), RoundedCornerShape(999.dp))
                            .border(1.dp, if (selected) Gold else Gold.copy(alpha = 0.15f), RoundedCornerShape(999.dp))
                            .padding(horizontal = 12.dp, vertical = 8.dp)
                    ) {
                        Text("$limit", color = if (selected) GoldLt else Ink, style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
        }
    }
}

@Composable
private fun SpectatorsCard(
    spectators: List<RoomMemberDto>,
    isHost: Boolean,
    onKick: (String) -> Unit,
    roomUrl: String,
    clipboard: ClipboardManager,
    onOpenSpectate: () -> Unit
) {
    GameFrameCard {
        Column {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("Spectators (${spectators.size})", color = Ink2, style = MaterialTheme.typography.labelSmall)
            }
            if (spectators.isEmpty()) {
                Text("No one watching yet", color = Ink2, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 8.dp))
            } else {
                Column(modifier = Modifier.padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    spectators.forEach { spec ->
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Text(spec.name, color = Color.White, style = MaterialTheme.typography.bodyMedium)
                            if (isHost) SmallActionChip("Kick") { onKick(spec.userId) }
                        }
                    }
                }
            }
            Row(modifier = Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                GameButton("👁 Copy Spectate Link", onClick = { clipboard.setText(AnnotatedString(roomUrl)) }, variant = GameButtonVariant.PURPLE, modifier = Modifier.weight(1f))
            }
        }
    }
}

/**
 * Invite Friends card — mobile-screen-inventory.md SCREEN 20 row 13
 * (`sc-for roomFriends` — avatar+status, name, invite button -> `fr.invite`).
 * Real friends from FriendsRepository, live presence dots via
 * PresenceRepository (same store as FriendsScreen). "Invite" DMs the real
 * room share link through DmRepository.send — persisted, real chat, not a
 * fabricated invite mechanism.
 */
@Composable
private fun InviteFriendsCard(roomUrl: String) {
    val scope = rememberCoroutineScope()
    val onlineSet by PresenceRepository.online.collectAsState()
    var friends by remember { mutableStateOf<List<FriendUserDto>?>(null) }
    var sentIds by remember { mutableStateOf(setOf<String>()) }

    LaunchedEffect(Unit) {
        PresenceRepository.start()
        when (val result = FriendsRepository.friends()) {
            is SocialResult.Success -> friends = result.data.friends
            is SocialResult.Failure -> friends = emptyList()
        }
    }

    GameFrameCard {
        Column {
            Text("Invite Friends", color = Ink2, style = MaterialTheme.typography.labelSmall)
            when {
                friends == null -> Text("Loading…", color = Ink2, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 10.dp))
                friends!!.isEmpty() -> Text("Add friends to invite them to your room.", color = Ink2, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 10.dp))
                else -> Column(modifier = Modifier.padding(top = 10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    friends!!.forEach { f ->
                        val sent = sentIds.contains(f.id)
                        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Box {
                                AvatarView(avatarUrl = f.avatarUrl, frameId = f.frameId, size = 36.dp)
                                Box(
                                    modifier = Modifier.align(Alignment.BottomEnd).size(10.dp)
                                        .background(if (onlineSet.contains(f.id)) Green else Ink2, CircleShape)
                                )
                            }
                            Text(f.displayName, color = Color.White, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f).padding(start = 10.dp))
                            SmallActionChip(if (sent) "Sent ✓" else "Invite") {
                                if (!sent) {
                                    sentIds = sentIds + f.id
                                    scope.launch { DmRepository.send(f.id, "Join my FilipinoDama room: $roomUrl") }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RoomChatCard(chat: List<com.filipinodama.app.data.rooms.RoomChatMsg>, onSend: (String) -> Unit) {
    var draft by remember { mutableStateOf("") }
    GameFrameCard {
        Column {
            Text("Room Chat", color = Ink2, style = MaterialTheme.typography.labelSmall)
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 10.dp)
                    .background(Color.Black.copy(alpha = 0.2f), RoundedCornerShape(10.dp))
                    .padding(10.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                if (chat.isEmpty()) {
                    Text("No messages yet", color = Ink2, style = MaterialTheme.typography.bodySmall)
                } else {
                    chat.takeLast(20).forEach { m ->
                        Text(
                            text = "${m.from.name}: ${m.body}",
                            color = Ink,
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }
            }
            Row(modifier = Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                androidx.compose.material3.OutlinedTextField(
                    value = draft,
                    onValueChange = { draft = it },
                    placeholder = { Text("Say something…", color = Ink2.copy(alpha = 0.6f)) },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                    colors = androidx.compose.material3.OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White,
                        focusedBorderColor = Gold.copy(alpha = 0.6f),
                        unfocusedBorderColor = Gold.copy(alpha = 0.25f),
                        focusedContainerColor = Color.Black.copy(alpha = 0.2f),
                        unfocusedContainerColor = Color.Black.copy(alpha = 0.2f),
                        cursorColor = Gold
                    ),
                    shape = RoundedCornerShape(10.dp)
                )
                Box(
                    modifier = Modifier
                        .background(Gold, RoundedCornerShape(10.dp))
                        .clickable {
                            if (draft.isNotBlank()) {
                                onSend(draft)
                                draft = ""
                            }
                        }
                        .padding(horizontal = 16.dp, vertical = 12.dp)
                ) {
                    Text("Send", color = Color(0xFF2A1607), style = MaterialTheme.typography.labelMedium)
                }
            }
        }
    }
}
