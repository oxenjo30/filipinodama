package com.filipinodama.app.ui.screens.settings

import com.filipinodama.app.ui.components.royalDialogPanel
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.filipinodama.app.data.social.BlockRepository
import com.filipinodama.app.data.social.BlockedUser
import com.filipinodama.app.data.social.SocialResult
import com.filipinodama.app.ui.screens.profile.AvatarView
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel
import com.filipinodama.app.ui.theme.Red
import kotlinx.coroutines.launch

/**
 * Blocked Players dialog — Settings' view + unblock surface for UGC safety
 * (Task 9), a Compose port of the same list web's SettingsPage.tsx exposes.
 * Loads GET /api/blocks via [BlockRepository.list] on open; each row shows
 * the blocked player's identity and an Unblock action wired to
 * DELETE /api/blocks/:userId via [BlockRepository.unblock]. Follows the
 * same dialog/state-holder convention as [DeleteAccountDialog] /
 * [ContactSupportDialog] in this same package.
 */
@Composable
fun BlockedPlayersDialog(onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    var players by remember { mutableStateOf<List<BlockedUser>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var unblockingId by remember { mutableStateOf<String?>(null) }

    fun load() {
        scope.launch {
            when (val result = BlockRepository.list()) {
                is SocialResult.Success -> {
                    players = result.data.blocked
                    error = null
                }
                is SocialResult.Failure -> error = result.message
            }
        }
    }

    LaunchedEffect(Unit) { load() }

    Dialog(onDismissRequest = onClose) {
        Column(
            modifier = Modifier.fillMaxWidth().royalDialogPanel().padding(22.dp)
        ) {
            Text("Blocked Players", color = GoldLt, style = MaterialTheme.typography.titleMedium)
            Text(
                "Blocked players can't message you, invite you, or see your profile activity.",
                color = Ink2,
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.padding(top = 4.dp, bottom = 14.dp)
            )

            when {
                error != null -> Text(error!!, color = Red, style = MaterialTheme.typography.bodySmall)
                players == null -> Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Gold)
                }
                players!!.isEmpty() -> Text(
                    "You haven't blocked anyone.",
                    color = Ink,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(vertical = 12.dp)
                )
                else -> LazyColumn(modifier = Modifier.heightIn(max = 360.dp)) {
                    items(players!!, key = { it.id }) { p ->
                        BlockedPlayerRow(
                            player = p,
                            busy = unblockingId == p.id,
                            onUnblock = {
                                unblockingId = p.id
                                scope.launch {
                                    when (BlockRepository.unblock(p.id)) {
                                        is SocialResult.Success -> players = players?.filter { it.id != p.id }
                                        is SocialResult.Failure -> {}
                                    }
                                    unblockingId = null
                                }
                            }
                        )
                    }
                }
            }

            Row(modifier = Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = onClose) { Text("Close", color = Gold) }
            }
        }
    }
}

@Composable
private fun BlockedPlayerRow(player: BlockedUser, busy: Boolean, onUnblock: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        AvatarView(avatarUrl = player.avatarUrl, size = 40.dp, ring = false)
        Column(modifier = Modifier.weight(1f).padding(start = 12.dp)) {
            Text(player.displayName, color = Ink, style = MaterialTheme.typography.bodyMedium)
            Text(player.tag, color = Ink2, style = MaterialTheme.typography.labelSmall)
        }
        Text(
            if (busy) "…" else "Unblock",
            color = GoldLt,
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier
                .clickable(enabled = !busy, onClick = onUnblock)
                .background(androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.25f), RoundedCornerShape(8.dp))
                .padding(horizontal = 12.dp, vertical = 8.dp)
        )
    }
}
