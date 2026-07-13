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
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
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
import coil.compose.AsyncImage
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.social.GUILD_CREST_KEYS
import com.filipinodama.app.data.social.GUILD_ROLE_RANK
import com.filipinodama.app.data.social.GuildCardDto
import com.filipinodama.app.data.social.GuildChatRepository
import com.filipinodama.app.data.social.GuildDetailResponse
import com.filipinodama.app.data.social.GuildJoinRequestDto
import com.filipinodama.app.data.social.GuildMemberDto
import com.filipinodama.app.data.social.GuildsRepository
import com.filipinodama.app.data.social.SocialResult
import com.filipinodama.app.data.social.guildRoleAtLeast
import com.filipinodama.app.data.social.resolveGuildCrest
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
 * GuildHallScreen — mobile-screen-inventory.md SCREEN 16, the GUILD tab
 * replacement, a Compose port of apps/web GuildsPage.tsx + GuildChatPanel.tsx.
 *
 * Rows built: no-guild state (browse + create, real crest picker), guild hall
 * banner (crest, name/tag, level from weeklyPoints, stats), Roster tab
 * (role-colored rows, manage-member sheet for officers+), Chat tab (real
 * guild-chat socket via GuildChatRepository), Join Requests panel
 * (officer+), Edit Guild (leader/officer), Leave.
 *
 * War tab / War Log: HONEST-HIDDEN. Verified against apps/server/src/modules
 * (no guild-war routes) and apps/server/src/realtime (no war socket events)
 * and apps/web (GuildsPage.tsx has only a cosmetic "Weekly Guild War" progress
 * bar driven by the real weeklyPoints field — no opponent/schedule/war-log
 * data exists anywhere). Wiring a "Wars" tab would mean fabricating an
 * opponent, a countdown, and a war log — against the no-fake-data rule. The
 * inventory's Wars tab rows are therefore deferred pending a real backend.
 */
@Composable
fun GuildHallScreen(onOpenProfile: (String) -> Unit) {
    val me = AuthRepository.state.collectAsState().value.user
    val scope = rememberCoroutineScope()

    var membershipChecked by remember { mutableStateOf(false) }
    var myGuildId by remember { mutableStateOf<String?>(null) }
    var detail by remember { mutableStateOf<GuildDetailResponse?>(null) }
    var requests by remember { mutableStateOf<List<GuildJoinRequestDto>?>(null) }
    var browse by remember { mutableStateOf<List<GuildCardDto>?>(null) }
    var search by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var createOpen by remember { mutableStateOf(false) }
    var editOpen by remember { mutableStateOf(false) }
    var chatOpen by remember { mutableStateOf(false) }
    var manageMember by remember { mutableStateOf<GuildMemberDto?>(null) }
    var tab by remember { mutableStateOf("roster") }

    fun loadBrowse() {
        scope.launch {
            when (val r = GuildsRepository.browse(search)) {
                is SocialResult.Success -> browse = r.data.guilds
                is SocialResult.Failure -> browse = emptyList()
            }
        }
    }

    fun loadDetail(guildId: String, roleHint: String?) {
        scope.launch {
            when (val d = GuildsRepository.detail(guildId)) {
                is SocialResult.Success -> {
                    detail = d.data
                    val role = d.data.myRole ?: roleHint
                    if (role != null && guildRoleAtLeast(role, "OFFICER")) {
                        when (val r = GuildsRepository.requests(guildId)) {
                            is SocialResult.Success -> requests = r.data.requests
                            is SocialResult.Failure -> requests = emptyList()
                        }
                    } else {
                        requests = null
                    }
                }
                is SocialResult.Failure -> detail = null
            }
        }
    }

    fun loadMembership() {
        if (me == null) {
            membershipChecked = true
            myGuildId = null
            detail = null
            requests = null
            return
        }
        scope.launch {
            // GET /api/guilds/:id via a public-profile shape is not available here,
            // so we reuse the same guild detail endpoint's joinState semantics:
            // fetch the browse list first, then check each guild's own detail for
            // membership would be wasteful — instead we rely on the server's own
            // /api/guilds/:id?membership pattern via /api/users/:id like web does.
            // Android has no ProfileApi.publicUser wired for guild yet, so the
            // simplest honest source is: try GET /api/guilds/{browse-derived id}
            // is not viable without an id. We fall back to the SAME contract web
            // uses: GET /api/users/:me.id returns { user: { guild } }.
            val userResult = com.filipinodama.app.data.profile.ProfileRepository.publicUser(me.id)
            when (userResult) {
                is com.filipinodama.app.data.profile.ProfileResult.Success -> {
                    val gid = userResult.data.user.guild?.id
                    myGuildId = gid
                    if (gid != null) loadDetail(gid, userResult.data.user.guild?.role)
                    else {
                        detail = null
                        requests = null
                    }
                }
                is com.filipinodama.app.data.profile.ProfileResult.Failure -> {
                    myGuildId = null
                    detail = null
                }
            }
            membershipChecked = true
        }
    }

    LaunchedEffect(me?.id) {
        loadBrowse()
        loadMembership()
    }

    val inGuild = myGuildId != null && detail != null
    val myRole = detail?.myRole
    val canManage = myRole != null && guildRoleAtLeast(myRole, "OFFICER")
    val isLeader = myRole == "LEADER"

    if (createOpen) {
        GuildCreateDialog(
            onClose = { createOpen = false },
            onCreated = { guildId ->
                myGuildId = guildId
                loadDetail(guildId, "LEADER")
                loadBrowse()
            }
        )
    }
    if (editOpen && detail != null) {
        GuildEditDialog(
            detail = detail!!,
            onClose = { editOpen = false },
            onSaved = {
                editOpen = false
                myGuildId?.let { loadDetail(it, myRole) }
                loadBrowse()
            }
        )
    }
    if (chatOpen && detail != null) {
        GuildChatDrawer(
            guildId = detail!!.guild.id,
            guildName = detail!!.guild.name,
            crestKey = detail!!.guild.crestKey,
            onClose = { chatOpen = false }
        )
    }
    if (manageMember != null && myGuildId != null) {
        ManageMemberDialog(
            member = manageMember!!,
            isLeader = isLeader,
            busy = busy,
            onClose = { manageMember = null },
            onChangeRole = { role ->
                busy = true
                scope.launch {
                    GuildsRepository.setMemberRole(myGuildId!!, manageMember!!.userId, role)
                    manageMember = null
                    loadDetail(myGuildId!!, myRole)
                    busy = false
                }
            },
            onKick = {
                busy = true
                scope.launch {
                    GuildsRepository.removeMember(myGuildId!!, manageMember!!.userId)
                    manageMember = null
                    loadDetail(myGuildId!!, myRole)
                    busy = false
                }
            }
        )
    }

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).verticalScroll(rememberScrollState())) {
        Row(modifier = Modifier.fillMaxWidth().padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text("ALLIANCES", color = Gold, style = MaterialTheme.typography.labelMedium)
                Text("Guild Hall", color = GoldLt, style = MaterialTheme.typography.headlineMedium, modifier = Modifier.padding(top = 4.dp))
            }
        }

        if (me == null) {
            SectionCard(title = "") {
                Text("Sign in to join the alliance", color = GoldLt, style = MaterialTheme.typography.titleLarge)
                Text("Guilds war together, share perks, and climb the ranks as one.", color = Ink2, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 8.dp))
            }
            return@Column
        }

        if (inGuild && detail != null) {
            val g = detail!!.guild
            val crest = resolveGuildCrest(g.crestKey, g.id)
            val level = (g.weeklyPoints.coerceAtLeast(0) / 1000) + 1

            SectionCard(title = "") {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    AsyncImage(model = crest.src, contentDescription = null, modifier = Modifier.size(72.dp))
                    Column(modifier = Modifier.weight(1f).padding(start = 16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(g.name, color = GoldLt, style = MaterialTheme.typography.headlineSmall)
                            Text(" ${g.tag}", color = Ink2, style = MaterialTheme.typography.labelMedium)
                        }
                        Text("Level $level · ${g.memberCount} members · ${g.weeklyPoints} pts", color = Ink2, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 4.dp))
                    }
                }
                if (!g.description.isNullOrBlank()) {
                    Text(g.description, color = Ink, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 10.dp))
                }
                Row(modifier = Modifier.fillMaxWidth().padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ActionChip("💬 Guild Chat", modifier = Modifier.weight(1f)) { chatOpen = true }
                    if (canManage) ActionChip("✎ Edit", modifier = Modifier.weight(1f)) { editOpen = true }
                }
                Text(
                    "Leave Guild",
                    color = Ink2,
                    style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier.padding(top = 14.dp).clickable(enabled = !busy) {
                        busy = true
                        scope.launch {
                            GuildsRepository.removeMember(g.id, me.id)
                            myGuildId = null
                            detail = null
                            requests = null
                            loadBrowse()
                            busy = false
                        }
                    }
                )
            }

            // Weekly war meter (real weeklyPoints; no wars tab, see kdoc)
            SectionCard(title = "Weekly Guild War") {
                val goal = maxOf(1000, ((g.weeklyPoints + 1) / 1000 + 1) * 1000)
                val pct = (g.weeklyPoints * 100 / goal).coerceIn(0, 100)
                Box(modifier = Modifier.fillMaxWidth().height(12.dp).background(Color.Black.copy(alpha = 0.35f), RoundedCornerShape(100.dp))) {
                    Box(modifier = Modifier.fillMaxWidth(pct / 100f).fillMaxSize().background(Gold, RoundedCornerShape(100.dp)))
                }
                Text("${g.weeklyPoints} war points this week · $pct% to goal", color = Ink2, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 8.dp))
            }

            Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp)) {
                TabButton("Roster", tab == "roster") { tab = "roster" }
            }

            SectionCard(title = "Members · ${g.memberCount}") {
                detail!!.roster.sortedByDescending { it.weeklyContribution }.forEachIndexed { i, m ->
                    RosterRow(
                        rank = i + 1,
                        member = m,
                        mine = m.userId == me.id,
                        manageable = canManage && m.userId != me.id && (GUILD_ROLE_RANK[myRole] ?: 0) > (GUILD_ROLE_RANK[m.role] ?: 0),
                        onOpenProfile = { onOpenProfile(m.userId) },
                        onManage = { manageMember = m }
                    )
                }
            }

            if (canManage) {
                SectionCard(title = "Join Requests" + (requests?.let { " · ${it.size}" } ?: "")) {
                    when {
                        requests == null -> Box(Modifier.fillMaxWidth().padding(20.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Gold) }
                        requests!!.isEmpty() -> Text("No pending requests.", color = Ink2, style = MaterialTheme.typography.bodyMedium)
                        else -> requests!!.forEach { r ->
                            JoinRequestRow(
                                request = r,
                                busy = busy,
                                onOpenProfile = { onOpenProfile(r.user.id) },
                                onAccept = {
                                    busy = true
                                    scope.launch {
                                        GuildsRepository.acceptRequest(g.id, r.id)
                                        requests = requests?.filter { it.id != r.id }
                                        loadDetail(g.id, myRole)
                                        busy = false
                                    }
                                },
                                onDecline = {
                                    busy = true
                                    scope.launch {
                                        GuildsRepository.declineRequest(g.id, r.id)
                                        requests = requests?.filter { it.id != r.id }
                                        busy = false
                                    }
                                }
                            )
                        }
                    }
                }
            }
        } else if (membershipChecked) {
            SectionCard(title = "") {
                Text("You are not in a guild yet", color = GoldLt, style = MaterialTheme.typography.titleLarge)
                Text(
                    "Guilds are alliances of players who war together, share perks, and climb the ranks as one. Browse below to find your people, or found your own.",
                    color = Ink2,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(top = 8.dp)
                )
                ActionChip("＋ Create Guild", modifier = Modifier.padding(top = 14.dp)) { createOpen = true }
            }
        }

        SectionCard(title = "Discover Guilds") {
            OutlinedTextField(
                value = search,
                onValueChange = { search = it },
                placeholder = { Text("Search guilds…", color = Ink2.copy(alpha = 0.6f)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = Color.White, unfocusedTextColor = Color.White,
                    focusedBorderColor = Gold, unfocusedBorderColor = Gold.copy(alpha = 0.25f),
                    focusedContainerColor = Color.Black.copy(alpha = 0.3f), unfocusedContainerColor = Color.Black.copy(alpha = 0.3f),
                    cursorColor = Gold
                )
            )
            Box(modifier = Modifier.padding(top = 4.dp)) {
                Text("Search", color = Gold, style = MaterialTheme.typography.labelMedium, modifier = Modifier.clickable { loadBrowse() })
            }
            when {
                browse == null -> Box(Modifier.fillMaxWidth().padding(20.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Gold) }
                browse!!.isEmpty() -> Text(if (search.isNotBlank()) "No guilds match your search." else "No guilds yet — be the first to found one.", color = Ink2, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 12.dp))
                else -> browse!!.forEach { card ->
                    BrowseGuildRow(
                        card = card,
                        isMine = card.id == myGuildId,
                        busy = busy,
                        onJoin = {
                            if (card.id != myGuildId) {
                                busy = true
                                scope.launch {
                                    when (val res = GuildsRepository.join(card.id)) {
                                        is SocialResult.Success -> {
                                            if (res.data.status == "joined") {
                                                myGuildId = card.id
                                                loadDetail(card.id, "MEMBER")
                                            }
                                            loadBrowse()
                                        }
                                        is SocialResult.Failure -> {}
                                    }
                                    busy = false
                                }
                            }
                        }
                    )
                }
            }
        }
    }
}

@Composable
private fun SectionCard(title: String, content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp).background(Panel, RoundedCornerShape(16.dp)).padding(18.dp)) {
        if (title.isNotEmpty()) Text(title, color = GoldLt, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(bottom = 10.dp))
        content()
    }
}

@Composable
private fun ActionChip(label: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier = modifier
            .clickable(onClick = onClick)
            .background(Gold.copy(alpha = 0.12f), RoundedCornerShape(9.dp))
            .padding(vertical = 11.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(label, color = GoldLt, style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
private fun TabButton(label: String, active: Boolean, onClick: () -> Unit) {
    Column(modifier = Modifier.clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 8.dp)) {
        Text(label.uppercase(), color = if (active) GoldLt else Ink2, style = MaterialTheme.typography.labelMedium)
        Box(modifier = Modifier.fillMaxWidth().height(2.dp).background(if (active) Gold else Color.Transparent))
    }
}

private val ROLE_COLOR: Map<String, Color> = mapOf("LEADER" to Gold, "OFFICER" to Color(0xFFC9A6FF), "MEMBER" to Ink)

@Composable
private fun RosterRow(rank: Int, member: GuildMemberDto, mine: Boolean, manageable: Boolean, onOpenProfile: () -> Unit, onManage: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp).clickable(onClick = onOpenProfile),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(rank.toString(), color = Ink2, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(end = 8.dp))
        AvatarView(avatarUrl = member.user.avatarUrl, frameId = member.user.frameId, size = 40.dp)
        Column(modifier = Modifier.weight(1f).padding(start = 10.dp)) {
            Text(member.user.displayName + if (mine) " (You)" else "", color = Color.White, style = MaterialTheme.typography.bodyMedium)
            Text(member.role, color = ROLE_COLOR[member.role] ?: Ink, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 2.dp))
        }
        Text("${member.weeklyContribution} pts", color = GoldLt, style = MaterialTheme.typography.labelMedium)
        if (manageable) {
            Text("⋯", color = GoldLt, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(start = 10.dp).clickable(onClick = onManage))
        }
    }
}

@Composable
private fun JoinRequestRow(request: GuildJoinRequestDto, busy: Boolean, onOpenProfile: () -> Unit, onAccept: () -> Unit, onDecline: () -> Unit) {
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        AvatarView(avatarUrl = request.user.avatarUrl, frameId = request.user.frameId, size = 40.dp, onClick = onOpenProfile)
        Column(modifier = Modifier.weight(1f).padding(start = 10.dp)) {
            Text(request.user.displayName, color = Color.White, style = MaterialTheme.typography.bodyMedium)
            CurrencyAmount(kind = CurrencyIconKind.TROPHY, text = request.user.trophies.toString(), prefix = "${request.user.tag} · ", color = Ink2, style = MaterialTheme.typography.labelSmall)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(modifier = Modifier.clickable(enabled = !busy, onClick = onDecline).background(Color(0x33E85D73), RoundedCornerShape(8.dp)).size(36.dp), contentAlignment = Alignment.Center) { Text("✕", color = Color(0xFFFF8398)) }
            Box(modifier = Modifier.clickable(enabled = !busy, onClick = onAccept).background(Color(0x335FD48A), RoundedCornerShape(8.dp)).size(36.dp), contentAlignment = Alignment.Center) { Text("✓", color = Green) }
        }
    }
}

@Composable
private fun BrowseGuildRow(card: GuildCardDto, isMine: Boolean, busy: Boolean, onJoin: () -> Unit) {
    val crest = resolveGuildCrest(card.crestKey, card.id)
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        AsyncImage(model = crest.src, contentDescription = null, modifier = Modifier.size(44.dp))
        Column(modifier = Modifier.weight(1f).padding(start = 12.dp)) {
            Row { Text(card.name, color = Color.White, style = MaterialTheme.typography.bodyMedium); Text(" ${card.tag}", color = Ink2, style = MaterialTheme.typography.labelSmall) }
            Text("${card.memberCount} members · ${card.weeklyPoints} pts", color = Ink2, style = MaterialTheme.typography.labelSmall)
        }
        Text(
            if (isMine) "Your Guild" else if (card.minTrophies <= 0) "Join" else "Request",
            color = if (isMine) Ink2 else GoldLt,
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier
                .background(if (isMine) Color.Black.copy(alpha = 0.3f) else Gold.copy(alpha = 0.14f), RoundedCornerShape(8.dp))
                .clickable(enabled = !isMine && !busy, onClick = onJoin)
                .padding(horizontal = 14.dp, vertical = 9.dp)
        )
    }
}

@Composable
private fun ManageMemberDialog(member: GuildMemberDto, isLeader: Boolean, busy: Boolean, onClose: () -> Unit, onChangeRole: (String) -> Unit, onKick: () -> Unit) {
    Dialog(onDismissRequest = { if (!busy) onClose() }) {
        Column(modifier = Modifier.fillMaxWidth().background(Panel, RoundedCornerShape(18.dp)).padding(22.dp)) {
            Text(member.user.displayName, color = GoldLt, style = MaterialTheme.typography.headlineSmall)
            Text("Current role: ${member.role}", color = Ink2, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 4.dp, bottom = 16.dp))
            if (isLeader) {
                listOf("OFFICER", "MEMBER").forEach { role ->
                    val on = member.role == role
                    Row(
                        modifier = Modifier.fillMaxWidth().clickable(enabled = !on) { onChangeRole(role) }
                            .background(if (on) Gold.copy(alpha = 0.12f) else Color.Black.copy(alpha = 0.25f), RoundedCornerShape(10.dp))
                            .padding(12.dp).padding(bottom = if (role == "OFFICER") 9.dp else 0.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(role, color = Color.White, style = MaterialTheme.typography.bodyMedium)
                        if (on) Text("✓", color = Green)
                    }
                }
                Box(modifier = Modifier.padding(vertical = 16.dp).fillMaxWidth().height(1.dp).background(Gold.copy(alpha = 0.14f)))
            }
            Box(
                modifier = Modifier.fillMaxWidth().clickable(enabled = !busy, onClick = onKick)
                    .background(Color(0x33E85D73), RoundedCornerShape(10.dp)).padding(vertical = 12.dp),
                contentAlignment = Alignment.Center
            ) { Text("Kick from Guild", color = Color(0xFFFF8398), style = MaterialTheme.typography.labelLarge) }
        }
    }
}

@Composable
private fun GuildChatDrawer(guildId: String, guildName: String, crestKey: String?, onClose: () -> Unit) {
    val state by GuildChatRepository.state.collectAsState()
    val scope = rememberCoroutineScope()
    var draft by remember { mutableStateOf("") }
    val me = AuthRepository.state.collectAsState().value.user

    LaunchedEffect(guildId) {
        GuildChatRepository.open(guildId)
    }

    Dialog(onDismissRequest = onClose) {
        Column(modifier = Modifier.fillMaxWidth().height(560.dp).background(Panel, RoundedCornerShape(18.dp))) {
            Row(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(guildName, color = GoldLt, style = MaterialTheme.typography.titleMedium)
                    Text("● Guild chat", color = Green, style = MaterialTheme.typography.labelSmall)
                }
                Text("✕", color = Ink, style = MaterialTheme.typography.titleMedium, modifier = Modifier.clickable(onClick = onClose))
            }
            Box(modifier = Modifier.weight(1f).padding(horizontal = 16.dp)) {
                when {
                    state.loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Gold) }
                    state.messages.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text("No messages yet.\nSay hello to your guild 👋", color = Ink2, style = MaterialTheme.typography.bodyMedium, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                    }
                    else -> Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
                        state.messages.forEach { m ->
                            val mine = m.author.id == me?.id
                            Row(modifier = Modifier.fillMaxWidth().padding(vertical = 5.dp), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
                                Column(horizontalAlignment = if (mine) Alignment.End else Alignment.Start) {
                                    if (!mine) Text(m.author.displayName, color = ROLE_COLOR[m.role] ?: Ink2, style = MaterialTheme.typography.labelSmall)
                                    Box(
                                        modifier = Modifier
                                            .background(if (mine) Gold else Color.White.copy(alpha = 0.06f), RoundedCornerShape(12.dp))
                                            .padding(horizontal = 12.dp, vertical = 8.dp)
                                    ) {
                                        Text(m.body, color = if (mine) Color(0xFF2A1607) else Color(0xFFEFE7FB), style = MaterialTheme.typography.bodySmall)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Row(modifier = Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = draft, onValueChange = { draft = it },
                    placeholder = { Text("Message your guild…", color = Ink2.copy(alpha = 0.6f)) },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Color.White, unfocusedTextColor = Color.White,
                        focusedBorderColor = Gold, unfocusedBorderColor = Gold.copy(alpha = 0.25f),
                        focusedContainerColor = Color.Black.copy(alpha = 0.3f), unfocusedContainerColor = Color.Black.copy(alpha = 0.3f),
                        cursorColor = Gold
                    )
                )
                Box(
                    modifier = Modifier.padding(start = 8.dp).clickable(enabled = draft.isNotBlank() && !state.sending) {
                        val body = draft.trim(); draft = ""
                        scope.launch { GuildChatRepository.send(guildId, body) }
                    }.background(Gold, RoundedCornerShape(10.dp)).padding(horizontal = 16.dp, vertical = 14.dp)
                ) { Text("Send", color = Color(0xFF2A1607), style = MaterialTheme.typography.labelMedium) }
            }
        }
    }

    androidx.compose.runtime.DisposableEffect(guildId) {
        onDispose { GuildChatRepository.close() }
    }
}

@Composable
private fun GuildCreateDialog(onClose: () -> Unit, onCreated: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var crest by remember { mutableStateOf(GUILD_CREST_KEYS.first()) }
    var name by remember { mutableStateOf("") }
    var tag by remember { mutableStateOf("") }
    var desc by remember { mutableStateOf("") }
    var policy by remember { mutableStateOf("open") }
    var minTrophies by remember { mutableStateOf(0f) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val ready = name.trim().length >= 3 && tag.trim().length >= 2

    Dialog(onDismissRequest = { if (!busy) onClose() }) {
        Column(modifier = Modifier.fillMaxWidth().background(Panel, RoundedCornerShape(18.dp)).padding(22.dp).verticalScroll(rememberScrollState())) {
            Text("Create a Guild", color = GoldLt, style = MaterialTheme.typography.headlineSmall)
            CrestPicker(selected = crest, onSelect = { crest = it })
            LabeledField("GUILD NAME") {
                OutlinedTextField(value = name, onValueChange = { if (it.length <= 24) name = it }, singleLine = true, modifier = Modifier.fillMaxWidth(), colors = fieldColors())
            }
            LabeledField("TAG (2-4 LETTERS)") {
                OutlinedTextField(value = tag, onValueChange = { if (it.length <= 5) tag = it.uppercase() }, singleLine = true, colors = fieldColors())
            }
            LabeledField("DESCRIPTION") {
                OutlinedTextField(value = desc, onValueChange = { if (it.length <= 140) desc = it }, modifier = Modifier.fillMaxWidth(), minLines = 2, colors = fieldColors())
            }
            LabeledField("MINIMUM TROPHIES TO JOIN") {
                Slider(value = minTrophies, onValueChange = { minTrophies = it }, valueRange = 0f..5000f, steps = 49, colors = SliderDefaults.colors(thumbColor = Gold, activeTrackColor = Gold))
                CurrencyAmount(kind = CurrencyIconKind.TROPHY, text = minTrophies.toInt().toString(), color = GoldLt, style = MaterialTheme.typography.labelMedium)
            }
            LabeledField("JOIN POLICY") {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("open" to "Open", "request" to "Request", "invite" to "Invite Only").forEach { (key, label) ->
                        val on = policy == key
                        Box(
                            modifier = Modifier.weight(1f).clickable { policy = key }
                                .background(if (on) Gold.copy(alpha = 0.16f) else Color.Black.copy(alpha = 0.3f), RoundedCornerShape(9.dp))
                                .padding(vertical = 10.dp),
                            contentAlignment = Alignment.Center
                        ) { Text(label, color = if (on) GoldLt else Ink, style = MaterialTheme.typography.labelSmall) }
                    }
                }
            }
            if (error != null) Text(error!!, color = Color(0xFFFF8FAE), style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 8.dp))
            Box(modifier = Modifier.padding(top = 18.dp)) {
                val onCreateClick: () -> Unit = {
                    if (ready && !busy) {
                        busy = true
                        scope.launch {
                            when (val res = GuildsRepository.create(name.trim(), tag.trim(), crest, minTrophies.toInt(), policy, desc.trim().ifEmpty { null })) {
                                is SocialResult.Success -> {
                                    onCreated(res.data.guild.id)
                                    onClose()
                                }
                                is SocialResult.Failure -> error = res.message
                            }
                            busy = false
                        }
                    }
                }
                com.filipinodama.app.ui.screens.game.GameButton(
                    text = if (ready) "Found Guild" else "Name & tag required",
                    onClick = onCreateClick,
                    enabled = ready && !busy
                )
            }
        }
    }
}

@Composable
private fun GuildEditDialog(detail: GuildDetailResponse, onClose: () -> Unit, onSaved: () -> Unit) {
    val scope = rememberCoroutineScope()
    val g = detail.guild
    var crest by remember { mutableStateOf(resolveGuildCrest(g.crestKey, g.id).key) }
    var name by remember { mutableStateOf(g.name) }
    var desc by remember { mutableStateOf(g.description ?: "") }
    var policy by remember { mutableStateOf(g.joinPolicy) }
    var minTrophies by remember { mutableStateOf(g.minTrophies.toFloat()) }
    var busy by remember { mutableStateOf(false) }

    Dialog(onDismissRequest = { if (!busy) onClose() }) {
        Column(modifier = Modifier.fillMaxWidth().background(Panel, RoundedCornerShape(18.dp)).padding(22.dp).verticalScroll(rememberScrollState())) {
            Text("Edit Guild", color = GoldLt, style = MaterialTheme.typography.headlineSmall)
            CrestPicker(selected = crest, onSelect = { crest = it })
            LabeledField("GUILD NAME") {
                OutlinedTextField(value = name, onValueChange = { if (it.length <= 24) name = it }, singleLine = true, modifier = Modifier.fillMaxWidth(), colors = fieldColors())
            }
            LabeledField("DESCRIPTION") {
                OutlinedTextField(value = desc, onValueChange = { if (it.length <= 160) desc = it }, modifier = Modifier.fillMaxWidth(), minLines = 3, colors = fieldColors())
            }
            LabeledField("MINIMUM TROPHIES TO JOIN") {
                Slider(value = minTrophies, onValueChange = { minTrophies = it }, valueRange = 0f..5000f, steps = 49, colors = SliderDefaults.colors(thumbColor = Gold, activeTrackColor = Gold))
                CurrencyAmount(kind = CurrencyIconKind.TROPHY, text = minTrophies.toInt().toString(), color = GoldLt, style = MaterialTheme.typography.labelMedium)
            }
            LabeledField("JOIN POLICY") {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("open" to "Open", "request" to "Request", "invite" to "Invite Only").forEach { (key, label) ->
                        val on = policy == key
                        Box(
                            modifier = Modifier.weight(1f).clickable { policy = key }
                                .background(if (on) Gold.copy(alpha = 0.16f) else Color.Black.copy(alpha = 0.3f), RoundedCornerShape(9.dp))
                                .padding(vertical = 10.dp),
                            contentAlignment = Alignment.Center
                        ) { Text(label, color = if (on) GoldLt else Ink, style = MaterialTheme.typography.labelSmall) }
                    }
                }
            }
            Box(modifier = Modifier.padding(top = 18.dp)) {
                val onSaveClick: () -> Unit = {
                    if (!busy && name.trim().length >= 3) {
                        busy = true
                        scope.launch {
                            GuildsRepository.update(g.id, name.trim(), desc.trim(), minTrophies.toInt(), crest, policy)
                            busy = false
                            onSaved()
                        }
                    }
                }
                com.filipinodama.app.ui.screens.game.GameButton(
                    text = "Save Changes",
                    onClick = onSaveClick,
                    enabled = !busy && name.trim().length >= 3
                )
            }
        }
    }
}

@Composable
private fun CrestPicker(selected: String, onSelect: (String) -> Unit) {
    Column(modifier = Modifier.padding(vertical = 14.dp)) {
        Text("GUILD CREST", color = Ink2, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(bottom = 8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            GUILD_CREST_KEYS.forEach { key ->
                val crest = resolveGuildCrest(key)
                val on = key == selected
                Box(
                    modifier = Modifier.size(48.dp).clickable { onSelect(key) }
                        .background(if (on) Gold.copy(alpha = 0.16f) else Color.Black.copy(alpha = 0.3f), RoundedCornerShape(10.dp))
                        .padding(4.dp),
                    contentAlignment = Alignment.Center
                ) {
                    AsyncImage(model = crest.src, contentDescription = crest.name, modifier = Modifier.fillMaxSize())
                }
            }
        }
    }
}

@Composable
private fun LabeledField(label: String, content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().padding(bottom = 14.dp)) {
        Text(label, color = Ink2, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(bottom = 7.dp))
        content()
    }
}

@Composable
private fun fieldColors() = OutlinedTextFieldDefaults.colors(
    focusedTextColor = Color.White, unfocusedTextColor = Color.White,
    focusedBorderColor = Gold, unfocusedBorderColor = Gold.copy(alpha = 0.25f),
    focusedContainerColor = Color.Black.copy(alpha = 0.3f), unfocusedContainerColor = Color.Black.copy(alpha = 0.3f),
    cursorColor = Gold
)
