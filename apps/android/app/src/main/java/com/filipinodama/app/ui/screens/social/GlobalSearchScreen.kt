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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
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
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import com.filipinodama.app.data.engine.RankTiers
import com.filipinodama.app.data.social.SearchRepository
import com.filipinodama.app.data.social.SocialResult
import com.filipinodama.app.data.social.UserSearchResultDto
import com.filipinodama.app.ui.components.CurrencyAmount
import com.filipinodama.app.ui.components.CurrencyIconKind
import com.filipinodama.app.ui.screens.profile.AvatarView
import kotlinx.coroutines.delay

/**
 * Global Player Search — mockup `{{ gsOpen }}` overlay (mobile-split.txt
 * lines 3004-3036), the destination for Home's magnifier/search icon.
 * Confirmed missing in the UI-fidelity sweep: Home's search button existed
 * and was wired to a callback, but AppNavHost passed an empty no-op lambda
 * and no screen/route existed anywhere in the app. GET /api/users/search is
 * real and already used by the web client's equivalent modal (see
 * SearchApi.kt) — this is a genuine, previously-unbuilt feature, not a
 * missing-backend case.
 *
 * Full-screen (mockup is a fixed overlay; ported as a nav destination since
 * Android screens are route-based, not overlay-based): search input with
 * magnifier + close, live-filtered results (debounced ~250ms, matching the
 * web modal's debounce), empty state, row -> public profile.
 */
@Composable
fun GlobalSearchScreen(onClose: () -> Unit, onOpenProfile: (String) -> Unit) {
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<UserSearchResultDto>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }

    LaunchedEffect(query) {
        val q = query.trim()
        if (q.length < 2) {
            results = emptyList()
            loading = false
            return@LaunchedEffect
        }
        loading = true
        delay(250) // debounce, matches web's GlobalPlayerSearchModal DEBOUNCE_MS
        when (val r = SearchRepository.searchUsers(q)) {
            is SocialResult.Success -> results = r.data.items
            is SocialResult.Failure -> results = emptyList()
        }
        loading = false
    }

    val trimmed = query.trim()
    val noResults = trimmed.length >= 2 && !loading && results.isEmpty()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xB8060312))
            .padding(top = 12.dp, start = 16.dp, end = 16.dp, bottom = 20.dp)
    ) {
        // Search bar: magnifier + input + close, mockup lines 3006-3010.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xE61B1030), RoundedCornerShape(14.dp))
                .border(1.dp, Color(0x40E8B84B), RoundedCornerShape(14.dp))
                .padding(horizontal = 14.dp, vertical = 2.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text("🔍", color = Color(0xFF8B7CAE), style = MaterialTheme.typography.titleMedium)
            Box(modifier = Modifier.weight(1f)) {
                if (query.isEmpty()) {
                    Text(
                        "Search players by name or tag…",
                        color = Color(0xFF6F6091),
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
                BasicTextField(
                    value = query,
                    onValueChange = { query = it },
                    singleLine = true,
                    textStyle = TextStyle(color = Color(0xFFEFE7FB), fontSize = MaterialTheme.typography.bodyMedium.fontSize),
                    cursorBrush = androidx.compose.ui.graphics.SolidColor(Color(0xFFE8B84B)),
                    modifier = Modifier.fillMaxWidth().padding(vertical = 13.dp)
                )
            }
            Text(
                "✕",
                color = Color(0xFF8B7CAE),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.clickable(onClick = onClose).padding(4.dp)
            )
        }

        Box(Modifier.padding(top = 12.dp).weight(1f)) {
            when {
                loading -> Box(Modifier.fillMaxSize().padding(top = 40.dp), contentAlignment = Alignment.TopCenter) {
                    CircularProgressIndicator(color = Color(0xFFE8B84B))
                }
                noResults -> Column(
                    modifier = Modifier.fillMaxWidth().padding(top = 50.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("No players found", color = Color(0xFFF4D886), style = MaterialTheme.typography.titleMedium)
                    Text(
                        "Try a different name or tag.",
                        color = Color(0xFF8B7CAE),
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = 6.dp)
                    )
                }
                else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(results) { p -> SearchResultRow(p, onClick = { onOpenProfile(p.id) }) }
                }
            }
        }
    }
}

@Composable
private fun SearchResultRow(p: UserSearchResultDto, onClick: () -> Unit) {
    val tier = RankTiers.forTrophies(p.trophies)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .background(Color(0xD91B1030), RoundedCornerShape(14.dp))
            .border(1.dp, Color(0x24E8B84B), RoundedCornerShape(14.dp))
            .padding(horizontal = 13.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        AvatarView(avatarUrl = p.avatarUrl, size = 44.dp, frameId = p.frameId)
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                Text(p.displayName, color = Color.White, style = MaterialTheme.typography.titleSmall)
                Text(p.tag, color = Color(0xFF8B7CAE), style = MaterialTheme.typography.labelSmall)
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.padding(top = 3.dp)) {
                Text(tier.label, color = Color(0xFFC9A4FF), style = MaterialTheme.typography.labelSmall)
                Text("·", color = Color(0xFFC9A4FF), style = MaterialTheme.typography.labelSmall)
                CurrencyAmount(kind = CurrencyIconKind.TROPHY, text = p.trophies.toString(), color = Color(0xFFC9A4FF), style = MaterialTheme.typography.labelSmall)
            }
        }
        Text("View ›", color = Color(0xFFF4D886), style = MaterialTheme.typography.labelMedium)
    }
}
