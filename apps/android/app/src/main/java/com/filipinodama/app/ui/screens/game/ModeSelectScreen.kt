package com.filipinodama.app.ui.screens.game

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.filipinodama.app.R
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.config.ConfigRepository
import com.filipinodama.app.ui.components.MockupBackButton
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel

private data class ModeCard(
    val icon: String,
    val title: String,
    val tag: String?,
    val desc: String,
    val meta: String
)

/**
 * Mode Select — inventory SCREEN 19, reached via the Play tab (`go('mode')`
 * per the prototype's nav model — Play does NOT route to a dedicated "play"
 * screen). 4 mode cards: AI (3 difficulties via [AiDifficultyScreen]), Quick/
 * Casual Match, Ranked (guest-gated, mirrors web's isGuest toast+redirect
 * gate exactly), Private Rooms (Phase 4 placeholder per task boundary).
 */
@Composable
fun ModeSelectScreen(
    onBack: () -> Unit = {},
    onPlayAi: () -> Unit,
    onPlayCasual: () -> Unit,
    onPlayRanked: () -> Unit,
    onPrivateRoom: () -> Unit,
    onWatchLive: () -> Unit,
    onRankedGuestBlocked: () -> Unit
) {
    val authState by AuthRepository.state.collectAsState()
    // Ranked requires a real account. That means EITHER a guest account OR an
    // anonymous user (no session at all). A plain `user?.isGuest ?: false` would
    // wrongly treat an anonymous user (user == null) as permitted, so gate on
    // "no real account" = user is null OR user.isGuest.
    val needsAccountForRanked = authState.user?.let { it.isGuest } ?: true
    // Watch Live PAGE gate (owner directive 2026-07-12) — safe-off: the card
    // only renders after /api/config/public explicitly says "true". Room/match
    // spectate deep links elsewhere are NOT gated by this.
    val watchLiveEnabled by ConfigRepository.watchLiveEnabled.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp, vertical = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Start) {
            MockupBackButton(onClick = onBack)
        }
        Text(
            "CHOOSE YOUR BATTLE",
            color = Color(0xFFC79A4E),
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(top = 12.dp)
        )
        Text(
            "Game Modes",
            color = Color(0xFFF4D886),
            style = MaterialTheme.typography.headlineMedium,
            modifier = Modifier.padding(top = 8.dp, bottom = 4.dp)
        )
        Text(
            "Pick how you want to play. Ranked affects your trophies — everything else is just for fun.",
            color = Color(0xFF9A8BBF),
            style = MaterialTheme.typography.bodyMedium,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center
        )

        Column(modifier = Modifier.padding(top = 24.dp).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            // Mockup per-mode accent/border/bg (mobile-split.txt modeSelect,
            // lines ~4034-4039): each mode has its own tinted gradient card,
            // not a uniform Panel — colors quoted verbatim below.
            ModeCardRow(
                icon = "🤖",
                title = "Play vs AI",
                tag = null,
                desc = "Practice offline against the computer. No stakes, no ranking.",
                meta = "3 difficulties",
                accent = Color(0xFF3FBF6F),
                border = Color(0x663FBF6F),
                bg = Brush.linearGradient(listOf(Color(0xFF1C3A2C), Color(0xFF1A1030))),
                onClick = onPlayAi
            )
            ModeCardRow(
                icon = "⚡",
                title = "Quick Match",
                tag = "CASUAL",
                desc = "Jump into a casual match against a nearby-rank opponent.",
                meta = "No trophy risk",
                accent = Color(0xFFE8B84B),
                border = Color(0x66E8B84B),
                bg = Brush.linearGradient(listOf(Color(0xFF3A331C), Color(0xFF1A1030))),
                onClick = onPlayCasual
            )
            ModeCardRow(
                iconRes = R.drawable.ic_trophy,
                title = "Ranked",
                tag = "RANKED",
                desc = "Climb the ladder. Trophies and gold are on the line.",
                meta = if (needsAccountForRanked) "Requires a free account" else "Affects your rank",
                accent = Color(0xFFD93B52),
                border = Color(0x66D93B52),
                bg = Brush.linearGradient(listOf(Color(0xFF3A1C2A), Color(0xFF1A1030))),
                onClick = { if (needsAccountForRanked) onRankedGuestBlocked() else onPlayRanked() }
            )
            ModeCardRow(
                icon = "👥",
                title = "Private Room",
                tag = null,
                desc = "Play with a friend using a room code.",
                meta = "Host or join by code",
                accent = Color(0xFFC9A4FF),
                border = Color(0x66C9A4FF),
                bg = Brush.linearGradient(listOf(Color(0xFF33234A), Color(0xFF1A1030))),
                onClick = onPrivateRoom
            )
            if (watchLiveEnabled) {
                ModeCardRow(
                    icon = "👁",
                    title = "Watch Live",
                    tag = "LIVE",
                    desc = "Spectate top matches happening right now.",
                    meta = "Real-time, no stakes",
                    accent = Color(0xFFFF5A6A),
                    border = Color(0x66FF5A6A),
                    bg = Brush.linearGradient(listOf(Color(0xFF3A1C24), Color(0xFF1A1030))),
                    onClick = onWatchLive
                )
            }
        }
    }
}

/**
 * [icon] is an emoji glyph for modes with no matching handoff icon (AI/Quick/
 * Private/Watch — robot, lightning, people, eye have no bundled art); [iconRes]
 * is a bundled drawable for modes that DO have real handoff art (Ranked uses
 * the real ic-trophy.png instead of the 🏆 emoji). Exactly one is non-null.
 */
@Composable
private fun ModeCardRow(
    title: String,
    tag: String?,
    desc: String,
    meta: String,
    accent: Color,
    border: Color,
    bg: Brush,
    onClick: () -> Unit,
    icon: String? = null,
    iconRes: Int? = null
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .background(bg, RoundedCornerShape(20.dp))
            .border(1.dp, border, RoundedCornerShape(20.dp))
            .padding(20.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        androidx.compose.foundation.layout.Box(
            modifier = Modifier
                .size(60.dp)
                .background(Color(0x0DFFFFFF), RoundedCornerShape(16.dp)),
            contentAlignment = Alignment.Center
        ) {
            if (iconRes != null) {
                Image(painter = painterResource(id = iconRes), contentDescription = null, modifier = Modifier.size(44.dp))
            } else if (icon != null) {
                Text(icon, style = MaterialTheme.typography.headlineSmall)
            }
        }
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(title, color = Color(0xFFF4D886), style = MaterialTheme.typography.titleMedium)
                if (tag != null) {
                    androidx.compose.foundation.layout.Box(
                        modifier = Modifier
                            .border(1.dp, accent, RoundedCornerShape(100.dp))
                            .padding(horizontal = 7.dp, vertical = 2.dp)
                    ) {
                        Text(tag, color = accent, style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
            Text(desc, color = Color(0xFFA999C8), style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 2.dp))
            Text(meta, color = Color(0xFF7C6DA3), style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 4.dp))
        }
        Text("›", color = accent, style = MaterialTheme.typography.headlineSmall)
    }
}
