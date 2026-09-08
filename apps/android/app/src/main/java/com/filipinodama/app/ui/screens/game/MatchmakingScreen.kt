package com.filipinodama.app.ui.screens.game

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.activity.compose.BackHandler
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.filipinodama.app.R
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.engine.RankTiers
import com.filipinodama.app.data.match.MatchRepository
import com.filipinodama.app.data.match.MatchStatus
import com.filipinodama.app.ui.components.CurrencyAmount
import com.filipinodama.app.ui.components.CurrencyIconKind
import com.filipinodama.app.ui.components.screenInsets
import com.filipinodama.app.ui.screens.profile.AvatarView

/**
 * Online matchmaking — rebuilt 1:1 to the mockup's Matchmaking screen
 * (mobile-split.txt lines 565-613):
 *  - SEARCH state: full-bleed radial gradient, spinner ring around the
 *    glowing logo-sun, "Finding opponent…", the cross-device caption, a rank
 *    pill (real tier crest + tier label + ~trophies), Cancel pinned low.
 *  - FOUND state: "MATCH FOUND!" eyebrow, VS clash (my avatar red-glow vs
 *    opponent avatar blue-glow, real names/trophies), the cross-play device
 *    pill (real opponent.device, same mapping as before), "Preparing the
 *    board…" caption.
 *
 * All matchmaking logic is unchanged: joinQueue on entry, status-driven
 * search/found sub-states, auto hand-off to [OnlineMatchScreen] when the
 * store flips to PLAYING/ENDED (mirrors web's OnlineMatchPage timings).
 */
internal data class MatchmakingExit(val leaveQueue: Boolean, val reset: Boolean, val navigate: Boolean) {
    companion object { val None = MatchmakingExit(false, false, false) }
}
internal enum class MatchmakingBackAction { UserExit, ConsumeFoundReveal, PassThrough }
internal object MatchmakingBackPolicy {
    fun forStatus(status: MatchStatus): MatchmakingBackAction = when (status) {
        MatchStatus.FOUND -> MatchmakingBackAction.ConsumeFoundReveal
        MatchStatus.PLAYING -> MatchmakingBackAction.PassThrough
        else -> MatchmakingBackAction.UserExit
    }
}
internal class MatchmakingScreenLifecycleOwner {
    private var userExitRequested = false
    private var disposalCleaned = false
    fun requestUserExit(status: MatchStatus): MatchmakingExit {
        if (userExitRequested) return MatchmakingExit.None
        userExitRequested = true
        return MatchmakingExit(status == MatchStatus.SEARCHING, reset = true, navigate = true)
    }
    fun disposeIfOwned(status: MatchStatus): Boolean {
        if (userExitRequested || disposalCleaned || status != MatchStatus.SEARCHING) return false
        disposalCleaned = true
        return true
    }
}

@Composable
fun MatchmakingScreen(mode: String, onCancel: () -> Unit, onEnteredMatch: () -> Unit) {
    val ui by MatchRepository.state.collectAsStateWithLifecycle()
    val authState by AuthRepository.state.collectAsStateWithLifecycle()
    val me = authState.user

    // Preferred side — mirrors web OnlineMatchPage: "either" = no preference
    // (fastest match, the default so search still starts instantly). Vs a bot you
    // always get your pick; vs humans it's honoured when compatible.
    var colorPref by remember { mutableStateOf("either") }
    val lifecycleOwner = remember(mode) { MatchmakingScreenLifecycleOwner() }
    val currentStatus by rememberUpdatedState(ui.status)
    val requestUserExit = {
        val exit = lifecycleOwner.requestUserExit(currentStatus)
        if (exit.leaveQueue) MatchRepository.leaveQueue()
        if (exit.reset) MatchRepository.reset()
        if (exit.navigate) onCancel()
    }

    LaunchedEffect(mode) {
        MatchRepository.joinQueue(mode, colorPref)
    }

    LaunchedEffect(ui.status) {
        if (ui.status == MatchStatus.PLAYING || ui.status == MatchStatus.ENDED) onEnteredMatch()
    }
    val backAction = MatchmakingBackPolicy.forStatus(ui.status)
    BackHandler(enabled = backAction != MatchmakingBackAction.PassThrough) {
        if (backAction == MatchmakingBackAction.UserExit) requestUserExit()
    }
    DisposableEffect(lifecycleOwner) {
        onDispose {
            if (lifecycleOwner.disposeIfOwned(currentStatus)) {
                MatchRepository.leaveQueue()
                MatchRepository.reset()
            }
        }
    }

    val found = ui.status == MatchStatus.FOUND && ui.opponent != null
    val myTier = RankTiers.forTrophies(me?.trophies ?: 0)

    Box(
        modifier = Modifier
            .fillMaxSize()
            // Mockup: radial-gradient(circle at 50% 40%, #2a1642, #0b0716 68%).
            .background(Brush.radialGradient(listOf(Color(0xFF2A1642), Color(0xFF0B0716))))
            .screenInsets()
    ) {
        Column(
            modifier = Modifier.fillMaxSize().padding(34.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            if (!found) {
                // Spinner ring (gold top-arc) around the glowing sun logo.
                Box(modifier = Modifier.size(130.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(130.dp),
                        color = Color(0xFFE8B84B),
                        trackColor = Color(0x33E8B84B),
                        strokeWidth = 3.dp
                    )
                    Image(
                        painter = painterResource(R.drawable.logo_sun),
                        contentDescription = null,
                        modifier = Modifier.size(74.dp)
                    )
                }
                Text(
                    "Finding opponent…",
                    color = Color(0xFFF4D886),
                    style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.ExtraBold),
                    modifier = Modifier.padding(top = 30.dp)
                )
                Text(
                    "Matching you with a player near your rank\nacross all devices",
                    color = Color(0xFF9A8BBF),
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 8.dp)
                )
                // Rank pill — real tier crest + label + trophies.
                Row(
                    modifier = Modifier
                        .padding(top = 20.dp)
                        .background(Color(0x1AE8B84B), RoundedCornerShape(100.dp))
                        .border(1.dp, Color(0x40E8B84B), RoundedCornerShape(100.dp))
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Image(
                        painter = painterResource(RankTiers.drawableFor(myTier.img)),
                        contentDescription = null,
                        modifier = Modifier.size(18.dp)
                    )
                    Text(
                        "${myTier.label} · ~${me?.trophies ?: 0}",
                        color = Color(0xFFF4D886),
                        style = MaterialTheme.typography.labelMedium
                    )
                }
                // Preferred-side picker (parity with web) — only while searching;
                // once found the colours are locked. Changing it re-queues with the
                // new preference (leaveQueue → reset → joinQueue) exactly like web.
                Text(
                    "PREFERRED SIDE",
                    color = Color(0xFF9A8BBF),
                    style = MaterialTheme.typography.labelSmall,
                    letterSpacing = 1.5.sp,
                    modifier = Modifier.padding(top = 26.dp, bottom = 8.dp)
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ColorPrefPill("🔴 Red", colorPref == "red") {
                        if (colorPref != "red") {
                            colorPref = "red"
                            MatchRepository.replaceQueue(mode, "red")
                        }
                    }
                    ColorPrefPill("Either", colorPref == "either") {
                        if (colorPref != "either") {
                            colorPref = "either"
                            MatchRepository.replaceQueue(mode, "either")
                        }
                    }
                    ColorPrefPill("🔵 Blue", colorPref == "blue") {
                        if (colorPref != "blue") {
                            colorPref = "blue"
                            MatchRepository.replaceQueue(mode, "blue")
                        }
                    }
                }
            } else {
                Text(
                    "MATCH FOUND!",
                    color = Color(0xFFF4D886),
                    style = MaterialTheme.typography.labelLarge,
                    letterSpacing = 3.sp,
                    modifier = Modifier.padding(bottom = 30.dp)
                )
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                    // Me — red seat glow.
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Box(
                            modifier = Modifier
                                .border(3.dp, Color(0xB3F07878), androidx.compose.foundation.shape.CircleShape)
                        ) {
                            AvatarView(avatarUrl = me?.avatarUrl, size = 76.dp, frameId = me?.frameId, ring = false)
                        }
                        Text(
                            "You",
                            color = Color(0xFFFFD9D9),
                            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.ExtraBold),
                            modifier = Modifier.padding(top = 8.dp)
                        )
                        CurrencyAmount(
                            kind = CurrencyIconKind.TROPHY,
                            text = (me?.trophies ?: 0).toString(),
                            color = Color(0xFFF0A0A0),
                            style = MaterialTheme.typography.labelSmall
                        )
                    }
                    // VS burst.
                    Box(contentAlignment = Alignment.Center) {
                        Box(
                            modifier = Modifier
                                .size(56.dp)
                                .border(2.dp, Color(0xB3E8B84B), androidx.compose.foundation.shape.CircleShape)
                        )
                        Text(
                            "VS",
                            color = Color(0xFFE8B84B),
                            style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Black)
                        )
                    }
                    // Opponent — blue seat glow.
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Box(
                            modifier = Modifier
                                .border(3.dp, Color(0xB35A96FF), androidx.compose.foundation.shape.CircleShape)
                        ) {
                            AvatarView(avatarUrl = ui.opponent?.avatarUrl, size = 76.dp, frameId = ui.opponent?.frameId, ring = false)
                        }
                        Text(
                            ui.opponent?.displayName ?: "Opponent",
                            color = Color(0xFFDBE6FF),
                            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.ExtraBold),
                            modifier = Modifier.padding(top = 8.dp)
                        )
                        CurrencyAmount(
                            kind = CurrencyIconKind.TROPHY,
                            text = (ui.opponent?.trophies ?: 0).toString(),
                            color = Color(0xFF8FB3FF),
                            style = MaterialTheme.typography.labelSmall
                        )
                    }
                }
                // Cross-play pill — real device classification.
                val device = ui.opponent?.device ?: "web"
                val (icon, label) = when (device) {
                    "mobile" -> "📱" to "Mobile"
                    "tablet" -> "▤" to "Tablet"
                    else -> "💻" to "Web"
                }
                Row(
                    modifier = Modifier
                        .padding(top = 22.dp)
                        .background(Color(0x1F5A96FF), RoundedCornerShape(100.dp))
                        .border(1.dp, Color(0x475A96FF), RoundedCornerShape(100.dp))
                        .padding(horizontal = 13.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text(icon, style = MaterialTheme.typography.labelMedium)
                    Text("Cross-play · opponent on $label", color = Color(0xFFA9C4FF), style = MaterialTheme.typography.labelMedium)
                }
                Text(
                    "Preparing the board…",
                    color = Color(0xFF9A8BBF),
                    style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier.padding(top = 16.dp)
                )
            }

            if (ui.error != null) {
                Text(
                    text = ui.error ?: "",
                    color = Color(0xFFFF8FAE),
                    style = MaterialTheme.typography.labelLarge,
                    modifier = Modifier.padding(top = 16.dp)
                )
            }
        }

        // Cancel — mockup pins it near the bottom, red-tint bordered.
        if (!found) {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 56.dp)
                    .clickable {
                        requestUserExit()
                    }
                    .background(Color(0x1AFF5A6A), RoundedCornerShape(14.dp))
                    .border(1.dp, Color(0x59FF5A6A), RoundedCornerShape(14.dp))
                    .padding(horizontal = 40.dp, vertical = 14.dp)
            ) {
                Text("Cancel", color = Color(0xFFFF8F9C), style = MaterialTheme.typography.labelLarge)
            }
        }
    }
}

/** Preferred-side pill — gold when active, matches web's pill styling. */
@Composable
private fun ColorPrefPill(label: String, active: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clickable(onClick = onClick)
            .background(
                if (active) Color(0x24E8B84B) else Color(0x800F0820),
                RoundedCornerShape(100.dp)
            )
            .border(
                1.dp,
                if (active) Color(0x8CE8B84B) else Color(0x33E8B84B),
                RoundedCornerShape(100.dp)
            )
            .padding(horizontal = 16.dp, vertical = 8.dp)
    ) {
        Text(
            label,
            color = if (active) Color(0xFFF4D886) else Color(0xFF9A8BBF),
            style = MaterialTheme.typography.labelMedium
        )
    }
}
