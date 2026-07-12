package com.filipinodama.app.ui.screens.game

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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.filipinodama.app.data.AuthRepository
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
    onPlayAi: () -> Unit,
    onPlayCasual: () -> Unit,
    onPlayRanked: () -> Unit,
    onPrivateRoom: () -> Unit,
    onRankedGuestBlocked: () -> Unit
) {
    val authState by AuthRepository.state.collectAsState()
    val isGuest = authState.user?.isGuest ?: false

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("✦ CHOOSE YOUR BATTLE ✦", color = Gold, style = MaterialTheme.typography.labelMedium)
        Text(
            "Game Modes",
            color = GoldLt,
            style = MaterialTheme.typography.headlineMedium,
            modifier = Modifier.padding(top = 8.dp, bottom = 4.dp)
        )
        Text(
            "Pick how you want to play. Ranked affects your trophies — everything else is just for fun.",
            color = Ink,
            style = MaterialTheme.typography.bodyMedium,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center
        )

        Column(modifier = Modifier.padding(top = 24.dp).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            ModeCardRow(
                icon = "🤖",
                title = "Play vs AI",
                tag = null,
                desc = "Practice offline against the computer. No stakes, no ranking.",
                meta = "3 difficulties",
                onClick = onPlayAi
            )
            ModeCardRow(
                icon = "⚡",
                title = "Quick Match",
                tag = "CASUAL",
                desc = "Jump into a casual match against a nearby-rank opponent.",
                meta = "No trophy risk",
                onClick = onPlayCasual
            )
            ModeCardRow(
                icon = "🏆",
                title = "Ranked",
                tag = "RANKED",
                desc = "Climb the ladder. Trophies and gold are on the line.",
                meta = if (isGuest) "Requires a free account" else "Affects your rank",
                onClick = { if (isGuest) onRankedGuestBlocked() else onPlayRanked() }
            )
            ModeCardRow(
                icon = "👥",
                title = "Private Room",
                tag = null,
                desc = "Play with a friend using a room code.",
                meta = "Coming soon",
                onClick = onPrivateRoom
            )
        }
    }
}

@Composable
private fun ModeCardRow(icon: String, title: String, tag: String?, desc: String, meta: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .background(Panel, RoundedCornerShape(14.dp))
            .border(1.dp, Gold.copy(alpha = 0.2f), RoundedCornerShape(14.dp))
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        androidx.compose.foundation.layout.Box(
            modifier = Modifier
                .size(48.dp)
                .background(Gold.copy(alpha = 0.12f), CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Text(icon, style = MaterialTheme.typography.titleLarge)
        }
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(title, color = GoldLt, style = MaterialTheme.typography.titleMedium)
                if (tag != null) {
                    androidx.compose.foundation.layout.Box(
                        modifier = Modifier
                            .background(Gold.copy(alpha = 0.14f), RoundedCornerShape(100.dp))
                            .padding(horizontal = 8.dp, vertical = 2.dp)
                    ) {
                        Text(tag, color = Gold, style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
            Text(desc, color = Ink, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 2.dp))
            Text(meta, color = Ink2, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 4.dp))
        }
    }
}
