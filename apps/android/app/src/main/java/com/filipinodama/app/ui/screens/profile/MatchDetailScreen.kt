package com.filipinodama.app.ui.screens.profile

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.profile.MatchDetailDto
import com.filipinodama.app.data.profile.ProfileRepository
import com.filipinodama.app.data.profile.ProfileResult
import com.filipinodama.app.ui.components.CurrencyAmount
import com.filipinodama.app.ui.components.CurrencyIconKind
import com.filipinodama.app.ui.components.MockupBackButton
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Green
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Red

/**
 * MatchDetailScreen — mobile-screen-inventory.md SCREEN 29 (`isMatchDetail`,
 * data-screen-label="Match detail", mockup lines 2296-2319), an intermediate
 * screen between a match-history row (Profile History tab / Public Profile
 * recent matches) and the full ReplayViewerScreen board playback.
 *
 * GET /api/matches/:id (apps/server/src/modules/matches.ts:242, serializeMatch)
 * already returns every real field this screen needs: winner, mode,
 * redTrophyDelta/blueTrophyDelta, redCaptures/blueCaptures (server-derived
 * from moves[], matches.ts:43-56), moveCount, startedAt/endedAt, and both
 * player rows. [ProfileRepository.matchDetail] is the exact same call
 * ReplayViewerScreen already makes for this matchId — reused as-is.
 *
 * CRITICAL — anti-fabrication: the mockup's `mdRows` are hardcoded demo
 * literals (`Duration:'8m 14s'`, `Your captures:'11'`, chosen by win/loss).
 * None of those literals are copied here. Every one of the 7 rows below is
 * computed from the real [MatchDetailDto]:
 *   Result          -> real winner vs. the local player's side
 *   Game mode       -> real m.mode
 *   Duration        -> endedAt - startedAt (both real timestamps); the row
 *                       is OMITTED (not faked) if endedAt is missing, e.g. an
 *                       in-progress LOCAL row shouldn't happen here but the
 *                       guard is honest either way
 *   Your captures   -> real captures for the local player's side
 *   Pieces lost     -> real captures by the OPPONENT's side
 *   Moves           -> real m.moveCount
 *   Trophies        -> real signed trophy delta for the local player's side
 */
@Composable
fun MatchDetailScreen(
    matchId: String,
    onBack: () -> Unit,
    onOpenProfile: (String) -> Unit,
    onWatchReplay: (String) -> Unit
) {
    val meId = AuthRepository.state.value.user?.id ?: ""

    var match by remember { mutableStateOf<MatchDetailDto?>(null) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var retryTick by remember { mutableStateOf(0) }

    LaunchedEffect(matchId, retryTick) {
        match = null
        loadError = null
        when (val result = ProfileRepository.matchDetail(matchId)) {
            is ProfileResult.Success -> match = result.data.match
            is ProfileResult.Failure -> loadError = result.message
        }
    }

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 44.dp, start = 16.dp, end = 16.dp, bottom = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            MockupBackButton(onClick = onBack)
            Text(
                "MATCH DETAIL",
                color = Color(0xFF8B7CAE),
                style = MaterialTheme.typography.labelMedium,
                letterSpacing = 2.sp
            )
        }

        when {
            loadError != null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(loadError ?: "Could not load this match.", color = Ink2, style = MaterialTheme.typography.bodyMedium)
                    Text(
                        "Retry",
                        color = GoldLt,
                        style = MaterialTheme.typography.labelLarge,
                        modifier = Modifier.padding(top = 12.dp).clickable { retryTick++ }
                    )
                }
            }
            match == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Gold)
            }
            else -> {
                val m = match!!
                val info = matchDetailInfo(m, meId)

                Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                    // Result banner
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(info.resultBg, RoundedCornerShape(20.dp))
                            .border(1.dp, Color(0x2EE8B84B), RoundedCornerShape(20.dp))
                            .padding(22.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(info.resultLabel, color = info.resultColor, style = MaterialTheme.typography.headlineMedium)
                        Text(
                            info.modeLabel,
                            color = Color(0xFFB6A8D4),
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(top = 4.dp)
                        )
                        Box(
                            modifier = Modifier
                                .padding(top = 12.dp)
                                .background(Color.Black.copy(alpha = 0.25f), RoundedCornerShape(100.dp))
                                .padding(horizontal = 14.dp, vertical = 6.dp)
                        ) {
                            CurrencyAmount(
                                kind = CurrencyIconKind.TROPHY,
                                text = info.deltaLabel,
                                color = info.deltaColor,
                                style = MaterialTheme.typography.titleMedium
                            )
                        }
                    }

                    // Opponent row — tappable -> Public Profile
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 12.dp)
                            .clickable(enabled = info.opponentId != null) { info.opponentId?.let(onOpenProfile) }
                            .background(Color(0xCC1B1030), RoundedCornerShape(16.dp))
                            .border(1.dp, Color(0x24E8B84B), RoundedCornerShape(16.dp))
                            .padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        AvatarView(avatarUrl = info.opponentAvatarUrl, frameId = info.opponentFrameId, size = 44.dp)
                        Column(modifier = Modifier.weight(1f).padding(start = 12.dp)) {
                            Text("Opponent", color = Color(0xFF8B7CAE), style = MaterialTheme.typography.labelSmall)
                            Text(info.opponentName, color = Color(0xFFF4ECD6), style = MaterialTheme.typography.titleMedium)
                        }
                        if (info.opponentId != null) {
                            Text("›", color = Color(0xFF8B7CAE), style = MaterialTheme.typography.headlineSmall)
                        }
                    }

                    Text(
                        "Match stats",
                        color = Color(0xFF8B7CAE),
                        style = MaterialTheme.typography.labelMedium,
                        letterSpacing = 1.5.sp,
                        modifier = Modifier.padding(top = 22.dp, start = 4.dp, bottom = 12.dp)
                    )

                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color(0xCC1B1030), RoundedCornerShape(16.dp))
                            .border(1.dp, Color(0x1FE8B84B), RoundedCornerShape(16.dp))
                    ) {
                        info.rows.forEachIndexed { index, row ->
                            // Thin top-divider on every row after the first, mirroring the
                            // mockup's Order-Summary-style stat table (border-top per row).
                            if (index > 0) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(1.dp)
                                        .background(Color(0x12E8B84B))
                                )
                            }
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 15.dp, vertical = 13.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(row.first, color = Color(0xFF9A8BBF), style = MaterialTheme.typography.bodyMedium)
                                Text(row.second, color = Color(0xFFE6DCF5), style = MaterialTheme.typography.titleSmall)
                            }
                        }
                    }

                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 20.dp)
                            .clickable { onWatchReplay(matchId) }
                            .background(
                                androidx.compose.ui.graphics.Brush.verticalGradient(
                                    listOf(Color(0xFFEFC25A), Color(0xFFC9971F))
                                ),
                                RoundedCornerShape(12.dp)
                            )
                            .padding(vertical = 15.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("▶ Watch replay", color = Color(0xFF1A0F2E), style = MaterialTheme.typography.labelLarge)
                    }
                }
            }
        }
    }
}

private data class MatchDetailInfo(
    val resultLabel: String,
    val resultColor: Color,
    val resultBg: Color,
    val modeLabel: String,
    val deltaLabel: String,
    val deltaColor: Color,
    val opponentId: String?,
    val opponentName: String,
    val opponentAvatarUrl: String?,
    val opponentFrameId: String?,
    val rows: List<Pair<String, String>>
)

/** Builds every displayed value from the real [MatchDetailDto] — see file kdoc's anti-fabrication note. */
private fun matchDetailInfo(m: MatchDetailDto, meId: String): MatchDetailInfo {
    val iAmRed = m.red?.id == meId
    val opponent = if (iAmRed) m.blue else m.red
    val opponentName = opponent?.displayName
        ?: if (m.mode == "AI" || m.mode == "LOCAL") "Computer" else "Opponent"

    val outcome = when {
        m.winner == "draw" || m.winner == null -> "draw"
        (m.winner == "red") == iAmRed -> "win"
        else -> "loss"
    }
    val resultLabel = when (outcome) {
        "win" -> "Victory"
        "loss" -> "Defeat"
        else -> "Draw"
    }
    val resultColor = when (outcome) {
        "win" -> Green
        "loss" -> Red
        else -> Color(0xFFC9A4FF)
    }
    val resultBg = when (outcome) {
        "win" -> Color(0x243FBF6F)
        "loss" -> Color(0x24D93B52)
        else -> Color(0x24C9A4FF)
    }

    val myDelta = if (iAmRed) m.redTrophyDelta else m.blueTrophyDelta
    val deltaLabel = if (myDelta == null) "+0" else "${if (myDelta > 0) "+" else ""}$myDelta"
    val deltaColor = when {
        myDelta == null || myDelta == 0 -> Color(0xFF8B7CAE)
        myDelta > 0 -> Green
        else -> Red
    }

    val myCaptures = if (iAmRed) m.redCaptures else m.blueCaptures
    val piecesLost = if (iAmRed) m.blueCaptures else m.redCaptures

    val duration = matchDuration(m.startedAt, m.endedAt)

    val rows = buildList {
        add("Result" to (if (outcome == "win") "Win" else if (outcome == "loss") "Loss" else "Draw"))
        add("Game mode" to modeLabelFull(m.mode))
        if (duration != null) add("Duration" to duration)
        add("Your captures" to myCaptures.toString())
        add("Pieces lost" to piecesLost.toString())
        add("Moves" to m.moveCount.toString())
        add("Trophies" to deltaLabel)
    }

    return MatchDetailInfo(
        resultLabel = resultLabel,
        resultColor = resultColor,
        resultBg = resultBg,
        modeLabel = modeLabelFull(m.mode),
        deltaLabel = deltaLabel,
        deltaColor = deltaColor,
        opponentId = opponent?.id,
        opponentName = opponentName,
        opponentAvatarUrl = opponent?.avatarUrl,
        opponentFrameId = opponent?.frameId,
        rows = rows
    )
}

/** Real elapsed time between the two REAL server timestamps — never a fabricated duration. */
private fun matchDuration(startedAtIso: String, endedAtIso: String?): String? {
    if (endedAtIso == null) return null
    return try {
        val start = java.time.Instant.parse(startedAtIso).toEpochMilli()
        val end = java.time.Instant.parse(endedAtIso).toEpochMilli()
        val totalSeconds = ((end - start) / 1000).coerceAtLeast(0)
        val minutes = totalSeconds / 60
        val seconds = totalSeconds % 60
        "${minutes}m ${seconds}s"
    } catch (e: Exception) {
        null
    }
}

private fun modeLabelFull(mode: String): String = when (mode) {
    "AI" -> "vs AI"
    "CASUAL" -> "Casual"
    "RANKED" -> "Ranked"
    "PRIVATE" -> "Private"
    "LOCAL" -> "Local"
    else -> mode
}
