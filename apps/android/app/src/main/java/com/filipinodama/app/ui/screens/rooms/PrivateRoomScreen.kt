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
import androidx.compose.ui.unit.sp
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
            RoomError.Locked -> { toast = "That room is locked — the host isn't accepting new players."; mode = RoomScreenMode.JOIN }
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
    // "Allow spectators" is a LOCAL host preference — the server has no field
    // for it yet (spectating is always technically open via the link), so we
    // keep it honest: this only toggles what the host sees, exactly like the
    // web PrivateRoomPage's local `allowSpec`. Not presented as shared state.
    var allowSpec by remember { mutableStateOf(true) }

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
                locked = ui.locked,
                isHost = isHost,
                onToggleLock = { RoomRepository.setLock(!ui.locked) },
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

        // Players card + Match Settings live TOGETHER (mockup 1680-1721: the
        // "Game Mode / Time Control / Move Timer" block is inside the players
        // card, under the VS grid, host-only).
        item {
            PlayersCard(
                host = ui.host,
                guest = ui.guest,
                isHost = isHost,
                settings = ui.settings,
                onKick = onKick,
                onBan = onBan,
                onSettings = onSettings
            )
        }

        // Card order matches the mockup (1723-1780): Spectators → Invite
        // Friends → Room Chat.
        item {
            SpectatorsCard(
                spectators = ui.spectators,
                allowSpec = allowSpec,
                isHost = isHost,
                onKick = onKick,
                onToggleSpec = { allowSpec = !allowSpec },
                roomUrl = roomUrl,
                clipboard = clipboard,
                onOpenSpectate = onSpectateSelf
            )
        }

        if (isHost) {
            item { InviteFriendsCard(roomUrl = roomUrl) }
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
private fun RoomCodeCard(
    code: String,
    copyLabel: String,
    locked: Boolean,
    isHost: Boolean,
    onToggleLock: () -> Unit,
    onCopyCode: () -> Unit,
    onCopyLink: () -> Unit,
    onShare: () -> Unit
) {
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
            // Mockup 1665-1669: "Copy Code" is the WIDE primary (flex:1, gold-
            // tinted); "Link" and "Invite" are COMPACT auto-width secondaries
            // (flex:none, dark bg + thin gold border). Not three equal-width
            // gradient buttons.
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Wide gold-tinted "Copy Code" primary (flex:1).
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clickable(onClick = onCopyCode)
                        .background(Gold.copy(alpha = 0.10f), RoundedCornerShape(11.dp))
                        .border(1.dp, Gold.copy(alpha = 0.3f), RoundedCornerShape(11.dp))
                        .padding(vertical = 11.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(copyLabel, color = Color(0xFFF0CF72), style = MaterialTheme.typography.labelLarge)
                }
                RoomCompactButton("🔗 Link", onCopyLink)
                RoomCompactButton("✉ Invite", onShare)
            }

            // "Lock the room" toggle (mockup 1670-1677): a divider, then the lock
            // icon + label + a dynamic subtitle + a switch. Host-only (a guest sees
            // the state but can't change it — disabled switch). While locked the
            // server turns away new joiners by code.
            Box(
                Modifier
                    .fillMaxWidth()
                    .padding(top = 16.dp)
                    .height(1.dp)
                    .background(Gold.copy(alpha = 0.12f))
            )
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(if (locked) "🔒" else "🔓", fontSize = 17.sp)
                Column(modifier = Modifier.weight(1f)) {
                    Text("Lock the room", color = Color(0xFFF4ECD6), style = MaterialTheme.typography.bodyMedium)
                    Text(
                        if (locked) "Locked — no one new can join" else "Anyone with the code can join",
                        color = Ink2,
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.padding(top = 1.dp)
                    )
                }
                Switch(
                    checked = locked,
                    onCheckedChange = { if (isHost) onToggleLock() },
                    enabled = isHost,
                    colors = SwitchDefaults.colors(
                        checkedThumbColor = Gold,
                        checkedTrackColor = Gold.copy(alpha = 0.4f)
                    )
                )
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
private fun PlayersCard(
    host: RoomMemberDto?,
    guest: RoomMemberDto?,
    isHost: Boolean,
    settings: GameSettings,
    onKick: (String) -> Unit,
    onBan: (String) -> Unit,
    onSettings: (GameSettings) -> Unit
) {
    GameFrameCard {
      Column {
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

        // ── Match settings (mockup 1706-1720) — INSIDE the players card, under
        //    the VS grid, host-only. Divider then Game Mode / Time Control /
        //    Move Timer chip rows. ──
        if (isHost) {
            MatchSettingsBlock(settings = settings, onSettings = onSettings)
        }
      }
    }
}

/**
 * Match-settings chip rows (mockup 1706-1720). Rendered for the HOST inside the
 * players card. Honesty boundary (mirrors web PrivateRoomPage.tsx lines 148-157):
 *  • "Game Mode" (Classic / Blitz) and "Time Control" (5 min / 10 min /
 *    Unlimited) are host-local visual preferences — the server has NO field for
 *    them, so they are NOT written to shared room state (selecting one only
 *    changes what the host sees). Presenting them as live shared state would be
 *    fabricated data.
 *  • "Move Timer" (10s / 20s / 30s / Off) is REAL — it writes to the
 *    authoritative settings.moveTimerSec the server persists and every client
 *    reads. These are the same option values the web uses.
 */
@Composable
private fun MatchSettingsBlock(settings: GameSettings, onSettings: (GameSettings) -> Unit) {
    // Local-only cosmetic preferences (no server field yet). Kept honest.
    var mode by remember { mutableStateOf("Classic") }
    var time by remember { mutableStateOf("10 min") }
    // The real, authoritative move-timer value.
    val moveTimerLabel = when (settings.moveTimerSec) {
        10 -> "10s"; 20 -> "20s"; 30 -> "30s"; else -> "Off"
    }

    Box(
        Modifier.fillMaxWidth().padding(top = 16.dp).height(1.dp).background(Gold.copy(alpha = 0.12f))
    )
    Column(modifier = Modifier.padding(top = 16.dp)) {
        SettingLabel("Game Mode")
        ChipRow(
            options = listOf("Classic", "Blitz"),
            selected = mode,
            onSelect = { mode = it }
        )

        SettingLabel("Time Control", topPad = 14.dp)
        ChipRow(
            options = listOf("5 min", "10 min", "Unlimited"),
            selected = time,
            onSelect = { time = it }
        )

        // Move Timer — real. Header row carries a live subtitle.
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 14.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("MOVE TIMER", color = Color(0xFFC79A4E), style = MaterialTheme.typography.labelSmall)
            Text(
                if (settings.moveTimerSec == null) "No per-move limit" else "${settings.moveTimerSec}s per move",
                color = Ink2,
                style = MaterialTheme.typography.labelSmall
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(7.dp), modifier = Modifier.padding(top = 8.dp)) {
            listOf("10s" to 10, "20s" to 20, "30s" to 30, "Off" to null).forEach { (label, secs) ->
                val selected = moveTimerLabel == label
                SettingChip(label = label, selected = selected) {
                    onSettings(settings.copy(moveTimerSec = secs))
                }
            }
        }
    }
}

/** Uppercase gold section label used by the match-settings rows (mockup 1708). */
@Composable
private fun SettingLabel(text: String, topPad: androidx.compose.ui.unit.Dp = 0.dp) {
    Text(
        text.uppercase(),
        color = Color(0xFFC79A4E),
        style = MaterialTheme.typography.labelSmall,
        modifier = Modifier.padding(top = topPad, bottom = 8.dp)
    )
}

/** A horizontal row of selectable setting chips. */
@Composable
private fun ChipRow(options: List<String>, selected: String, onSelect: (String) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        options.forEach { opt ->
            SettingChip(label = opt, selected = opt == selected) { onSelect(opt) }
        }
    }
}

/** One rounded setting chip (mockup segmented-control button style). */
@Composable
private fun SettingChip(label: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clickable(onClick = onClick)
            .background(if (selected) Gold.copy(alpha = 0.22f) else Color.White.copy(alpha = 0.06f), RoundedCornerShape(999.dp))
            .border(1.dp, if (selected) Gold else Gold.copy(alpha = 0.15f), RoundedCornerShape(999.dp))
            .padding(horizontal = 12.dp, vertical = 8.dp)
    ) {
        Text(label, color = if (selected) GoldLt else Ink, style = MaterialTheme.typography.labelMedium)
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

/**
 * Compact auto-width secondary button (mockup 1667-1668): dark translucent bg,
 * thin gold border, 12px label. Sizes to its content — used for the room-code
 * "Link" / "Invite" actions that sit beside the wide "Copy Code" primary.
 */
@Composable
private fun RoomCompactButton(text: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clickable(onClick = onClick)
            .background(Color(0x800F0720), RoundedCornerShape(11.dp))
            .border(1.dp, Gold.copy(alpha = 0.2f), RoundedCornerShape(11.dp))
            .padding(horizontal = 14.dp, vertical = 11.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(text, color = Color(0xFFC9B8E6), style = MaterialTheme.typography.labelLarge)
    }
}

/**
 * Small fully-rounded PILL button (mockup 1741-1742): auto-width, dark bg, thin
 * tinted border, 11px label. Used for "Copy Spectate Link" / "Spectator View"
 * — NOT the big full-width GameButton the old build used.
 */
@Composable
private fun RoomPill(text: String, borderColor: Color, textColor: Color, bg: Color, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clickable(onClick = onClick)
            .background(bg, RoundedCornerShape(100.dp))
            .border(1.dp, borderColor, RoundedCornerShape(100.dp))
            .padding(horizontal = 14.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(text, color = textColor, style = MaterialTheme.typography.labelMedium)
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
 * Spectators card (mockup 1723-1748). Header = "Spectators" + a subtitle + an
 * on/off SWITCH. When spectators are ALLOWED: either a wrap of spectator CHIPS
 * (avatar + name + host ✕) or the exact empty-state copy, then a small "Copy
 * Spectate Link" PILL and a "▶ Spectator View" pill (NOT a big full-width
 * button). When OFF: the "turned off" explainer.
 *
 * [allowSpec] is a host-local visual preference — the server has no field for a
 * spectator on/off toggle, so this only changes what the host sees (mirrors the
 * web PrivateRoomPage's local `allowSpec`); it is not fabricated shared state.
 */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun SpectatorsCard(
    spectators: List<RoomMemberDto>,
    allowSpec: Boolean,
    isHost: Boolean,
    onKick: (String) -> Unit,
    onToggleSpec: () -> Unit,
    roomUrl: String,
    clipboard: ClipboardManager,
    onOpenSpectate: () -> Unit
) {
    GameFrameCard {
        Column {
            // Header: title + subtitle + switch (mockup 1725-1728).
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Spectators", color = Color(0xFFF4D886), style = MaterialTheme.typography.titleSmall)
                    Text(
                        if (allowSpec) "${spectators.size} watching · friends can tune in" else "Match is private",
                        color = Ink2,
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.padding(top = 2.dp)
                    )
                }
                Switch(
                    checked = allowSpec,
                    onCheckedChange = { if (isHost) onToggleSpec() },
                    enabled = isHost,
                    colors = SwitchDefaults.colors(checkedThumbColor = Gold, checkedTrackColor = Gold.copy(alpha = 0.4f))
                )
            }

            if (allowSpec) {
                Column(modifier = Modifier.padding(top = 14.dp)) {
                    if (spectators.isEmpty()) {
                        Text(
                            "👁 No one is watching yet — share the spectate link to let friends tune in.",
                            color = Ink2,
                            style = MaterialTheme.typography.bodySmall
                        )
                    } else {
                        // Spectator chips (avatar + name + host ✕), wrapping.
                        androidx.compose.foundation.layout.FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            spectators.forEach { spec ->
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(7.dp),
                                    modifier = Modifier
                                        .background(Color(0x800F0720), RoundedCornerShape(100.dp))
                                        .border(1.dp, Gold.copy(alpha = 0.16f), RoundedCornerShape(100.dp))
                                        .padding(start = 5.dp, end = 8.dp, top = 5.dp, bottom = 5.dp)
                                ) {
                                    AvatarView(avatarUrl = spec.avatarUrl, size = 24.dp)
                                    Text(spec.name, color = Color(0xFFF4ECD6), style = MaterialTheme.typography.labelMedium)
                                    if (isHost) {
                                        Box(
                                            modifier = Modifier
                                                .size(18.dp)
                                                .clickable { onKick(spec.userId) }
                                                .background(Color(0x24A83744), CircleShape)
                                                .border(1.dp, Color(0x80A83744), CircleShape),
                                            contentAlignment = Alignment.Center
                                        ) { Text("✕", color = Color(0xFFFF8FAE), style = MaterialTheme.typography.labelSmall) }
                                    }
                                }
                            }
                        }
                    }
                    // The two share pills (mockup 1741-1742) — small, side by side.
                    Row(
                        modifier = Modifier.padding(top = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        RoomPill(
                            text = "👁 Copy Spectate Link",
                            borderColor = Gold.copy(alpha = 0.3f),
                            textColor = Color(0xFFC9B8E6),
                            bg = Color(0x800F0720),
                            onClick = { clipboard.setText(AnnotatedString(roomUrl)) }
                        )
                        RoomPill(
                            text = "▶ Spectator View",
                            borderColor = Color(0x595A96FF),
                            textColor = Color(0xFF8FB3FF),
                            bg = Color(0x1F5A96FF),
                            onClick = onOpenSpectate
                        )
                    }
                }
            } else {
                Text(
                    "Spectators are turned off. Only you and your opponent can see this match.",
                    color = Ink2,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 12.dp)
                )
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
