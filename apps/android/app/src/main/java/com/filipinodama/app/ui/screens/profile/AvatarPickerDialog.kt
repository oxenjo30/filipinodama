package com.filipinodama.app.ui.screens.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import coil.compose.AsyncImage
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.economy.EconomyRepository
import com.filipinodama.app.data.economy.EconomyResult
import com.filipinodama.app.data.economy.StoreItemDto
import com.filipinodama.app.data.profile.ProfileRepository
import com.filipinodama.app.data.profile.ProfileResult
import com.filipinodama.app.data.profile.UpdateProfileRequest
import com.filipinodama.app.data.profile.resolveAvatarUrl
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel
import kotlinx.coroutines.launch

/**
 * Avatar picker — a port of apps/web AvatarPickerModal.tsx: shows only
 * avatars the player actually OWNS (catalog AVATAR items ∩ GET
 * /api/users/me/export inventory), never the full catalog for free. Tapping
 * a portrait persists the BARE KEY via PATCH /api/users/me { avatarUrl }
 * (ProfileRepository.updateProfile, which also patches AuthRepository so the
 * header recomposes immediately).
 */
@Composable
fun AvatarPickerDialog(onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    var ownedAvatars by remember { mutableStateOf<List<StoreItemDto>?>(null) }
    var loadError by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf<String?>(null) }

    val me = AuthRepository.state.value.user
    val currentKey = remember(me?.avatarUrl) { avatarKeyOf(me?.avatarUrl) }

    LaunchedEffect(Unit) {
        val itemsResult = EconomyRepository.storeItems()
        val invResult = EconomyRepository.ownedInventory()
        val items = (itemsResult as? EconomyResult.Success)?.data?.items
        val owned = (invResult as? EconomyResult.Success)?.data?.inventory?.map { it.itemId }?.toSet()
        if (items == null || owned == null) {
            loadError = true
            ownedAvatars = emptyList()
        } else {
            ownedAvatars = items.filter { it.type == "AVATAR" && it.id in owned }
        }
    }

    Dialog(onDismissRequest = onClose) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(Panel, RoundedCornerShape(20.dp))
                .padding(24.dp)
        ) {
            Text("Your look", color = Gold, style = MaterialTheme.typography.labelMedium)
            Text("Choose Avatar", color = GoldLt, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 4.dp, bottom = 16.dp))

            val list = ownedAvatars
            when {
                list == null && !loadError -> Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Gold)
                }
                loadError -> Text("Couldn't load your avatars. Please try again.", color = Ink2, style = MaterialTheme.typography.bodyMedium)
                list != null && list.isEmpty() -> Text(
                    "You don't own any avatars yet.\nVisit the Store to unlock portraits.",
                    color = Ink2,
                    style = MaterialTheme.typography.bodyMedium
                )
                list != null -> LazyVerticalGrid(
                    columns = GridCells.Fixed(4),
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(list) { item ->
                        val key = item.id
                        val equipped = key == currentKey
                        val busy = saving == key
                        Box(
                            modifier = Modifier
                                .aspectRatio(1f)
                                .clip(RoundedCornerShape(14.dp))
                                .border(3.dp, if (equipped) Gold else Ink2.copy(alpha = 0.2f), RoundedCornerShape(14.dp))
                                .clickable(enabled = saving == null) {
                                    if (key == currentKey) {
                                        onClose()
                                        return@clickable
                                    }
                                    saving = key
                                    scope.launch {
                                        val result = ProfileRepository.updateProfile(UpdateProfileRequest(avatarUrl = key))
                                        saving = null
                                        if (result is ProfileResult.Success) onClose()
                                    }
                                }
                        ) {
                            AsyncImage(
                                model = resolveAvatarUrl(key),
                                contentDescription = item.name,
                                modifier = Modifier.fillMaxSize()
                            )
                            if (busy) {
                                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                    CircularProgressIndicator(color = Gold)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/** The avatar key an existing avatarUrl resolves to, mirroring AvatarPickerModal.tsx's avatarKeyOf(). */
private fun avatarKeyOf(avatarUrl: String?): String {
    if (avatarUrl.isNullOrBlank()) return "champion"
    val file = avatarUrl.substringAfterLast('/')
    return file.replace(Regex("\\.[a-z0-9]+$", RegexOption.IGNORE_CASE), "")
}
