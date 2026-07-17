package com.filipinodama.app.ui.components

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import kotlinx.coroutines.launch

/**
 * Pull-to-refresh wrapper.
 *
 * IMPORTANT — this is NOT a cosmetic spinner. The whole point is to RE-FETCH that
 * screen's real data from the server so the user pulls to get late/updated data
 * (new matches, balances, notifications, guild state…). [onRefresh] MUST call the
 * screen's actual repository reload (the same thing its LaunchedEffect runs on
 * entry). The gold indicator shows while that suspend fetch is in flight and hides
 * when it returns.
 *
 * Wrap a screen's scrollable content (a LazyColumn, or a verticalScroll Column):
 *
 *   PullRefreshContainer(onRefresh = { NotificationsRepository.load() }) {
 *       LazyColumn { … }   // must be independently scrollable for the pull gesture
 *   }
 *
 * [onRefresh] is a suspend lambda; the indicator stays until it completes (errors
 * are the screen's own concern — it should surface them via its normal error
 * state; this wrapper just stops the indicator when the suspend returns/throws).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PullRefreshContainer(
    onRefresh: suspend () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    var refreshing by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val state = rememberPullToRefreshState()

    PullToRefreshBox(
        isRefreshing = refreshing,
        onRefresh = {
            refreshing = true
            scope.launch {
                try {
                    onRefresh()
                } finally {
                    refreshing = false
                }
            }
        },
        modifier = modifier.fillMaxSize(),
        state = state,
        indicator = {
            // Royal-gold indicator instead of the default Material purple.
            PullToRefreshDefaults.Indicator(
                state = state,
                isRefreshing = refreshing,
                modifier = Modifier,
                color = Color(0xFFE8B84B),
                containerColor = Color(0xFF1E1134),
            )
        },
    ) {
        content()
    }
}
