package com.filipinodama.app.ui.screens.game

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.filipinodama.app.R
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.config.ConfigRepository
import com.filipinodama.app.data.economy.EconomyRepository
import com.filipinodama.app.data.economy.EconomyResult
import com.filipinodama.app.data.engine.AiDifficulties
import com.filipinodama.app.data.engine.RankTiers
import com.filipinodama.app.data.play.ArmedMode
import com.filipinodama.app.data.play.PlayLoadoutStore
import com.filipinodama.app.data.play.PlayScreenRequests
import com.filipinodama.app.data.profile.MatchRecordsResponse
import com.filipinodama.app.data.profile.ModeRecordDto
import com.filipinodama.app.data.profile.ProfileRepository
import com.filipinodama.app.data.profile.ProfileResult
import com.filipinodama.app.ui.components.MotionBudget
import com.filipinodama.app.ui.components.ThroneArt
import com.filipinodama.app.ui.components.ThroneBackdrop
import com.filipinodama.app.ui.components.attentionBounce
import com.filipinodama.app.ui.components.brightIconFilter
import com.filipinodama.app.ui.components.iconGlow
import com.filipinodama.app.ui.components.idlePulse
import com.filipinodama.app.ui.components.rememberMotionBudget
import com.filipinodama.app.ui.screens.profile.AvatarView
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.AlfaSlabFontFamily

/**
 * The Play tab, rebuilt as a Battle screen (owner-approved, this replaces
 * ModeSelectScreen as the Play tab root).
 *
 * The mode list is NOT on this screen — it lives in a drawer behind the trophy
 * button, and picking a mode there ARMS the BATTLE button. That is the whole
 * idea: BATTLE never has to guess what it does, because the player already
 * said. It also moves the Ranked account gate off the primary CTA and onto the
 * ticket, where it can be explained instead of just refusing.
 *
 * AI difficulty follows the owner's chosen model ("dock loadout"): the AI
 * ticket arms immediately at your remembered difficulty, and an Easy / Normal /
 * Hard strip appears above the dock only while AI is armed.
 *
 * Everything on screen reads from state that already exists — trophies and tier
 * from [RankTiers], identity from [AuthRepository], the Watch Live gate from
 * [ConfigRepository]. Per-mode win records are deliberately absent rather than
 * invented: they need a server aggregate that has not been built yet.
 */
@Composable
fun BattleScreen(
    onPlayCasual: () -> Unit,
    onPlayRanked: () -> Unit,
    onPlayAi: (String) -> Unit,
    onPrivateRoom: () -> Unit,
    onTournaments: () -> Unit,
    onQuests: () -> Unit,
    onDailyReward: () -> Unit,
    onWatchLive: () -> Unit,
    onBrowseStore: () -> Unit,
    onRankedGuestBlocked: () -> Unit
) {
    val authState by AuthRepository.state.collectAsStateWithLifecycle()
    val me = authState.user
    val needsAccountForRanked = me?.isGuest ?: true
    val watchLiveEnabled by ConfigRepository.watchLiveEnabled.collectAsStateWithLifecycle()

    val loadout = remember { PlayLoadoutStore.instance }
    val armedMode by loadout.armedMode.collectAsStateWithLifecycle()
    val aiDifficulty by loadout.aiDifficulty.collectAsStateWithLifecycle()

    var sheetOpen by remember { mutableStateOf(false) }

    // Per-mode standings for the Game Modes tickets. Null until loaded (and on
    // failure) so a ticket shows no stat line rather than a fabricated 0W - 0L.
    var records by remember { mutableStateOf<MatchRecordsResponse?>(null) }
    LaunchedEffect(me?.id, sheetOpen) {
        if (me == null) { records = null; return@LaunchedEffect }
        val result = ProfileRepository.matchRecords()
        if (result is ProfileResult.Success) records = result.data
    }
    var loadoutOpen by remember { mutableStateOf(false) }

    // Settings / post-purchase hand off into the loadout by navigating here
    // with a pending request; open it once and clear it.
    val loadoutRequested by PlayScreenRequests.openLoadout.collectAsStateWithLifecycle()
    LaunchedEffect(loadoutRequested) {
        if (loadoutRequested) {
            loadoutOpen = true
            PlayScreenRequests.consumeLoadout()
        }
    }

    // How much ambient motion this device should run. Re-read on every resume so
    // flipping battery saver in the shade takes effect without a cold start.
    val motionBudget = rememberMotionBudget()

    // Whether the daily reward is actually waiting. The rail button only bounces
    // on real state — a bounce that fires regardless trains players to ignore it.
    // Null while unknown, so nothing animates on a guess.
    var dailyClaimable by remember { mutableStateOf<Boolean?>(null) }
    LaunchedEffect(me?.id) {
        if (me == null) { dailyClaimable = null; return@LaunchedEffect }
        dailyClaimable = when (val r = EconomyRepository.dailyLoginStatus()) {
            is EconomyResult.Success -> !r.data.claimedToday
            is EconomyResult.Failure -> null
        }
    }

    val trophies = me?.trophies ?: 0
    val tier = RankTiers.forTrophies(trophies)
    val nextTier = RankTiers.next(tier)
    val accent = remember(tier.key) { parseHex(tier.accent) }
    val progress = remember(trophies, tier.key) {
        val next = nextTier ?: return@remember 1f
        val span = (next.min - tier.min).coerceAtLeast(1)
        ((trophies - tier.min).toFloat() / span).coerceIn(0f, 1f)
    }

    Box(modifier = Modifier.fillMaxSize().background(Color(0xFF160B28))) {
        // ── backdrop: the throne art plus its animated light, tinted by tier ──
        // The light is drawn INSIDE the backdrop, so it lands under both scrims
        // below and reads as part of the room rather than sitting over the UI.
        // ThroneArt.Baked is the shipped single-WebP art; switching to
        // ThroneArt.Layered is the only change needed once a clean plate exists.
        ThroneBackdrop(
            budget = motionBudget,
            art = ThroneArt.Baked,
            modifier = Modifier.fillMaxSize()
        )
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        0f to Color(0xB8160B28),
                        0.22f to Color(0x4D160B28),
                        0.62f to Color(0xDB160B28),
                        0.88f to Color(0xFF160B28)
                    )
                )
        )
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.radialGradient(
                        listOf(accent.copy(alpha = 0.28f), Color.Transparent),
                        radius = 900f
                    )
                )
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .padding(horizontal = 16.dp)
                .padding(top = 8.dp, bottom = 12.dp)
        ) {
            // ── currency ──
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                CurrencyPill(R.drawable.ic_trophy, formatThousands(trophies), Modifier.weight(1f))
                CurrencyPill(R.drawable.ic_coin, formatThousands(me?.gold ?: 0), Modifier.weight(1f))
            }

            // ── identity ──
            if (me != null) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth().padding(top = 10.dp)
                ) {
                    AvatarView(avatarUrl = me.avatarUrl, frameId = me.frameId, size = 40.dp, ring = true)
                    Column(modifier = Modifier.padding(start = 11.dp)) {
                        Text(
                            me.displayName,
                            color = Color(0xFFF4ECD6),
                            style = MaterialTheme.typography.titleMedium,
                            maxLines = 1
                        )
                        Text(
                            "${tier.label} · ${me.tag}",
                            color = accent,
                            style = MaterialTheme.typography.labelSmall,
                            maxLines = 1
                        )
                    }
                }
            }

            // ── the tier IS the screen ──
            Column(
                modifier = Modifier.weight(1f).fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Image(
                    painter = painterResource(id = RankTiers.drawableFor(tier.img)),
                    contentDescription = null,
                    modifier = Modifier.size(112.dp)
                )
                Text(
                    tier.label,
                    color = accent,
                    style = MaterialTheme.typography.headlineLarge,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 10.dp)
                )
                Text(
                    tier.sub.uppercase(),
                    color = Color(0xFFDDD1F0),
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier.padding(top = 5.dp)
                )
            }

            // ── trophy road ──
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(100.dp))
                    .background(Color(0x8C0A0516))
                    .border(1.dp, Color(0x4DE8B84B), RoundedCornerShape(100.dp))
                    .padding(horizontal = 13.dp, vertical = 7.dp)
            ) {
                Image(
                    painter = painterResource(id = R.drawable.ic_trophy),
                    contentDescription = null,
                    colorFilter = brightIconFilter(),
                    modifier = Modifier.size(19.dp)
                )
                Text(
                    formatThousands(trophies),
                    color = Color(0xFFF5D783),
                    style = MaterialTheme.typography.labelLarge
                )
                Column(modifier = Modifier.weight(1f)) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(7.dp)
                            .clip(RoundedCornerShape(100.dp))
                            .background(Color.White.copy(alpha = 0.13f))
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(progress)
                                .fillMaxHeight()
                                .clip(RoundedCornerShape(100.dp))
                                .background(Brush.horizontalGradient(listOf(accent, Color(0xFFF5D783))))
                        )
                    }
                    Text(
                        if (nextTier != null) {
                            "${nextTier.min - trophies} to ${nextTier.label}"
                        } else {
                            "Top of the ladder"
                        },
                        color = Ink2,
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.padding(top = 3.dp)
                    )
                }
            }

            // ── Model C: difficulty strip, only while AI is armed ──
            AnimatedVisibility(
                visible = armedMode == ArmedMode.AI,
                enter = fadeIn(tween(180)) + expandVertically(tween(220)),
                exit = fadeOut(tween(140)) + shrinkVertically(tween(200))
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth().padding(top = 12.dp)
                ) {
                    DIFFICULTIES.forEach { level ->
                        DifficultyChip(
                            label = level.label,
                            pips = level.pips,
                            accent = level.accent,
                            selected = aiDifficulty == level.key,
                            onClick = { loadout.setAiDifficulty(level.key) },
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }

            // ── dock: loadout · BATTLE · Game Modes ──
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 14.dp)
                    .clip(RoundedCornerShape(22.dp))
                    .background(Color(0x9E0C0618))
                    .border(1.dp, Color(0x42E8B84B), RoundedCornerShape(22.dp))
                    .padding(9.dp)
            ) {
                // Left slot: your loadout (board + piece skin) as its own
                // drawer — the counterpart to Game Modes on the right. Two
                // buttons, two drawers, neither duplicating the other.
                DockSlot(onClick = { loadoutOpen = true }) {
                    Image(
                        painter = painterResource(id = R.drawable.ic_loadout),
                        contentDescription = "Your Loadout",
                        colorFilter = brightIconFilter(),
                        modifier = Modifier.size(40.dp).iconGlow(alpha = 0.28f)
                    )
                }

                BattleButton(
                    word = battleWord(armedMode),
                    sub = battleSub(armedMode, aiDifficulty),
                    modifier = Modifier.weight(1f),
                    onClick = {
                        when (armedMode) {
                            ArmedMode.RANKED ->
                                if (needsAccountForRanked) onRankedGuestBlocked() else onPlayRanked()
                            ArmedMode.CASUAL -> onPlayCasual()
                            ArmedMode.AI -> onPlayAi(aiDifficulty)
                            ArmedMode.PRIVATE -> onPrivateRoom()
                            else -> onPlayCasual()
                        }
                    }
                )

                // Right slot: Game Modes. The caret underneath is the whole
                // discoverability trick — without it nobody finds the drawer.
                DockSlot(onClick = { sheetOpen = true }, showCaret = true) {
                    Image(
                        painter = painterResource(id = R.drawable.ic_trophy),
                        contentDescription = "Game Modes",
                        colorFilter = brightIconFilter(),
                        modifier = Modifier.size(40.dp).iconGlow(alpha = 0.28f)
                    )
                }
            }
        }


        // ── side rail: the things that are not modes ──
        // Tournaments is its own page (owner directive), not a Game Modes
        // ticket — you go there to browse brackets, not to arm the BATTLE
        // button. Quests and Daily Reward sit alongside it for the same reason.
        Column(
            verticalArrangement = Arrangement.spacedBy(11.dp),
            modifier = Modifier
                .align(Alignment.TopStart)
                .statusBarsPadding()
                .padding(start = 16.dp, top = 116.dp)
        ) {
            // Staggered pulse delays: a column of icons breathing in unison
            // reads as a rendering glitch, not as life.
            RailButton(
                R.drawable.ic_trophy, "Tournaments", onTournaments,
                budget = motionBudget, pulseDelayMillis = 0
            )
            RailButton(
                R.drawable.me_crown, "Daily quests", onQuests,
                budget = motionBudget, pulseDelayMillis = 260
            )
            RailButton(
                R.drawable.ic_chest, "Daily reward", onDailyReward,
                budget = motionBudget, pulseDelayMillis = 520,
                attention = dailyClaimable == true
            )
        }

        // ── the drawer ──
        PlayDrawer(visible = sheetOpen, onDismiss = { sheetOpen = false }) {
            DrawerTitle("Game Modes")

            ModeTicket(
                title = "Ranked",
                artRes = R.drawable.mode_ranked,
                stubRes = RankTiers.drawableFor(tier.img),
                accent = accent,
                bgTint = accent.copy(alpha = 0.20f),
                stat = "${formatThousands(trophies)} · ${tier.label}",
                statIconRes = R.drawable.ic_trophy,
                progress = progress,
                progressLabel = if (nextTier != null) "${nextTier.min - trophies} to ${nextTier.label}" else "Top of the ladder",
                sub = if (needsAccountForRanked) "Requires a free account" else null,
                selected = armedMode == ArmedMode.RANKED,
                budget = motionBudget,
                entryIndex = 0,
                onClick = {
                    loadout.setArmedMode(ArmedMode.RANKED)
                    sheetOpen = false
                }
            )

            ModeTicket(
                title = "Quick Match",
                artRes = R.drawable.mode_quick,
                stubRes = R.drawable.logo_sun,
                accent = Color(0xFFE8B84B),
                bgTint = Color(0xFF3A331C),
                pill = "CASUAL",
                stat = records?.modes?.get("CASUAL")?.let { winLoss(it) },
                statIconRes = R.drawable.ic_trophy,
                sub = "Casual online · no trophy risk",
                selected = armedMode == ArmedMode.CASUAL,
                budget = motionBudget,
                entryIndex = 1,
                onClick = {
                    loadout.setArmedMode(ArmedMode.CASUAL)
                    sheetOpen = false
                }
            )

            ModeSectionHeader("PRACTICE & PRIVATE")

            ModeTicket(
                title = "Play vs AI",
                artRes = R.drawable.mode_vs_ai,
                stubRes = R.drawable.diff_normal,
                accent = Color(0xFF3FBF6F),
                bgTint = Color(0xFF1C3A2C),
                stat = records?.ai?.get(aiDifficulty)?.let {
                    "${it.wins}W on ${difficultyLabel(aiDifficulty)}"
                },
                statIconRes = R.drawable.ic_trophy,
                sub = "Practice offline · ${difficultyLabel(aiDifficulty)}",
                selected = armedMode == ArmedMode.AI,
                budget = motionBudget,
                entryIndex = 2,
                onClick = {
                    loadout.setArmedMode(ArmedMode.AI)
                    sheetOpen = false
                }
            )

            ModeTicket(
                title = "Private Room",
                artRes = R.drawable.mode_friend,
                stubRes = R.drawable.sb_players,
                accent = Color(0xFFC9A4FF),
                bgTint = Color(0xFF33234A),
                stat = records?.modes?.get("PRIVATE")?.let { winLoss(it) },
                statIconRes = R.drawable.ic_trophy,
                sub = "Host a room or join with a code",
                selected = armedMode == ArmedMode.PRIVATE,
                budget = motionBudget,
                entryIndex = 3,
                onClick = {
                    loadout.setArmedMode(ArmedMode.PRIVATE)
                    sheetOpen = false
                }
            )

            // Server-gated, fail-closed — same posture as ModeSelectScreen had.
            // Not an armable mode: spectating is not something BATTLE starts.
            if (watchLiveEnabled) {
                ModeTicket(
                    title = "Watch Live",
                    artRes = R.drawable.mode_ranked,
                    stubRes = R.drawable.sb_players,
                    accent = Color(0xFFFF5A6A),
                    bgTint = Color(0xFF3A1C24),
                    pill = "LIVE",
                    sub = "Spectate top matches happening now",
                    onClick = {
                        sheetOpen = false
                        onWatchLive()
                    },
                    budget = motionBudget,
                    entryIndex = 4
                )
            }
        }

        // ── the loadout drawer ──
        PlayDrawer(visible = loadoutOpen, onDismiss = { loadoutOpen = false }) {
            LoadoutContent(onBrowseStore = {
                loadoutOpen = false
                onBrowseStore()
            })
        }
    }
}

// ──────────────────────────────────────────────────────────────────────────

private data class DifficultyOption(val key: String, val label: String, val pips: Int, val accent: Color)

/** Labels, pip counts and accents quoted from the screen this replaces. */
private val DIFFICULTIES = listOf(
    DifficultyOption(AiDifficulties.EASY, "Easy", 1, Color(0xFF3FBF6F)),
    DifficultyOption(AiDifficulties.NORMAL, "Normal", 2, Color(0xFFE8B84B)),
    DifficultyOption(AiDifficulties.HARD, "Hard", 3, Color(0xFFD63B52))
)

/** "47W - 31L", or with draws when there are any. */
private fun winLoss(r: ModeRecordDto): String =
    if (r.draws > 0) "${r.wins}W · ${r.losses}L · ${r.draws}D" else "${r.wins}W · ${r.losses}L"

private fun difficultyLabel(key: String): String =
    DIFFICULTIES.firstOrNull { it.key == key }?.label ?: "Normal"

/**
 * The CTA headline. Both words are six letters on purpose: the button then keeps
 * identical width and weight whichever mode is armed, and never has to shrink to
 * fit. "Create Room" was trimmed to "Create" for that reason and because the
 * subtitle directly beneath already reads "Private - share a code", so "Room"
 * was saying the same thing twice.
 */
private fun battleWord(mode: String): String = when (mode) {
    ArmedMode.PRIVATE -> "Create"
    else -> "Battle"
}

private fun battleSub(mode: String, difficulty: String): String = when (mode) {
    ArmedMode.RANKED -> "Ranked · trophies on the line"
    ArmedMode.CASUAL -> "Quick Match · no trophy risk"
    ArmedMode.AI -> "vs AI · ${difficultyLabel(difficulty)}"
    ArmedMode.PRIVATE -> "Private · share a code"
    else -> "Quick Match"
}

/**
 * A rail button on the left of the Battle screen. Same chunky treatment as the
 * dock slots, smaller. Badges (unread quests, claimable reward) need state this
 * screen does not fetch yet — see tasks/todo.md Phase 2 — so they are omitted
 * rather than faked.
 */
@Composable
private fun RailButton(
    iconRes: Int,
    contentDescription: String,
    onClick: () -> Unit,
    budget: MotionBudget,
    pulseDelayMillis: Int = 0,
    attention: Boolean = false
) {
    Box(
        modifier = Modifier
            // Bounce the whole tile, not just the icon, so it reads as the
            // control asking for attention rather than the art wobbling.
            .attentionBounce(active = attention, budget = budget)
            .size(50.dp)
            .clip(RoundedCornerShape(14.dp))
            // Lifted gradient + a gold hairline, per the approved mockup. The
            // previous 3dp OUTLINE ring read as a heavy black border that
            // fought the icon it was framing.
            .background(Brush.verticalGradient(listOf(Color(0xFF4E3A82), Color(0xFF2B1A52))))
            .border(1.dp, TILE_EDGE, RoundedCornerShape(14.dp))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Image(
            painter = painterResource(id = iconRes),
            contentDescription = contentDescription,
            colorFilter = brightIconFilter(),
            // idlePulse before iconGlow so the glow scales with the icon; the
            // other order leaves a static halo around a breathing icon.
            modifier = Modifier
                .size(28.dp)
                .idlePulse(budget = budget, delayMillis = pulseDelayMillis)
                .iconGlow()
        )
    }
}

@Composable
private fun CurrencyPill(iconRes: Int, value: String, modifier: Modifier = Modifier) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        modifier = modifier
            .clip(RoundedCornerShape(100.dp))
            .background(Color(0x990A0516))
            .border(1.dp, Color(0x47E8B84B), RoundedCornerShape(100.dp))
            .padding(horizontal = 11.dp, vertical = 5.dp)
    ) {
        Image(
            painter = painterResource(id = iconRes),
            contentDescription = null,
            colorFilter = brightIconFilter(),
            modifier = Modifier.size(16.dp)
        )
        Text(value, color = Color(0xFFF5D783), style = MaterialTheme.typography.labelLarge, maxLines = 1)
    }
}

/** A chunky dock button: thick dark outline, top highlight, presses down. */
@Composable
private fun DockSlot(
    onClick: () -> Unit,
    showCaret: Boolean = false,
    content: @Composable () -> Unit
) {
    Box {
        Box(
            modifier = Modifier
                .size(64.dp)
                .clip(RoundedCornerShape(17.dp))
                .background(Brush.verticalGradient(listOf(Color(0xFF4E3A82), Color(0xFF2B1A52))))
                .border(1.dp, TILE_EDGE, RoundedCornerShape(17.dp))
                .clickable(onClick = onClick),
            contentAlignment = Alignment.Center
        ) { content() }

        if (showCaret) {
            val transition = rememberInfiniteTransition(label = "caret")
            val dy by transition.animateFloat(
                initialValue = 0f,
                targetValue = 3f,
                animationSpec = infiniteRepeatable(tween(850), RepeatMode.Reverse),
                label = "caretBob"
            )
            Text(
                "▾",
                color = Color(0xFFE8B84B),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .offset { IntOffset(0, (dy * 3).toInt()) }
            )
        }
    }
}

@Composable
private fun BattleButton(word: String, sub: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    // Owner-approved treatment: a rounded RECTANGLE in near-flat amber with a lit
    // top edge, a darker bottom lip and a hard offset shadow, so it reads as a
    // physical key seated on the dock. Deliberately geometry + colour rather than
    // a bitmap: it scales to any width, cannot distort, and costs no asset. A
    // pill was tried and rejected — its curved ends steal the width the subtitle
    // needs, forcing that line down to an unreadable size.
    val shape = RoundedCornerShape(18.dp)
    Box(
        modifier = modifier
            .drawBehind {
                // Seated shadow. Drawn behind and BEFORE the clip below, so it is
                // free to sit under the button's lower edge.
                drawRoundRect(
                    color = Color(0xA67A4408),
                    topLeft = Offset(0f, 4.dp.toPx()),
                    size = size,
                    cornerRadius = CornerRadius(18.dp.toPx())
                )
            }
            .clip(shape)
            .background(
                Brush.verticalGradient(
                    0f to Color(0xFFFFCB45),
                    0.46f to Color(0xFFFDB827),
                    1f to Color(0xFFF29C13)
                )
            )
            .drawWithContent {
                drawContent()
                // Lit top edge and shaded bottom lip: the whole sense of depth
                // comes from these two bands, not from a gradient sweep.
                drawRect(
                    color = Color(0x80FFFFFF),
                    size = Size(size.width, 2.dp.toPx())
                )
                drawRect(
                    color = Color(0x8CB76808),
                    topLeft = Offset(0f, size.height - 5.dp.toPx()),
                    size = Size(size.width, 5.dp.toPx())
                )
            }
            .clickable(onClick = onClick)
            .padding(vertical = 13.dp, horizontal = 10.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            BattleWord(word.uppercase())
            Text(
                sub.uppercase(),
                color = Color(0xFF7A4408),
                style = MaterialTheme.typography.labelSmall,
                textAlign = TextAlign.Center,
                maxLines = 2,
                modifier = Modifier.padding(top = 5.dp)
            )
        }
    }
}

/**
 * The BATTLE button's headline word, shrunk to fit rather than clipped.
 *
 * The word is not always "BATTLE": arming Private Room makes it "CREATE ROOM",
 * which does not fit at headlineSmall on a narrow phone or at a raised font
 * scale. It was declared `maxLines = 1` with no [TextAlign] and the default
 * [TextOverflow.Clip], so when it did not fit the Text expanded to the full
 * width, drew from the START, and clipped the tail — rendering as a
 * left-of-centre "CREATE" with the second word missing, while the subtitle
 * below stayed centred because it sets textAlign explicitly. Owner report
 * 2026-08-04; reproduced at font scale 1.3.
 *
 * Shrinking is preferred over wrapping so the primary CTA keeps its single-line
 * proportion. The step-down is bounded by [MIN_BATTLE_WORD_SP], and the state is
 * keyed on the word and the font scale so a mode change or an accessibility
 * change re-measures from full size instead of staying stuck small.
 */
@Composable
private fun BattleWord(word: String) {
    // White fill over a heavy black outline — the arcade CTA treatment. Compose
    // has no text stroke, so the word is drawn TWICE at identical layout: a
    // stroked pass underneath, then the filled pass on top. Both must share the
    // same family, size, tracking, alignment and width or the two passes drift
    // apart and the outline shows as a ghost.
    val base = MaterialTheme.typography.headlineSmall.copy(
        fontFamily = AlfaSlabFontFamily,
        fontWeight = FontWeight.Normal, // Alfa Slab One ships one weight; it is already heavy
        letterSpacing = 0.03.em
    )
    val density = LocalDensity.current
    val fontScale = density.fontScale
    var size by remember(word, fontScale) { mutableStateOf(base.fontSize) }
    var settled by remember(word, fontScale) { mutableStateOf(false) }

    // Stroke is centred on the glyph outline, so half of it eats into the fill.
    // Scaling off the rendered size keeps the outline proportional at every font
    // scale instead of turning spindly on large text.
    // 0.115 matches the approved 3px stroke against a ~26px word in the mockup.
    // Scaling off the rendered size keeps it proportional at every font scale
    // rather than turning spindly on large text.
    val strokePx = with(density) { size.toPx() } * 0.115f

    Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        Text(
            word,
            color = Color(0xFF1A0E04),
            style = base.copy(
                drawStyle = Stroke(width = strokePx, join = StrokeJoin.Round, cap = StrokeCap.Round),
                // Drop shadow lives on the stroke pass so it sits behind
                // everything, rather than between the outline and the fill.
                shadow = Shadow(color = Color(0x73000000), offset = Offset(0f, 3f), blurRadius = 3f)
            ),
            fontSize = size,
            maxLines = 1,
            softWrap = false,
            textAlign = TextAlign.Center,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.fillMaxWidth()
        )
        Text(
            word,
            color = Color.White,
            style = base,
            fontSize = size,
            maxLines = 1,
            softWrap = false,
            textAlign = TextAlign.Center,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.fillMaxWidth(),
            onTextLayout = { result ->
                // hasVisualOverflow, NOT didOverflowWidth: with Ellipsis the
                // paragraph is truncated to fit, so didOverflowWidth reads false
                // and the shrink below would never run — the word would just
                // ellipsise ("CREATE RO...") instead of scaling down.
                if (!settled && result.hasVisualOverflow && size.value > MIN_BATTLE_WORD_SP) {
                    size = size * 0.94f
                } else {
                    settled = true
                }
            }
        )
    }
}

/** Floor for [BattleWord]'s shrink-to-fit, below which the CTA stops reading as one. */
private const val MIN_BATTLE_WORD_SP = 15f

/** Gold hairline on the icon tiles — the mockup's edge, replacing a 3dp black ring. */
private val TILE_EDGE = Color(0x8CF5D783)

@Composable
private fun DifficultyChip(
    label: String,
    pips: Int,
    accent: Color,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(13.dp))
            .background(if (selected) accent else OUTLINE)
            .padding(if (selected) 2.5.dp else 1.5.dp)
            .clip(RoundedCornerShape(11.dp))
            .background(
                Brush.verticalGradient(
                    listOf(accent.copy(alpha = 0.18f), Color(0xFF180E2C))
                )
            )
            .clickable(onClick = onClick)
            .padding(vertical = 9.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(label, color = Color(0xFFF6E7BC), style = MaterialTheme.typography.titleSmall)
            Row(
                horizontalArrangement = Arrangement.spacedBy(3.dp),
                modifier = Modifier.padding(top = 5.dp)
            ) {
                repeat(3) { i ->
                    Box(
                        modifier = Modifier
                            .size(6.dp)
                            .clip(CircleShape)
                            .background(if (i < pips) accent else Color.White.copy(alpha = 0.18f))
                    )
                }
            }
        }
    }
}

/** "1,040" — thousands separated, locale-independent so tests are stable. */
internal fun formatThousands(n: Int): String {
    val s = n.toString()
    if (s.length <= 3) return s
    return s.reversed().chunked(3).joinToString(",").reversed()
}

/** `#rrggbb` from RankTiers -> Compose Color. Falls back to gold on garbage. */
internal fun parseHex(hex: String): Color = try {
    Color(android.graphics.Color.parseColor(hex))
} catch (_: IllegalArgumentException) {
    Color(0xFFE8B84B)
}
