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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.social.GuildCardDto
import com.filipinodama.app.data.social.GuildDetailResponse
import com.filipinodama.app.data.social.GuildsRepository
import com.filipinodama.app.data.social.SocialResult
import com.filipinodama.app.data.social.resolveGuildCrest
import com.filipinodama.app.ui.components.CurrencyIcon
import com.filipinodama.app.ui.components.CurrencyIconKind
import com.filipinodama.app.ui.components.MockupBackButton
import com.filipinodama.app.ui.components.PullRefreshContainer
import com.filipinodama.app.ui.components.screenInsets
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink2
import kotlinx.coroutines.launch

/**
 * DiscoverGuildsScreen — mobile-screen-inventory.md SCREEN 17, `{{ isDiscover }}`
 * (Mobile.dc.html lines 1511-1544). Split out of GuildHallScreen's permanent
 * inline "Discover Guilds" SectionCard (SOC-1 finding — that section had no
 * own header/back-target, no search clear button, and the wrong empty-state
 * copy versus the mockup's dedicated screen).
 *
 * Also fixes SOC-2 (the owner's reported bug: "I can't view the guild
 * profile. Make it clickable"): each browse row (see [BrowseGuildRow] in
 * GuildHallScreen.kt, now shared) opens the [GuildPreviewSheet] bottom sheet
 * for that guild via a real `GET /api/guilds/:id` fetch.
 *
 * Real fields only: [GuildDetailDto] has no warRecord/region/language
 * columns (verified against GuildDtos.kt) — the mockup's War Record/Region/
 * Language tiles show an honest "—" instead of fabricating demo values.
 */
@Composable
fun DiscoverGuildsScreen(onBack: () -> Unit, onRequireSignIn: () -> Unit = {}) {
    val me = AuthRepository.state.collectAsStateWithLifecycle().value.user
    val hasRealAccount = isRealGuildAccount(me)
    val scope = rememberCoroutineScope()

    var query by remember { mutableStateOf("") }
    var browse by remember { mutableStateOf<List<GuildCardDto>?>(null) }
    var busy by remember { mutableStateOf(false) }
    var createOpen by remember { mutableStateOf(false) }
    var previewGuildId by remember { mutableStateOf<String?>(null) }
    // Review M2: surface a join failure instead of swallowing it silently.
    var toast by remember { mutableStateOf<String?>(null) }
    // Guilds this session has successfully requested to join — drives the
    // "Request Sent ✓" button state so a tap gives immediate feedback.
    var requestedIds by remember { mutableStateOf(setOf<String>()) }

    // True when the browse load failed — drives a distinct "couldn't load — retry"
    // state instead of the genuine-empty "be the first to found one" copy.
    var browseFailed by remember { mutableStateOf(false) }

    // Extracted as a suspend fun so pull-to-refresh can await it directly via
    // PullRefreshContainer's onRefresh (re-fetches with the current query).
    suspend fun loadBrowseData(q: String) {
        when (val r = GuildsRepository.browse(q)) {
            is SocialResult.Success -> { browse = r.data.guilds; browseFailed = false }
            is SocialResult.Failure -> { browse = emptyList(); browseFailed = true }
        }
    }

    fun loadBrowse(q: String) {
        scope.launch { loadBrowseData(q) }
    }

    LaunchedEffect(Unit) { loadBrowse("") }

    // Root Box so the modal overlays (create dialog, preview sheet) draw ON TOP
    // of the screen content. They MUST be emitted AFTER the main Column inside a
    // shared Box parent — otherwise the full-screen Column paints over them and
    // the sheet is invisible even though its state/data are correct.
    Box(modifier = Modifier.fillMaxSize()) {
    Column(modifier = Modifier.fillMaxSize().screenInsets().background(MaterialTheme.colorScheme.background)) {
        Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(top = 12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                MockupBackButton(onClick = onBack)
                Text(
                    "✦ Join an order ✦",
                    color = Color(0xFFC9A4FF),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold
                )
            }
            Text(
                "Discover Guilds",
                color = GoldLt,
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.padding(top = 6.dp, start = 4.dp)
            )
            Text(
                "Browse active guilds recruiting near your rank, or found your own.",
                color = Ink2,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = 6.dp, start = 4.dp, bottom = 16.dp)
            )

            // Search — mockup lines 1520-1526: pill input + conditional "×" clear.
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0x990F0820), RoundedCornerShape(14.dp))
                    .border(1.dp, Color(0x2EE8B84B), RoundedCornerShape(14.dp))
                    .padding(horizontal = 14.dp, vertical = 11.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text("⌕", color = Color(0xFF8B7CAE), style = MaterialTheme.typography.bodyMedium)
                Box(modifier = Modifier.weight(1f)) {
                    if (query.isEmpty()) {
                        Text("Search by name, tag, or region", color = Color(0xFF6F6091), style = MaterialTheme.typography.bodySmall)
                    }
                    androidx.compose.foundation.text.BasicTextField(
                        value = query,
                        onValueChange = { query = it; loadBrowse(it) },
                        singleLine = true,
                        textStyle = androidx.compose.ui.text.TextStyle(color = Color(0xFFF4ECD6), fontSize = MaterialTheme.typography.bodySmall.fontSize),
                        cursorBrush = androidx.compose.ui.graphics.SolidColor(Gold),
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                if (query.isNotEmpty()) {
                    // 48dp min touch target (the visible chip stays 20dp); labelled
                    // for screen readers.
                    Box(
                        modifier = Modifier
                            .size(48.dp)
                            .clickable { query = ""; loadBrowse("") }
                            .semantics { contentDescription = "Clear search" },
                        contentAlignment = Alignment.Center
                    ) {
                        Box(
                            modifier = Modifier.size(20.dp).background(Color(0x29C9A4FF), CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Text("×", color = Color(0xFFC9A4FF), style = MaterialTheme.typography.labelMedium)
                        }
                    }
                }
            }
        }

        // Pull down anywhere in the guild list to RE-FETCH the browse results from
        // the server (loadBrowseData with the current query — the same call the
        // entry LaunchedEffect runs), so a pull gets the latest, not a cosmetic
        // spinner.
        PullRefreshContainer(onRefresh = { loadBrowseData(query) }, modifier = Modifier.weight(1f)) {
        Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
            Spacer()
            when {
                browse == null -> Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Gold) }
                browseFailed && browse!!.isEmpty() -> Column(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 44.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text(
                        "Couldn't load guilds. Check your connection and try again.",
                        color = Ink2,
                        style = MaterialTheme.typography.bodyMedium,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center
                    )
                    Box(
                        modifier = Modifier
                            .clickable { loadBrowse(query) }
                            .background(Gold.copy(alpha = 0.16f), RoundedCornerShape(10.dp))
                            .padding(horizontal = 20.dp, vertical = 10.dp)
                    ) { Text("Retry", color = GoldLt, style = MaterialTheme.typography.labelLarge) }
                }
                browse!!.isEmpty() && query.isNotBlank() -> Text(
                    "No guilds match “$query”.",
                    color = Ink2,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.fillMaxWidth().padding(vertical = 44.dp),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                )
                browse!!.isEmpty() -> Text(
                    "No guilds yet — be the first to found one.",
                    color = Ink2,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.fillMaxWidth().padding(vertical = 44.dp),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                )
                else -> Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    browse!!.forEach { card ->
                        BrowseGuildRow(
                            card = card,
                            isMine = false,
                            busy = busy,
                            requested = requestedIds.contains(card.id),
                            onOpenPreview = { previewGuildId = card.id },
                            onJoin = {
                                if (!hasRealAccount) {
                                    // Anonymous — prompt sign-in (join needs an account).
                                    onRequireSignIn()
                                } else {
                                    busy = true
                                    scope.launch {
                                        // On success flip the button to "Request Sent ✓"
                                        // (owner: the tap must give feedback). On failure
                                        // surface the message; auth errors → sign-in.
                                        when (val r = GuildsRepository.join(card.id)) {
                                            is SocialResult.Success -> {
                                                toast = null
                                                requestedIds = requestedIds + card.id
                                            }
                                            is SocialResult.Failure ->
                                                if (com.filipinodama.app.ui.components.isAuthError(r.code)) onRequireSignIn()
                                                else toast = r.message
                                        }
                                        busy = false
                                    }
                                }
                            }
                        )
                    }
                }
            }

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 14.dp, bottom = 28.dp)
                    // Creating a guild needs an account — an anonymous user is
                    // prompted to sign in instead of opening a dialog that would
                    // fail on submit.
                    .clickable { if (!hasRealAccount) onRequireSignIn() else createOpen = true }
                    .background(Color(0x0DE8B84B), RoundedCornerShape(14.dp))
                    .border(1.dp, Color(0x57E8B84B), RoundedCornerShape(14.dp))
                    .padding(14.dp),
                contentAlignment = Alignment.Center
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("＋", color = GoldLt, style = MaterialTheme.typography.titleMedium)
                    Text("Create a Guild", color = GoldLt, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                }
            }
        }
        } // PullRefreshContainer
    }

        // Overlays — emitted AFTER the main Column so they layer above it.
        if (createOpen) {
            GuildCreateDialog(
                onClose = { createOpen = false },
                onRequireSignIn = onRequireSignIn,
                onCreated = {
                    createOpen = false
                    loadBrowse(query)
                }
            )
        }

        if (previewGuildId != null) {
            GuildPreviewSheet(
                guildId = previewGuildId!!,
                signedIn = hasRealAccount,
                onClose = { previewGuildId = null },
                onRequireSignIn = onRequireSignIn,
                onJoined = { loadBrowse(query) }
            )
        }

        // Join-failure toast (review M2) — auto-dismisses; bottom-anchored.
        toast?.let { msg ->
            LaunchedEffect(msg) { kotlinx.coroutines.delay(3000); toast = null }
            Box(modifier = Modifier.fillMaxSize().padding(20.dp), contentAlignment = Alignment.BottomCenter) {
                Box(
                    modifier = Modifier
                        .background(Color(0xF21B1030), RoundedCornerShape(12.dp))
                        .border(1.dp, Color(0x59E8B84B), RoundedCornerShape(12.dp))
                        .padding(horizontal = 16.dp, vertical = 12.dp)
                ) {
                    Text(msg, color = GoldLt, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}

@Composable
private fun Spacer() {
    Box(modifier = Modifier.height(2.dp))
}

/**
 * Guild Preview — mockup `{{ guildPreviewShow }}` bottom sheet (Mobile.dc.html
 * lines 1546-1569). Real data from `GET /api/guilds/:id` via
 * [GuildsRepository.detail]. War Record / Region / Language have no backing
 * server field (see [GuildDtos.kt] `GuildDetailDto`) so those tiles/row show
 * an honest "—" rather than fabricated demo values.
 */
@Composable
fun GuildPreviewSheet(guildId: String, signedIn: Boolean, onClose: () -> Unit, onRequireSignIn: () -> Unit = {}, onJoined: () -> Unit) {
    val scope = rememberCoroutineScope()
    val snackbar = com.filipinodama.app.ui.components.LocalSnackbar.current
    var detail by remember(guildId) { mutableStateOf<GuildDetailResponse?>(null) }
    // Distinguish "still loading" from "load failed" so the sheet doesn't spin
    // forever on an error (it previously left detail == null == loading).
    var detailError by remember(guildId) { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var joined by remember(guildId) { mutableStateOf(false) }
    var requested by remember(guildId) { mutableStateOf(false) }

    LaunchedEffect(guildId) {
        when (val r = GuildsRepository.detail(guildId)) {
            is SocialResult.Success -> { detail = r.data; detailError = false }
            is SocialResult.Failure -> detailError = true
        }
    }

    // CENTERED dialog (owner: "why do modals open at the bottom? make them
    // open in the middle") — was a bottom sheet. Centered card with a
    // horizontal margin, all-corners rounding; navigationBarsPadding keeps a
    // near-full-height card's Join CTA clear of the system nav/gesture bar.
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xB8080414))
            .clickable(onClick = onClose)
            .padding(horizontal = 16.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.verticalGradient(listOf(Color(0xFF1E1140), Color(0xFF160B30))),
                    RoundedCornerShape(24.dp)
                )
                .border(1.dp, Color(0x59E8B84B), RoundedCornerShape(24.dp))
                .clickable(enabled = false) {}
                .navigationBarsPadding()
                .padding(start = 18.dp, end = 18.dp, top = 20.dp, bottom = 20.dp)
        ) {
            // Content wrapper MUST be a Column — a Box would stack the crest,
            // name, stat tiles, and Join button all on top of each other.
            // Capped + scrollable so a tall guild card (long description, large
            // accessibility font) can't push the Join CTA off the top of the sheet.
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 560.dp)
                    .verticalScroll(rememberScrollState())
                    .padding(top = 4.dp)
            ) {
                if (detailError) {
                    Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) {
                        Text("Couldn't load this guild. Please try again.", color = Ink2, style = MaterialTheme.typography.bodyMedium)
                    }
                } else if (detail == null) {
                    Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = Gold)
                    }
                } else {
                    val g = detail!!.guild
                    val crest = resolveGuildCrest(g.crestKey, g.id)
                    val level = (g.weeklyPoints.coerceAtLeast(0) / 1000) + 1
                    val myGuildJoinState = detail!!.joinState

                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.padding(bottom = 16.dp)) {
                        AsyncImage(model = crest.src, contentDescription = null, modifier = Modifier.size(58.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(g.name, color = Color(0xFFF4D886), style = MaterialTheme.typography.headlineSmall)
                                Box(
                                    modifier = Modifier
                                        .background(Color(0x0FE8B84B), RoundedCornerShape(100.dp))
                                        .border(1.dp, Color(0x38E8B84B), RoundedCornerShape(100.dp))
                                        .padding(horizontal = 8.dp, vertical = 2.dp)
                                ) {
                                    Text("Lv $level", color = Color(0xFFF0CF72), style = MaterialTheme.typography.labelSmall)
                                }
                            }
                            Text("${g.tag} · ${g.memberCount} members", color = Color(0xFF9A8BBF), style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 3.dp))
                        }
                    }
                    // Quick bio (real GuildDetailDto.description).
                    if (!g.description.isNullOrBlank()) {
                        Text(g.description, color = Color(0xFFC9BCE6), style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(bottom = 16.dp))
                    }

                    // Stat tiles — ONLY real fields. Removed WAR RECORD / REGION /
                    // LANGUAGE (owner: "not wired") — the Guild model has no such
                    // columns, so those tiles showed a fabricated "—". Kept the two
                    // real ones (weekly points + min-trophies-to-join).
                    Row(modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp), horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                        StatTile("GUILD POINTS", g.weeklyPoints.toString(), Color(0xFFF4ECD6), Modifier.weight(1f))
                        StatTile("MIN. TROPHIES", if (g.minTrophies > 0) g.minTrophies.toString() else "None", Color(0xFFF4ECD6), Modifier.weight(1f))
                    }

                    // Contribution ladder — real roster, top weekly contributors
                    // (owner: "Guild Profile should show the ladder"). Server field
                    // roster[].weeklyContribution; capped so the sheet stays compact.
                    val ladder = detail!!.roster.sortedByDescending { it.weeklyContribution }.take(5)
                    if (ladder.isNotEmpty()) {
                        Text(
                            "TOP CONTRIBUTORS",
                            color = Color(0xFF8B7CAE),
                            style = MaterialTheme.typography.labelSmall,
                            modifier = Modifier.padding(bottom = 8.dp)
                        )
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(Color(0x800F0820), RoundedCornerShape(12.dp))
                                .border(1.dp, Color(0x1AE8B84B), RoundedCornerShape(12.dp))
                                .padding(vertical = 4.dp)
                                .padding(bottom = 4.dp)
                        ) {
                            ladder.forEachIndexed { i, m ->
                                Row(
                                    modifier = Modifier.fillMaxWidth().padding(horizontal = 13.dp, vertical = 8.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                                ) {
                                    Text("#${i + 1}", color = if (i == 0) Color(0xFFF0CF72) else Color(0xFF8B7CAE), style = MaterialTheme.typography.labelMedium, modifier = Modifier.width(28.dp))
                                    Text(m.user.displayName, color = Color(0xFFE6DCF5), style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f), maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                                    com.filipinodama.app.ui.components.CurrencyIcon(kind = com.filipinodama.app.ui.components.CurrencyIconKind.TROPHY, size = 12.dp)
                                    Text("${m.weeklyContribution}", color = Color(0xFFF0CF72), style = MaterialTheme.typography.labelMedium)
                                }
                            }
                        }
                        Box(Modifier.height(16.dp))
                    }

                    val effectiveState = myGuildJoinState ?: if (!signedIn) "guest" else "joinable"
                    val label = when {
                        joined -> "✓ Joined"
                        requested -> "✓ Application sent"
                        effectiveState == "member" -> "Your Guild"
                        effectiveState == "in-other-guild" -> "Already in a guild"
                        effectiveState == "requested" -> "✓ Application sent"
                        effectiveState == "invite-only" -> "Members only"
                        effectiveState == "guest" -> "Sign in to join"
                        // Approval is universal now (owner policy): every joinable
                        // guild is "Request to Join", never an instant "Join".
                        else -> "Request to Join"
                    }
                    val joinHandoff = guildPreviewJoinHandoff(signedIn, busy, joined, requested, effectiveState)
                    val joinEnabled = joinHandoff != GuildPreviewJoinHandoff.Unavailable

                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 14.dp)
                            .clickable(enabled = joinEnabled) {
                                when (joinHandoff) {
                                    GuildPreviewJoinHandoff.RequireSignIn -> onRequireSignIn()
                                    GuildPreviewJoinHandoff.SubmitJoin -> {
                                        busy = true
                                        scope.launch {
                                            when (val res = GuildsRepository.join(guildId)) {
                                                is SocialResult.Success -> {
                                                    if (res.data.status == "joined") joined = true else requested = true
                                                    onJoined()
                                                }
                                                is SocialResult.Failure -> if (com.filipinodama.app.ui.components.isAuthError(res.code)) onRequireSignIn() else snackbar.show(res.message)
                                            }
                                            busy = false
                                        }
                                    }
                                    GuildPreviewJoinHandoff.Unavailable -> Unit
                                }
                            }
                            .background(
                                if (joinEnabled) Brush.verticalGradient(listOf(Color(0xFFEFC25A), Color(0xFFC9971F)))
                                else Brush.verticalGradient(listOf(Color(0x1F5FD48A), Color(0x1F5FD48A))),
                                RoundedCornerShape(13.dp)
                            )
                            .padding(vertical = 15.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            label,
                            color = if (joinEnabled) Color(0xFF2A1608) else Color(0xFF7EE6A4),
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun StatTile(label: String, value: String, valueColor: Color, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .background(Color(0x800F0820), RoundedCornerShape(12.dp))
            .border(1.dp, Color(0x1AE8B84B), RoundedCornerShape(12.dp))
            .padding(horizontal = 13.dp, vertical = 11.dp)
    ) {
        Text(label, color = Color(0xFF8B7CAE), style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(bottom = 3.dp))
        Text(value, color = valueColor, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
    }
}
