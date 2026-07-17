package com.filipinodama.app.ui.screens.rooms

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.filipinodama.app.data.ApiClient
import com.filipinodama.app.data.rooms.LiveMatchItemDto
import com.filipinodama.app.data.rooms.RoomsApi
import com.filipinodama.app.ui.components.CurrencyAmount
import com.filipinodama.app.ui.components.CurrencyIconKind
import com.filipinodama.app.ui.components.PullRefreshContainer
import com.filipinodama.app.ui.components.screenInsets
import com.filipinodama.app.ui.screens.game.GameButton
import com.filipinodama.app.ui.screens.game.GameButtonVariant
import com.filipinodama.app.ui.theme.Blue
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel
import com.filipinodama.app.ui.theme.Red
import kotlinx.coroutines.launch

/**
 * Live Match Browser — mobile-screen-inventory.md SCREEN 22 (`{{ isLive }}`,
 * lines 2530-2568), "Watch Live" from the Home hub strip. Ported from
 * apps/web/src/features/watch/WatchPage.tsx: GET /api/matches/live -> items
 * (plain live matches + synthetic open-room entries). Every field is real —
 * no fabricated viewer counts or ratings.
 *
 * Watch routing: a plain match item -> spectate-by-id (matchId); a room item
 * (`room=true`, `code` present) -> spectate-by-room-code, mirroring
 * WatchPage.tsx's `m.room && m.code ? navigate("/rooms?code=...&spectate=1") : navigate("/play/online?spectate=...")`.
 */
@Composable
fun LiveMatchBrowserScreen(
    onWatchMatch: (matchId: String) -> Unit,
    onWatchRoom: (code: String) -> Unit
) {
    val api: RoomsApi = remember { ApiClient.create() }
    var items by remember { mutableStateOf<List<LiveMatchItemDto>?>(null) } // null = loading
    var liveCount by remember { mutableStateOf(0) }
    var loadError by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    suspend fun load() {
        loadError = false
        try {
            val envelope = api.live()
            if (envelope.ok && envelope.data != null) {
                items = envelope.data.items
                liveCount = envelope.data.liveCount
            } else {
                items = emptyList()
                loadError = true
            }
        } catch (_: Exception) {
            items = emptyList()
            loadError = true
        }
    }

    LaunchedEffect(Unit) { load() }

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).screenInsets().padding(20.dp)) {
        // Mockup title row is "Watch Live" + an inline pulsing "Live" pill on
        // the SAME row (no separate eyebrow) — mobile-split.txt lines 2533-2541.
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Watch Live", color = GoldLt, style = MaterialTheme.typography.headlineMedium)
            Box(
                modifier = Modifier
                    .background(Color(0x29FF5A6A), RoundedCornerShape(999.dp))
                    .border(1.dp, Color(0x80FF5A6A), RoundedCornerShape(999.dp))
                    .padding(horizontal = 10.dp, vertical = 4.dp)
            ) {
                Text("● Live", color = Color(0xFFFF8F9C), style = MaterialTheme.typography.labelSmall)
            }
        }
        Text(
            "Tune in to matches happening right now across FilipinoDama.",
            color = Ink,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.padding(top = 6.dp)
        )

        val current = items
        // Pull down anywhere on the list/empty/error state to RE-FETCH live
        // matches from the server (load() — the same call the entry
        // LaunchedEffect and the Retry button run), so a pull gets the
        // latest live matches, not a cosmetic spinner.
        PullRefreshContainer(onRefresh = { load() }) {
        when {
            current == null -> Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                CircularProgressIndicator(color = Gold)
            }
            loadError -> Column(
                modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(top = 40.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text("Couldn't load live matches — try again.", color = Ink2, style = MaterialTheme.typography.bodyMedium)
                GameButton(
                    "Retry",
                    onClick = { scope.launch { load() } },
                    modifier = Modifier.padding(top = 14.dp).fillMaxWidth(0.5f)
                )
            }
            current.isEmpty() -> Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    "No live matches right now — check back soon, or jump into Play to start one yourself.",
                    color = Ink2,
                    style = MaterialTheme.typography.bodyMedium
                )
            }
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize().padding(top = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(current, key = { it.id }) { m ->
                    LiveMatchCard(m, onWatch = {
                        if (m.room && m.code != null) onWatchRoom(m.code) else onWatchMatch(m.id)
                    })
                }
            }
        }
        } // PullRefreshContainer
    }
}

@Composable
private fun LiveMatchCard(m: LiveMatchItemDto, onWatch: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onWatch)
            .background(Panel, RoundedCornerShape(14.dp))
            .border(1.dp, Gold.copy(alpha = 0.2f), RoundedCornerShape(14.dp))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(m.mode, color = if (m.mode == "RANKED") Blue else Gold, style = MaterialTheme.typography.labelSmall)
                if (m.room) {
                    Text("🔑 Room", color = Gold, style = MaterialTheme.typography.labelSmall)
                }
            }
            Text("👁 ${m.viewers}", color = Ink2, style = MaterialTheme.typography.labelMedium)
        }
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.weight(1f)) {
                Text(m.red?.displayName ?: "Red", color = Red, style = MaterialTheme.typography.titleSmall)
                CurrencyAmount(kind = CurrencyIconKind.TROPHY, text = (m.red?.trophies ?: 0).toString(), color = Ink2, style = MaterialTheme.typography.labelSmall)
            }
            Text("VS", color = Gold, style = MaterialTheme.typography.titleSmall)
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.weight(1f)) {
                Text(m.blue?.displayName ?: "Blue", color = Blue, style = MaterialTheme.typography.titleSmall)
                CurrencyAmount(kind = CurrencyIconKind.TROPHY, text = (m.blue?.trophies ?: 0).toString(), color = Ink2, style = MaterialTheme.typography.labelSmall)
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Move ${m.moveCount}", color = Ink2, style = MaterialTheme.typography.labelSmall)
            Text("Watch →", color = GoldLt, style = MaterialTheme.typography.labelMedium)
        }
    }
}

