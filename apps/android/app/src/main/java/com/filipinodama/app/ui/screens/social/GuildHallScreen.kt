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
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.draw.clip
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
import com.filipinodama.app.data.social.WarStatusResponse
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
fun GuildHallScreen(
    onOpenProfile: (String) -> Unit,
    onOpenDiscover: () -> Unit = {},
    onPlayRanked: () -> Unit = {},
    // Anonymous users browse the Guild Hall freely (owner directive: "guild
    // page should not be gated. If they want to join a guild that's the time
    // they will be asked to login"). Acting — Create a guild or Discover→Join —
    // routes here to prompt sign-in instead of failing silently.
    onRequireSignIn: () -> Unit = {}
) {
    val me = AuthRepository.state.collectAsState().value.user
    val scope = rememberCoroutineScope()

    var membershipChecked by remember { mutableStateOf(false) }
    var myGuildId by remember { mutableStateOf<String?>(null) }
    var detail by remember { mutableStateOf<GuildDetailResponse?>(null) }
    var requests by remember { mutableStateOf<List<GuildJoinRequestDto>?>(null) }
    var busy by remember { mutableStateOf(false) }
    var createOpen by remember { mutableStateOf(false) }
    var editOpen by remember { mutableStateOf(false) }
    var manageMember by remember { mutableStateOf<GuildMemberDto?>(null) }
    var tab by remember { mutableStateOf("roster") }

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
            }
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

        // NOTE: anonymous users (me == null) are NOT stopped here anymore — they
        // fall through to the browsable "not in a guild yet" state below and can
        // open Discover Guilds. Sign-in is prompted only when they try to
        // Create or Join (owner directive). `inGuild` is false when me == null,
        // and `membershipChecked` is set true synchronously by loadMembership().

        if (inGuild && detail != null && me != null) {
            // `me` is guaranteed non-null in this branch (membership implies a
            // signed-in user), but the compiler can't prove it now that the
            // anonymous early-return is gone — bind a non-null local for the
            // handful of me.id reads below.
            val meUser = me
            val g = detail!!.guild
            val crest = resolveGuildCrest(g.crestKey, g.id)
            val level = (g.weeklyPoints.coerceAtLeast(0) / 1000) + 1

            // Mockup guild banner (mobile-split.txt lines 1722-1766): bg art
            // (real me-banner.png handoff asset at .32 opacity under a purple
            // gradient), crest, Cinzel name, "#TAG · N members", weekly-pts
            // pill (mockup shows a season-rank pill — a computed global guild
            // rank isn't in the detail payload, so the pill carries the REAL
            // weeklyPoints instead of a fabricated rank), description +
            // min-trophies pill, and the guild level bar driven by the real
            // weeklyPoints (level = pts/1000+1, same derivation as before).
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
                    .background(Color(0xFF140C26), RoundedCornerShape(22.dp))
                    .border(1.dp, Color(0x4DE8B84B), RoundedCornerShape(22.dp))
            ) {
                androidx.compose.foundation.Image(
                    painter = androidx.compose.ui.res.painterResource(com.filipinodama.app.R.drawable.me_banner),
                    contentDescription = null,
                    modifier = Modifier.matchParentSize().clip(RoundedCornerShape(22.dp)),
                    contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                    alpha = 0.32f
                )
                Box(
                    modifier = Modifier
                        .matchParentSize()
                        .background(
                            androidx.compose.ui.graphics.Brush.linearGradient(
                                listOf(Color(0xB33A1C4A), Color(0xF0140C26))
                            ),
                            RoundedCornerShape(22.dp)
                        )
                )
                Column(modifier = Modifier.padding(18.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        AsyncImage(model = crest.src, contentDescription = null, modifier = Modifier.size(64.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(g.name, color = Color(0xFFF4ECD6), style = MaterialTheme.typography.headlineSmall)
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 4.dp)) {
                                Text(g.tag, color = Color(0xFFC9A4FF), style = MaterialTheme.typography.labelSmall)
                                Box(Modifier.size(3.dp).background(Color(0xFF6F5F92), CircleShape))
                                Text("${g.memberCount} members", color = Color(0xFF9A8BBF), style = MaterialTheme.typography.labelSmall)
                            }
                            Row(
                                modifier = Modifier
                                    .padding(top = 8.dp)
                                    .background(Color(0x24F0CF72), RoundedCornerShape(100.dp))
                                    .border(1.dp, Color(0x4DF0CF72), RoundedCornerShape(100.dp))
                                    .padding(horizontal = 10.dp, vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(5.dp)
                            ) {
                                com.filipinodama.app.ui.components.CurrencyIcon(kind = CurrencyIconKind.TROPHY, size = 13.dp)
                                Text("${g.weeklyPoints} pts", color = Color(0xFFF0CF72), style = MaterialTheme.typography.labelSmall)
                                Text("this week", color = Color(0xFFB79A5E), style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                    if (!g.description.isNullOrBlank() || g.minTrophies > 0) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 12.dp)) {
                            Text(
                                g.description ?: "",
                                color = Color(0xFFB9A9DB),
                                style = MaterialTheme.typography.bodySmall,
                                modifier = Modifier.weight(1f)
                            )
                            if (g.minTrophies > 0) {
                                Row(
                                    modifier = Modifier
                                        .background(Color(0x1F5A96FF), RoundedCornerShape(100.dp))
                                        .border(1.dp, Color(0x425A96FF), RoundedCornerShape(100.dp))
                                        .padding(horizontal = 9.dp, vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    com.filipinodama.app.ui.components.CurrencyIcon(kind = CurrencyIconKind.TROPHY, size = 11.dp)
                                    Text("${g.minTrophies}+", color = Color(0xFFA9C4FF), style = MaterialTheme.typography.labelSmall)
                                }
                            }
                        }
                    }
                    // Guild level bar.
                    val cur = g.weeklyPoints.coerceAtLeast(0) % 1000
                    Row(modifier = Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 6.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("GUILD LVL $level", color = Color(0xFFC9A4FF), style = MaterialTheme.typography.labelSmall)
                        Text("$cur / 1000 XP", color = Color(0xFF8B7CAE), style = MaterialTheme.typography.labelSmall)
                    }
                    Box(modifier = Modifier.fillMaxWidth().height(7.dp).background(Color.Black.copy(alpha = 0.45f), RoundedCornerShape(4.dp))) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth((cur / 1000f).coerceIn(0.02f, 1f))
                                .height(7.dp)
                                .background(
                                    androidx.compose.ui.graphics.Brush.horizontalGradient(listOf(Color(0xFFEFC25A), Color(0xFFC9971F))),
                                    RoundedCornerShape(4.dp)
                                )
                        )
                    }
                    Row(modifier = Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (canManage) ActionChip("✦ Edit", modifier = Modifier.weight(1f)) { editOpen = true }
                        ActionChip("Leave Guild", modifier = Modifier.weight(1f)) {
                            if (!busy) {
                                busy = true
                                scope.launch {
                                    GuildsRepository.removeMember(g.id, meUser.id)
                                    myGuildId = null
                                    detail = null
                                    requests = null
                                    busy = false
                                }
                            }
                        }
                    }
                }
            }

            // Tab switcher — mockup pill row (Roster / Chat; Wars honestly
            // omitted, see the class kdoc's no-backend proof).
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp)
                    .background(Color(0x990F0720), RoundedCornerShape(14.dp))
                    .border(1.dp, Color(0x1FE8B84B), RoundedCornerShape(14.dp))
                    .padding(4.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                GuildTabPill("Roster", tab == "roster", Modifier.weight(1f)) { tab = "roster" }
                GuildTabPill("Wars", tab == "wars", Modifier.weight(1f)) { tab = "wars" }
                GuildTabPill("Chat", tab == "chat", Modifier.weight(1f)) { tab = "chat" }
            }

            when (tab) {
                "chat" -> GuildChatPanel(guildId = g.id, guildName = g.name)
                "wars" -> GuildWarsTab(myGuildId = g.id, onPlayRanked = onPlayRanked)
                else -> SectionCard(title = "Members · ${g.memberCount}") {
                    detail!!.roster.sortedByDescending { it.weeklyContribution }.forEach { m ->
                        RosterRow(
                            member = m,
                            mine = m.userId == meUser.id,
                            manageable = canManage && m.userId != meUser.id && (GUILD_ROLE_RANK[myRole] ?: 0) > (GUILD_ROLE_RANK[m.role] ?: 0),
                            onOpenProfile = { onOpenProfile(m.userId) },
                            onManage = { manageMember = m }
                        )
                    }
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
            val anon = me == null
            SectionCard(title = "") {
                Text(
                    if (anon) "Join an alliance" else "You are not in a guild yet",
                    color = GoldLt,
                    style = MaterialTheme.typography.titleLarge
                )
                Text(
                    "Guilds are alliances of players who war together, share perks, and climb the ranks as one. Discover active guilds to find your people, or found your own.",
                    color = Ink2,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(top = 8.dp)
                )
                Row(modifier = Modifier.padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    // Discover is browsable by anyone; the sign-in prompt happens
                    // at the actual Join inside DiscoverGuildsScreen.
                    ActionChip("✦ Discover Guilds", modifier = Modifier.weight(1f), onClick = onOpenDiscover)
                    // Creating a guild requires an account — prompt sign-in for
                    // an anonymous user instead of opening the create dialog.
                    ActionChip("＋ Create Guild", modifier = Modifier.weight(1f)) {
                        if (anon) onRequireSignIn() else createOpen = true
                    }
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
private val ROLE_BG: Map<String, Color> = mapOf(
    "LEADER" to Color(0x29E8B84B),
    "OFFICER" to Color(0x29C9A4FF),
    "MEMBER" to Color(0x14FFFFFF)
)

@Composable
private fun GuildTabPill(label: String, selected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier = modifier
            .clickable(onClick = onClick)
            .background(
                if (selected) androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Color(0xFFEFC25A), Color(0xFFC9971F)))
                else androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Color.Transparent, Color.Transparent)),
                RoundedCornerShape(11.dp)
            )
            .padding(vertical = 10.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(label, color = if (selected) Color(0xFF2A1608) else Color(0xFF9A8BBF), style = MaterialTheme.typography.labelMedium)
    }
}

/**
 * Roster row — mockup guildRoster row (mobile-split.txt lines 1777-1803):
 * 44dp rounded-square avatar with a bottom-right presence dot (REAL
 * member.user.presence, a server field the previous row ignored), name +
 * role badge pill, tier crest + tier label (REAL trophies/rankTier fields,
 * also previously ignored), trophy count in gold mono.
 */
/**
 * Wars tab — weekly Guild War (contribution ladder). Shows your guild's real
 * war rank + points + countdown, the top standings with gold reward tiers, your
 * personal contribution, and a Play-Ranked CTA (ranked wins earn war points).
 * All from GET /api/guilds/war (GuildsRepository.war()).
 */
@Composable
private fun GuildWarsTab(myGuildId: String, onPlayRanked: () -> Unit) {
    var war by remember { mutableStateOf<WarStatusResponse?>(null) }
    var loading by remember { mutableStateOf(true) }
    LaunchedEffect(Unit) {
        when (val r = GuildsRepository.war()) {
            is SocialResult.Success -> war = r.data
            is SocialResult.Failure -> war = null
        }
        loading = false
    }

    if (loading) {
        Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Gold) }
        return
    }
    val w = war
    if (w == null) {
        SectionCard(title = "Guild War") {
            Text("Couldn't load the war right now.", color = Ink2, style = MaterialTheme.typography.bodyMedium)
        }
        return
    }

    // War-in-progress card: rank + points + countdown + Play Ranked.
    SectionCard(title = "Weekly Guild War · Week ${w.week}") {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    if (w.myGuild != null) "#${w.myGuild.rank}" else "—",
                    color = Color.White,
                    style = MaterialTheme.typography.headlineMedium
                )
                Text("war rank", color = Ink2, style = MaterialTheme.typography.labelSmall)
            }
            Column(horizontalAlignment = Alignment.End) {
                Text("${w.myGuild?.points ?: 0} pts", color = GoldLt, style = MaterialTheme.typography.titleMedium)
                Text(warCountdownLabel(w.endsAt), color = Ink2, style = MaterialTheme.typography.labelSmall)
            }
        }
        Box(Modifier.height(12.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = onPlayRanked)
                .background(androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Color(0xFFEFC25A), Color(0xFFC9971F))), RoundedCornerShape(12.dp))
                .padding(vertical = 13.dp),
            contentAlignment = Alignment.Center
        ) {
            Text("⚔ Play Ranked", color = Color(0xFF2A1608), style = MaterialTheme.typography.labelLarge)
        }
        if (w.topN > 0) {
            Text(
                "Top ${w.topN} guilds earn gold at reset — split among contributors.",
                color = Ink2,
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.padding(top = 10.dp)
            )
        }
    }

    // Standings.
    SectionCard(title = "Standings") {
        if (w.standings.isEmpty()) {
            Text("No war points scored yet this week — be the first.", color = Ink2, style = MaterialTheme.typography.bodyMedium)
        } else {
            w.standings.take(10).forEach { s ->
                val mine = s.guildId == myGuildId
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 6.dp)
                        .background(if (mine) Color(0x1AE8B84B) else Color.Transparent, RoundedCornerShape(9.dp))
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Text("#${s.rank}", color = if (s.rank <= w.topN) GoldLt else Ink2, style = MaterialTheme.typography.titleSmall, modifier = Modifier.width(34.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(s.name, color = if (mine) GoldLt else Color.White, style = MaterialTheme.typography.bodyMedium, maxLines = 1)
                        Text(s.tag, color = Ink2, style = MaterialTheme.typography.labelSmall)
                    }
                    Text("${s.points}", color = Ink2, style = MaterialTheme.typography.labelMedium)
                    if (s.rewardGold > 0) {
                        Text("🪙 ${s.rewardGold}", color = Color(0xFFF0CF72), style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
        }
    }

    // Your contribution.
    SectionCard(title = "Your Contribution") {
        Text(
            "${w.myGuild?.myContribution ?: 0}",
            color = Color.White,
            style = MaterialTheme.typography.headlineSmall
        )
        Text("war points you've contributed this week", color = Ink2, style = MaterialTheme.typography.labelSmall)
    }

    // War log (last settled week).
    if (w.lastWeek.isNotEmpty()) {
        SectionCard(title = "War Log · last week") {
            w.lastWeek.take(5).forEach { e ->
                Row(modifier = Modifier.fillMaxWidth().padding(vertical = 5.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("#${e.rank}", color = GoldLt, style = MaterialTheme.typography.titleSmall, modifier = Modifier.width(34.dp))
                    Text("${e.guildName} ${e.guildTag}", color = Color.White, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f), maxLines = 1)
                    if (e.rewardGold > 0) Text("🪙 ${e.rewardGold}", color = Color(0xFFF0CF72), style = MaterialTheme.typography.labelMedium)
                }
            }
        }
    }
}

/** "Resets in 3d 4h" / "2h 15m" from the war end ISO timestamp. */
private fun warCountdownLabel(endsAtIso: String): String {
    return try {
        val ms = java.time.Instant.parse(endsAtIso).toEpochMilli() - System.currentTimeMillis()
        if (ms <= 0) return "Resetting…"
        val d = ms / 86_400_000
        val h = (ms % 86_400_000) / 3_600_000
        val m = (ms % 3_600_000) / 60_000
        when {
            d > 0 -> "Resets in ${d}d ${h}h"
            h > 0 -> "Resets in ${h}h ${m}m"
            else -> "Resets in ${m}m"
        }
    } catch (e: Exception) {
        "—"
    }
}

@Composable
private fun RosterRow(member: GuildMemberDto, mine: Boolean, manageable: Boolean, onOpenProfile: () -> Unit, onManage: () -> Unit) {
    val tier = com.filipinodama.app.data.engine.RankTiers.forTrophies(member.user.trophies)
    val online = member.user.presence == "online"
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp).clickable(onClick = onOpenProfile),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Box {
            AvatarView(avatarUrl = member.user.avatarUrl, frameId = member.user.frameId, size = 44.dp, ring = false)
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .size(11.dp)
                    .background(if (online) Green else Color(0xFF5A4E77), CircleShape)
                    .border(2.dp, Color(0xFF1E1134), CircleShape)
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                Text(
                    member.user.displayName + if (mine) " (You)" else "",
                    color = Color(0xFFE6DCF5),
                    style = MaterialTheme.typography.titleSmall,
                    maxLines = 1
                )
                Box(
                    modifier = Modifier
                        .background(ROLE_BG[member.role] ?: Color(0x14FFFFFF), RoundedCornerShape(100.dp))
                        .padding(horizontal = 8.dp, vertical = 2.dp)
                ) {
                    Text(member.role, color = ROLE_COLOR[member.role] ?: Ink, style = MaterialTheme.typography.labelSmall)
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp), modifier = Modifier.padding(top = 4.dp)) {
                androidx.compose.foundation.Image(
                    painter = androidx.compose.ui.res.painterResource(com.filipinodama.app.data.engine.RankTiers.drawableFor(tier.img)),
                    contentDescription = null,
                    modifier = Modifier.size(14.dp)
                )
                Text(tier.label, color = Color(0xFF9A8BBF), style = MaterialTheme.typography.labelSmall)
            }
        }
        CurrencyAmount(kind = CurrencyIconKind.TROPHY, text = member.user.trophies.toString(), color = Color(0xFFF0CF72), style = MaterialTheme.typography.labelMedium)
        if (manageable) {
            Text("⋯", color = GoldLt, style = MaterialTheme.typography.titleMedium, modifier = Modifier.clickable(onClick = onManage))
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

/**
 * Browse-guild row — mockup SCREEN 17 `browseGuilds` row (Mobile.dc.html
 * lines 1531-1539): emblem, name, tag, level badge, members/pts, Join button.
 * The whole row is tappable (`g.open` in the mockup) to open the Guild
 * Preview sheet — the owner-reported bug was that only the Join button had a
 * click handler here, so [onOpenPreview] wires the row tap while the Join
 * pill keeps its own separate tap target (nested clickables don't bubble in
 * Compose, so tapping Join does not also fire the row's preview open).
 */
@Composable
fun BrowseGuildRow(card: GuildCardDto, isMine: Boolean, busy: Boolean, onOpenPreview: () -> Unit, onJoin: () -> Unit) {
    val crest = resolveGuildCrest(card.crestKey, card.id)
    val level = (card.weeklyPoints.coerceAtLeast(0) / 1000) + 1
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Color(0xCC1B1030), RoundedCornerShape(16.dp))
            .border(1.dp, Color(0x1FE8B84B), RoundedCornerShape(16.dp))
            .clickable(onClick = onOpenPreview)
            .padding(13.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        AsyncImage(model = crest.src, contentDescription = null, modifier = Modifier.size(46.dp))
        Column(modifier = Modifier.weight(1f).padding(start = 13.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                Text(card.name, color = Color(0xFFF4ECD6), style = MaterialTheme.typography.bodyMedium)
                Text(card.tag, color = Ink2, style = MaterialTheme.typography.labelSmall)
                Box(
                    modifier = Modifier
                        .background(Color(0x0FE8B84B), RoundedCornerShape(100.dp))
                        .border(1.dp, Color(0x38E8B84B), RoundedCornerShape(100.dp))
                        .padding(horizontal = 7.dp, vertical = 2.dp)
                ) {
                    Text("Lv $level", color = Color(0xFFF0CF72), style = MaterialTheme.typography.labelSmall)
                }
            }
            Text("${card.memberCount} members · ${card.weeklyPoints} pts", color = Ink2, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 3.dp))
        }
        Text(
            // Approval is universal (owner policy): non-invite guilds are always
            // "Request", never an instant "Join".
            if (isMine) "Your Guild" else if (card.joinPolicy == "invite") "Members only" else "Request",
            color = if (isMine) Ink2 else Color(0xFF2A1608),
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier
                .background(
                    if (isMine) androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.3f), Color.Black.copy(alpha = 0.3f)))
                    else androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Color(0xFFEFC25A), Color(0xFFC9971F))),
                    RoundedCornerShape(9.dp)
                )
                .clickable(enabled = !isMine && !busy && card.joinPolicy != "invite", onClick = onJoin)
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

/**
 * Guild chat — the mockup's CHAT TAB (mobile-split.txt lines 1806-1830),
 * inline in the Guild screen (previously a Dialog drawer behind a "💬 Guild
 * Chat" chip — the mockup specifies a tab, not a drawer). Bubbles: sender
 * avatar (34dp, rounded square), role-colored name, tinted bubble,
 * timestamp; own messages right-aligned with the gold bubble. Composer is
 * the mockup's pill input + round gold ➤ send button. Real socket chat via
 * [GuildChatRepository], unchanged.
 */
@Composable
private fun GuildChatPanel(guildId: String, guildName: String) {
    val state by GuildChatRepository.state.collectAsState()
    val scope = rememberCoroutineScope()
    var draft by remember { mutableStateOf("") }
    val me = AuthRepository.state.collectAsState().value.user

    LaunchedEffect(guildId) {
        GuildChatRepository.open(guildId)
    }
    androidx.compose.runtime.DisposableEffect(guildId) {
        onDispose { GuildChatRepository.close() }
    }

    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        when {
            state.loading -> Box(Modifier.fillMaxWidth().padding(vertical = 30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Gold) }
            state.messages.isEmpty() -> Box(Modifier.fillMaxWidth().padding(vertical = 30.dp), contentAlignment = Alignment.Center) {
                Text("No messages yet.\nSay hello to your guild 👋", color = Ink2, style = MaterialTheme.typography.bodyMedium, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            }
            else -> Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                state.messages.forEach { m ->
                    val mine = m.author.id == me?.id
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start,
                        verticalAlignment = Alignment.Bottom
                    ) {
                        if (!mine) {
                            Box(modifier = Modifier.padding(end = 10.dp).clip(RoundedCornerShape(10.dp))) {
                                AvatarView(avatarUrl = m.author.avatarUrl, size = 34.dp, ring = false)
                            }
                        }
                        Column(horizontalAlignment = if (mine) Alignment.End else Alignment.Start, modifier = Modifier.fillMaxWidth(0.74f)) {
                            Text(
                                if (mine) "You" else m.author.displayName,
                                color = ROLE_COLOR[m.role] ?: Ink2,
                                style = MaterialTheme.typography.labelSmall,
                                modifier = Modifier.padding(bottom = 4.dp, start = 2.dp, end = 2.dp)
                            )
                            Box(
                                modifier = Modifier
                                    .background(
                                        if (mine) androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Color(0xFFEFC25A), Color(0xFFC9971F)))
                                        else androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Color(0xE61B1030), Color(0xE61B1030))),
                                        RoundedCornerShape(14.dp)
                                    )
                                    .padding(horizontal = 13.dp, vertical = 10.dp)
                            ) {
                                Text(m.body, color = if (mine) Color(0xFF2A1608) else Color(0xFFEFE7FB), style = MaterialTheme.typography.bodySmall)
                            }
                        }
                        if (mine) {
                            Box(modifier = Modifier.padding(start = 10.dp).clip(RoundedCornerShape(10.dp))) {
                                AvatarView(avatarUrl = me?.avatarUrl, size = 34.dp, ring = false)
                            }
                        }
                    }
                }
            }
        }

        // Composer — mockup pill input + round gold send.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 14.dp, bottom = 16.dp)
                .background(Color(0xBF0F0720), RoundedCornerShape(100.dp))
                .border(1.dp, Color(0x29E8B84B), RoundedCornerShape(100.dp))
                .padding(start = 15.dp, end = 8.dp, top = 8.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(9.dp)
        ) {
            Box(modifier = Modifier.weight(1f)) {
                if (draft.isEmpty()) {
                    Text("Message $guildName…", color = Color(0xFF6F6091), style = MaterialTheme.typography.bodySmall)
                }
                androidx.compose.foundation.text.BasicTextField(
                    value = draft,
                    onValueChange = { draft = it },
                    singleLine = true,
                    textStyle = androidx.compose.ui.text.TextStyle(color = Color(0xFFEFE7FB), fontSize = MaterialTheme.typography.bodySmall.fontSize),
                    cursorBrush = androidx.compose.ui.graphics.SolidColor(Gold),
                    modifier = Modifier.fillMaxWidth()
                )
            }
            Box(
                modifier = Modifier
                    .size(38.dp)
                    .clickable(enabled = draft.isNotBlank() && !state.sending) {
                        val body = draft.trim(); draft = ""
                        scope.launch { GuildChatRepository.send(guildId, body) }
                    }
                    .background(
                        androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Color(0xFFEFC25A), Color(0xFFC9971F))),
                        CircleShape
                    ),
                contentAlignment = Alignment.Center
            ) { Text("➤", color = Color(0xFF2A1608), style = MaterialTheme.typography.labelLarge) }
        }
    }
}

@Composable
fun GuildCreateDialog(onClose: () -> Unit, onCreated: (String) -> Unit) {
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
