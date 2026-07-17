package com.filipinodama.app.ui.screens.economy

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.filipinodama.app.data.economy.EconomyResult
import com.filipinodama.app.data.tournaments.TournamentDisplay
import com.filipinodama.app.data.tournaments.TournamentListItemDto
import com.filipinodama.app.data.tournaments.TournamentsRepository
import com.filipinodama.app.ui.components.CurrencyIcon
import com.filipinodama.app.ui.components.CurrencyIconKind
import com.filipinodama.app.ui.components.PullRefreshContainer
import com.filipinodama.app.ui.components.screenInsets
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel

/**
 * Tournaments list — reached from the Home hub's Tournaments strip.
 *
 * The mockup (`FilipinoDama Mobile.dc.html`) has NO dedicated full-screen
 * tournaments list; its "Tournaments" section (split-file lines 393-414) is
 * an admin-controlled block embedded directly on Home, with each row's exact
 * shape (status pill, name, format, prize, players-registered) at lines
 * 397-412. This screen reuses that EXACT row markup/spacing as its own body
 * (a status-bar app-bar + scrollable list of those same rows), since the
 * task calls for "a simple list screen 1:1 from the mockup's cups list rows"
 * when no larger dedicated screen exists in the source.
 *
 * Wired to the real, server-backed GET /api/tournaments (only OPEN/RUNNING
 * rows — apps/server/src/modules/tournaments.ts) via [TournamentsRepository]
 * — no fabricated data. Rows navigate to [TournamentDetailScreen] (mockup's
 * `tourdetail` screen / SCREEN 9) via [onOpenDetail].
 */
@Composable
fun TournamentsListScreen(onBack: () -> Unit = {}, onOpenDetail: (String) -> Unit = {}) {
    var items by remember { mutableStateOf<List<TournamentListItemDto>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun loadTournaments() {
        when (val result = TournamentsRepository.list()) {
            is EconomyResult.Success -> { items = result.data.items; error = null }
            is EconomyResult.Failure -> error = result.message
        }
    }

    LaunchedEffect(Unit) { loadTournaments() }

    Column(modifier = Modifier.fillMaxSize().screenInsets().background(MaterialTheme.colorScheme.background)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(20.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("‹", color = GoldLt, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.clickable(onClick = onBack).padding(end = 12.dp))
            Text("Tournaments", color = GoldLt, style = MaterialTheme.typography.titleLarge)
        }

        // Pull down to RE-FETCH the tournaments list from the server
        // (loadTournaments() — the same call the entry LaunchedEffect runs),
        // not a cosmetic spinner.
        PullRefreshContainer(onRefresh = { loadTournaments() }) {
        when {
            error != null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(error ?: "", color = Ink2, style = MaterialTheme.typography.bodyMedium)
            }
            items == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Gold)
            }
            items!!.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    "None running · check back soon",
                    color = Ink2,
                    style = MaterialTheme.typography.bodyMedium
                )
            }
            else -> Column(
                modifier = Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 20.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items!!.forEach { t -> TournamentRow(t, onClick = { onOpenDetail(t.id) }) }
                Box(Modifier.padding(bottom = 20.dp))
            }
        }
        } // PullRefreshContainer
    }
}

/** Row shape ported verbatim from the mockup's Tournaments section (split-file lines 397-412). */
@Composable
private fun TournamentRow(item: TournamentListItemDto, onClick: () -> Unit) {
    val pill = TournamentDisplay.statusPill(item.status)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .background(Panel, RoundedCornerShape(16.dp))
            .padding(16.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(
                modifier = Modifier
                    .background(Color(pill.backgroundArgb), RoundedCornerShape(100.dp))
                    .padding(horizontal = 9.dp, vertical = 3.dp)
            ) {
                Text(pill.label, color = Color(pill.colorArgb), style = MaterialTheme.typography.labelSmall)
            }
            Text(item.name, color = Color(0xFFF4ECD6), style = MaterialTheme.typography.titleSmall)
        }
        Text(
            TournamentDisplay.formatLabel(item),
            color = Ink2,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.padding(top = 6.dp)
        )
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 9.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                CurrencyIcon(kind = CurrencyIconKind.COIN, size = 15.dp)
                Text("${item.prizePoolGold}", color = Color(0xFFF0CF72), style = MaterialTheme.typography.labelMedium)
            }
            Text(TournamentDisplay.playersLabel(item), color = Ink2, style = MaterialTheme.typography.labelMedium)
        }
    }
}
