package com.filipinodama.app.ui.screens.game

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.economy.EconomyRepository
import com.filipinodama.app.data.economy.EconomyResult
import com.filipinodama.app.data.economy.StoreItemDto
import com.filipinodama.app.data.economy.StoreThumb
import com.filipinodama.app.data.economy.equipRequestFor
import com.filipinodama.app.data.economy.isItemEquipped
import com.filipinodama.app.data.economy.storeThumbFor
import com.filipinodama.app.ui.components.LocalSnackbar
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.Ink2
import kotlinx.coroutines.launch

/**
 * The Loadout drawer — what you bring into a match, opened from the dock's left
 * slot. This is the counterpart to Game Modes on the right slot: two buttons,
 * two drawers, no duplication.
 *
 * It equips through exactly the same path the Inventory screen used — cross
 * reference [EconomyRepository.storeItems] against [EconomyRepository.ownedInventory],
 * map with [equipRequestFor], PATCH via [EconomyRepository.equip], derive
 * equipped state with [isItemEquipped] from the real account fields. Nothing
 * about ownership or equipping is reimplemented here.
 *
 * Covers BOARD and SKIN only — what you literally bring to the board. Avatars
 * AND frames are profile identity, not match loadout, so both are equipped from
 * the profile's edit flow (owner directive).
 */
@Composable
fun ColumnScope.LoadoutContent(onBrowseStore: () -> Unit) {
    val authState by AuthRepository.state.collectAsStateWithLifecycle()
    val me = authState.user
    val scope = rememberCoroutineScope()
    val snackbar = LocalSnackbar.current

    var groups by remember { mutableStateOf<Map<String, List<StoreItemDto>>?>(null) }
    var equippingId by remember { mutableStateOf<String?>(null) }

    suspend fun load() {
        val itemsResult = EconomyRepository.storeItems()
        val inventoryResult = EconomyRepository.ownedInventory()
        val allItems = (itemsResult as? EconomyResult.Success)?.data?.items ?: emptyList()
        val ownedIds = (inventoryResult as? EconomyResult.Success)
            ?.data?.inventory?.map { it.itemId }?.toSet() ?: emptySet()
        groups = allItems
            .filter { it.id in ownedIds && it.type in LOADOUT_SLOTS }
            .groupBy { it.type }
    }

    // The drawer's content is disposed when it closes, so this re-runs on every
    // open — which is what we want: equipped state stays fresh if it changed
    // elsewhere (Store purchase, another device).
    LaunchedEffect(me?.id) { load() }

    DrawerTitle("Your Loadout")

    when (val g = groups) {
        null -> Box(
            modifier = Modifier.fillMaxWidth().height(160.dp),
            contentAlignment = Alignment.Center
        ) { CircularProgressIndicator(color = Gold) }

        else -> if (g.isEmpty()) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(vertical = 26.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    "Nothing to equip yet",
                    color = Color(0xFFF4ECD6),
                    style = MaterialTheme.typography.titleMedium
                )
                Text(
                    "Board themes and piece skins you own show up here.",
                    color = Ink2,
                    style = MaterialTheme.typography.bodySmall,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 6.dp, start = 20.dp, end = 20.dp)
                )
                Box(
                    modifier = Modifier
                        .padding(top = 14.dp)
                        .clip(RoundedCornerShape(11.dp))
                        .background(Color(0x1AE8B84B))
                        .border(1.dp, Color(0x4DE8B84B), RoundedCornerShape(11.dp))
                        .clickable(onClick = onBrowseStore)
                        .padding(horizontal = 16.dp, vertical = 10.dp)
                ) {
                    Text("Browse the Store", color = Color(0xFFF4D886), style = MaterialTheme.typography.labelMedium)
                }
            }
        } else {
            LOADOUT_SLOTS.forEach { type ->
                val items = g[type].orEmpty()
                if (items.isEmpty()) return@forEach
                ModeSectionHeader(SLOT_LABELS[type] ?: type)
                // Fixed 3-up rows rather than a nested LazyVerticalGrid: this
                // sheet already scrolls, and nesting a lazy grid in a scrollable
                // column throws on infinite height constraints.
                items.chunked(3).forEach { row ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(9.dp)
                    ) {
                        row.forEach { item ->
                            val equipped = isItemEquipped(
                                item, me?.equippedBoard, me?.equippedSkin, me?.frameId, me?.avatarUrl
                            )
                            LoadoutTile(
                                item = item,
                                equipped = equipped,
                                equipping = equippingId == item.id,
                                modifier = Modifier.weight(1f),
                                onEquip = {
                                    val request = equipRequestFor(item) ?: return@LoadoutTile
                                    equippingId = item.id
                                    scope.launch {
                                        val result = EconomyRepository.equip(request)
                                        equippingId = null
                                        when (result) {
                                            is EconomyResult.Success -> snackbar.show("${item.name} equipped")
                                            is EconomyResult.Failure -> snackbar.show(result.message)
                                        }
                                    }
                                }
                            )
                        }
                        // Keep the last row's tiles the same width as a full row.
                        repeat(3 - row.size) { Box(modifier = Modifier.weight(1f)) }
                    }
                }
            }
        }
    }
}

@Composable
private fun LoadoutTile(
    item: StoreItemDto,
    equipped: Boolean,
    equipping: Boolean,
    onEquip: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(13.dp))
            .background(
                if (equipped) Brush.linearGradient(listOf(Color(0x243FBF6F), Color(0xD91B1030)))
                else Brush.linearGradient(listOf(Color(0xCC1B1030), Color(0xCC1B1030)))
            )
            .then(
                if (equipped) Modifier.border(1.dp, Color(0xB33FBF6F), RoundedCornerShape(13.dp))
                else Modifier
            )
            .clickable(enabled = !equipped && !equipping, onClick = onEquip)
            .padding(7.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .clip(RoundedCornerShape(10.dp))
                .background(Brush.radialGradient(listOf(Color(0xFF2A1740), Color(0xFF160C28)))),
            contentAlignment = Alignment.Center
        ) {
            when (val thumb = storeThumbFor(item)) {
                is StoreThumb.Image -> AsyncImage(
                    model = thumb.url,
                    contentDescription = null,
                    modifier = Modifier.fillMaxSize().padding(8.dp)
                )
                is StoreThumb.Portrait -> AsyncImage(
                    model = thumb.url,
                    contentDescription = null,
                    modifier = Modifier.fillMaxSize().padding(6.dp)
                )
                StoreThumb.Disc -> Box(
                    modifier = Modifier
                        .fillMaxSize(0.6f)
                        .clip(CircleShape)
                        .background(Color(0xFFA0303A))
                )
                else -> {}
            }
            if (equipping) {
                CircularProgressIndicator(color = Gold, modifier = Modifier.size(22.dp))
            }
            if (equipped) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(4.dp)
                        .size(18.dp)
                        .clip(CircleShape)
                        .background(Color(0xFF2F8F5B)),
                    contentAlignment = Alignment.Center
                ) {
                    Text("✓", color = Color.White, style = MaterialTheme.typography.labelSmall)
                }
            }
        }
        Text(
            item.name,
            color = Color(0xFFF4ECD6),
            style = MaterialTheme.typography.labelSmall,
            textAlign = TextAlign.Center,
            maxLines = 1,
            modifier = Modifier.padding(top = 6.dp)
        )
        Text(
            if (equipped) "Equipped" else "Tap to equip",
            color = if (equipped) Color(0xFF6FD79B) else Ink2,
            style = MaterialTheme.typography.labelSmall,
            maxLines = 1
        )
    }
}

/** Order matters — this is the order the sections appear in the drawer. */
private val LOADOUT_SLOTS = listOf("BOARD", "SKIN")

private val SLOT_LABELS = mapOf(
    "BOARD" to "BOARD THEME",
    "SKIN" to "PIECE SKIN"
)
