package com.filipinodama.app.ui.screens.rooms

import android.content.Intent
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.ClipboardManager
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.filipinodama.app.BuildConfig
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.engine.GameSettings
import com.filipinodama.app.data.rooms.RoomError
import com.filipinodama.app.data.rooms.RoomMemberDto
import com.filipinodama.app.data.rooms.RoomRepository
import com.filipinodama.app.data.rooms.RoomUiState
import com.filipinodama.app.data.rooms.isValidRoomCode
import com.filipinodama.app.ui.screens.game.GameButton
import com.filipinodama.app.ui.screens.game.GameButtonVariant
import com.filipinodama.app.ui.screens.game.GameFrameCard
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
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
 * Web reference: apps/web/src/features/rooms/PrivateRoomPage.tsx. Deferred
 * this phase (report explicitly, not silently dropped): the "Invite Friends"
 * card (row 13) — Android has no friends system yet (no FriendsApi exists in
 * this codebase), so there is nothing real to back that list without
 * fabricating data, which is against the "server-authoritative, no fake
 * data" rule. Deep-link join-by-code and the room chat / share / host
 * controls / spectate rows are all fully wired below.
 */
@Composable
fun PrivateRoomScreen(
    deepLinkCode: String? = null,
    deepLinkSpectate: Boolean = false,
    onBack: () -> Unit,
    onEnterMatch: () -> Unit
) {
    val ui by RoomRepository.state.collectAsState()
    val authState by AuthRepository.state.collectAsState()
    val myUserId = authState.user?.id
    val scope = rememberCoroutineScope()
    var joinInput by remember { mutableStateOf("") }
    var mode by remember { mutableStateOf(RoomScreenMode.CHOOSE) }
    var toast by remember { mutableStateOf<String?>(null) }
    var resumeAttempted by remember { mutableStateOf(false) }

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
            null -> {}
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
                    if (isValidRoomCode(joinInput)) {
                        mode = RoomScreenMode.JOINING
                        scope.launch { RoomRepository.join(joinInput) }
                    }
                },
                onBack = { mode = RoomScreenMode.CHOOSE; RoomRepository.clearError() }
            )
            else -> ChooseState(
                onCreateRoom = { scope.launch { RoomRepository.create() } },
                onOpenJoin = { mode = RoomScreenMode.JOIN }
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
}

private enum class RoomScreenMode { CHOOSE, LOBBY, JOIN, JOINING }

@Composable
private fun RoomHeader(onBack: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().padding(20.dp)) {
        Text(
            text = "‹ Back",
            color = GoldLt,
            style = MaterialTheme.typography.labelLarge,
            modifier = Modifier.clickable(onClick = onBack)
        )
        Text(
            text = "✦ Play with a Friend ✦",
            color = Gold,
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(top = 12.dp)
        )
        Text(
            text = "Private Room",
            color = GoldLt,
            style = MaterialTheme.typography.headlineMedium,
            modifier = Modifier.padding(top = 4.dp)
        )
    }
}

@Composable
private fun ChooseState(onCreateRoom: () -> Unit, onOpenJoin: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        RoomChoiceCard(icon = "👑", title = "Host a Room", desc = "Create a room and share the code with a friend.", onClick = onCreateRoom)
        RoomChoiceCard(icon = "🔑", title = "Join with Code", desc = "Enter a 6-character code to join someone's room.", onClick = onOpenJoin)
    }
}

@Composable
private fun RoomChoiceCard(icon: String, title: String, desc: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .background(Panel, RoundedCornerShape(14.dp))
            .border(1.dp, Gold.copy(alpha = 0.2f), RoundedCornerShape(14.dp))
            .padding(18.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Box(modifier = Modifier.size(48.dp).background(Gold.copy(alpha = 0.12f), CircleShape), contentAlignment = Alignment.Center) {
            Text(icon, style = MaterialTheme.typography.titleLarge)
        }
        Column {
            Text(title, color = GoldLt, style = MaterialTheme.typography.titleMedium)
            Text(desc, color = Ink, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 2.dp))
        }
    }
}

@Composable
private fun JoinState(input: String, onInputChange: (String) -> Unit, error: String?, onSubmit: () -> Unit, onBack: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp)) {
        Text("Enter Room Code", color = Ink, style = MaterialTheme.typography.titleSmall)
        androidx.compose.material3.OutlinedTextField(
            value = input,
            onValueChange = onInputChange,
            placeholder = { Text("ABC123", color = Ink2.copy(alpha = 0.6f)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
            colors = androidx.compose.material3.OutlinedTextFieldDefaults.colors(
                focusedTextColor = Color.White,
                unfocusedTextColor = Color.White,
                focusedBorderColor = Gold,
                unfocusedBorderColor = Gold.copy(alpha = 0.25f),
                focusedContainerColor = Color.Black.copy(alpha = 0.3f),
                unfocusedContainerColor = Color.Black.copy(alpha = 0.3f),
                cursorColor = Gold
            ),
            shape = RoundedCornerShape(11.dp)
        )
        if (error != null) {
            Text(error, color = Color(0xFFFF8FAE), style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 8.dp))
        }
        Column(modifier = Modifier.padding(top = 20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            GameButton("Join Room", onSubmit, enabled = isValidRoomCode(input))
            GameButton("‹ Back", onBack, variant = GameButtonVariant.PURPLE)
        }
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

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 20.dp),
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

@Composable
private fun PlayersCard(host: RoomMemberDto?, guest: RoomMemberDto?, isHost: Boolean, onKick: (String) -> Unit, onBan: (String) -> Unit) {
    GameFrameCard {
        Column {
            Text("Players", color = Ink2, style = MaterialTheme.typography.labelSmall)
            SeatRow(name = host?.name ?: "Host", sub = "Host", modifier = Modifier.padding(top = 10.dp))
            if (guest != null) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 10.dp)) {
                    SeatRow(name = guest.name, sub = "Guest", modifier = Modifier.weight(1f))
                    if (isHost) {
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            SmallActionChip("Kick") { onKick(guest.userId) }
                            SmallActionChip("Ban", danger = true) { onBan(guest.userId) }
                        }
                    }
                }
            } else {
                Text("Waiting…", color = Ink2, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 10.dp))
            }
        }
    }
}

@Composable
private fun SeatRow(name: String, sub: String, modifier: Modifier = Modifier) {
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(modifier = Modifier.size(36.dp).background(Gold.copy(alpha = 0.16f), CircleShape), contentAlignment = Alignment.Center) {
            Text(name.take(1).uppercase(), color = GoldLt, style = MaterialTheme.typography.labelLarge)
        }
        Column {
            Text(name, color = Color.White, style = MaterialTheme.typography.titleSmall)
            Text(sub, color = Ink2, style = MaterialTheme.typography.labelSmall)
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
                listOf(null, 30, 60, 120).forEach { secs ->
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
