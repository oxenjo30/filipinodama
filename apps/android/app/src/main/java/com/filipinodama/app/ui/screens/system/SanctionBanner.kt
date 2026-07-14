package com.filipinodama.app.ui.screens.system

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.filipinodama.app.data.AuthRepository

/**
 * Sanction banner — a top notice shown to a signed-in user who is currently
 * MUTED or BANNED. Now driven by real server data: publicUser() (and so
 * AuthUser.sanction) exposes the in-session mute/ban state.
 *
 * A ban is normally rejected at the auth guard (403 at login/refresh), so in
 * practice this mainly surfaces MUTES — the only sanction that keeps a user
 * signed in while silencing their chat, which they'd otherwise have no way to
 * understand. It disappears on its own when the sanction expires and the next
 * /me reports muted=false. (This replaces the earlier documented deferral —
 * the server change that kdoc anticipated has now landed.)
 */
@Composable
fun SanctionBanner(modifier: Modifier = Modifier) {
    val authState by AuthRepository.state.collectAsState()
    val s = authState.user?.sanction
    if (s == null || (!s.muted && !s.banned)) return

    val banned = s.banned
    val label = if (banned) {
        "Your account is suspended ${untilLabel(s.bannedUntil)}."
    } else {
        "You've been muted ${untilLabel(s.mutedUntil)} — you can't send chat messages."
    }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(
                Brush.verticalGradient(
                    if (banned) listOf(Color(0xFF5A1522), Color(0xFF3A0E18))
                    else listOf(Color(0xFF5A3A1A), Color(0xFF3A2410))
                )
            )
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text(if (banned) "⛔" else "🔇", style = MaterialTheme.typography.titleMedium)
        Text(
            label,
            color = Color(0xFFF7E6C8),
            style = MaterialTheme.typography.labelMedium
        )
    }
}

/** "for about 3h" / "for about 2d" / "indefinitely" from the sanction end ISO. */
private fun untilLabel(iso: String?): String {
    if (iso == null) return "indefinitely"
    return try {
        val ms = java.time.Instant.parse(iso).toEpochMilli() - System.currentTimeMillis()
        if (ms <= 0) return "shortly"
        val h = Math.round(ms / 3_600_000.0).toInt()
        if (h < 24) "for about ${h}h" else "for about ${Math.round(h / 24.0).toInt()}d"
    } catch (e: Exception) {
        "indefinitely"
    }
}
