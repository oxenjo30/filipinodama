package com.filipinodama.app.ui.screens.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.economy.EconomyRepository
import com.filipinodama.app.data.economy.EconomyResult
import com.filipinodama.app.data.economy.EquipRequest
import com.filipinodama.app.data.economy.StoreItemDto
import com.filipinodama.app.data.profile.ProfileRepository
import com.filipinodama.app.data.profile.ProfileResult
import com.filipinodama.app.data.profile.UpdateProfileRequest
import com.filipinodama.app.data.profile.resolveAvatarUrl
import com.filipinodama.app.data.profile.resolveFrameUrl
import com.filipinodama.app.ui.theme.Gold
import kotlinx.coroutines.launch

/**
 * Edit Avatar sheet — mobile-screen-inventory.md `avEditShow` modal, rebuilt
 * 1:1 against handoffv3/FilipinoDama Mobile.dc.html lines 1860-1932 (Tier-2
 * UI-fidelity pass). The mockup is ONE bottom sheet combining a live
 * avatar+frame preview, an avatar grid, AND a profile-frame grid, with a
 * single "Save Changes" button — the prior Android build split this into two
 * separate dialogs (AvatarPickerDialog with avatar-only grid + immediate
 * per-tap save, EditProfileDialog with no frame picker at all) and dropped
 * frame-picking entirely.
 *
 * Frame-picking IS real, wired functionality even though apps/web's own
 * AvatarPickerModal.tsx/EditProfileModal.tsx never built the mockup's frame
 * half (verified by reading both files) — a FRAME item is equipped through
 * the same PATCH /api/users/me/equip route already used by Inventory/Store
 * (EconomyRepository.equip(EquipRequest(frame = itemId)), which persists to
 * User.frameId and patches AuthRepository so every screen's frame render
 * updates immediately). Per the mockup being the 1:1 source of truth, this
 * sheet wires the frame grid to that real endpoint rather than leaving the
 * mockup's frame half unbuilt.
 *
 * Both grids are OWNERSHIP-gated (catalog AVATAR/FRAME items intersected
 * with GET /users/me/export inventory) — never the full catalog for free,
 * matching AvatarPickerModal.tsx's ownership rule for avatars and applying
 * the identical rule to frames (a paid FRAME must not appear pickable before
 * purchase). Selecting a tile stages a draft (mirrors mockup's
 * draftAv/draftFr); nothing persists until "Save Changes" — unlike the old
 * per-tap-immediate-save avatar picker.
 */
@Composable
fun AvatarPickerDialog(onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    val me = AuthRepository.state.value.user

    var ownedAvatars by remember { mutableStateOf<List<StoreItemDto>?>(null) }
    var ownedFrames by remember { mutableStateOf<List<StoreItemDto>?>(null) }
    var loadError by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }

    val startKey = remember(me?.avatarUrl) { avatarKeyOf(me?.avatarUrl) }
    var draftAvatar by remember { mutableStateOf(startKey) }
    var draftFrame by remember { mutableStateOf(me?.frameId) }

    LaunchedEffect(Unit) {
        val itemsResult = EconomyRepository.storeItems()
        val invResult = EconomyRepository.ownedInventory()
        val items = (itemsResult as? EconomyResult.Success)?.data?.items
        val owned = (invResult as? EconomyResult.Success)?.data?.inventory?.map { it.itemId }?.toSet()
        if (items == null || owned == null) {
            loadError = true
            ownedAvatars = emptyList()
            ownedFrames = emptyList()
        } else {
            ownedAvatars = items.filter { it.type == "AVATAR" && it.id in owned }
            ownedFrames = items.filter { it.type == "FRAME" && it.id in owned }
        }
    }

    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        // Bottom-anchor the sheet inside the dialog window (it's styled like a
        // bottom sheet — top-only rounded corners, sheet chrome — but a bare
        // Dialog centers its content by default, which made it render
        // floating/centered instead of docked to the bottom edge).
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.BottomCenter) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = 640.dp)
                .background(
                    androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Color(0xFF1A0F30), Color(0xFF120A22))),
                    RoundedCornerShape(24.dp, 24.dp, 0.dp, 0.dp)
                )
                .border(1.dp, Color(0x59E8B84B), RoundedCornerShape(24.dp, 24.dp, 0.dp, 0.dp))
                // Lift the whole sheet above the system nav/gesture bar so the
                // pinned "Save Changes" footer isn't half-hidden behind it
                // (owner-reported: the button sat too low, cut off at the bottom).
                .navigationBarsPadding()
        ) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(20.dp, 18.dp, 20.dp, 14.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text("Edit Avatar", color = Color(0xFFF4D886), style = MaterialTheme.typography.titleLarge)
                    Text("Choose your look & profile frame", color = Color(0xFF9A8BBF), style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 2.dp))
                }
                // 48dp min touch target (visible chip stays 34dp) + a11y label.
                Box(
                    modifier = Modifier.size(48.dp)
                        .clickable(onClick = onClose)
                        .semantics { contentDescription = "Close" },
                    contentAlignment = Alignment.Center
                ) {
                    Box(
                        modifier = Modifier.size(34.dp)
                            .background(Color(0x4D000000), RoundedCornerShape(10.dp))
                            .border(1.dp, Color(0x33E8B84B), RoundedCornerShape(10.dp)),
                        contentAlignment = Alignment.Center
                    ) { Text("✕", color = Color(0xFF9A8BBF), style = MaterialTheme.typography.titleMedium) }
                }
            }

            when {
                ownedAvatars == null && !loadError -> Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Gold)
                }
                loadError -> Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) {
                    Text("Couldn't load your avatars. Please try again.", color = Color(0xFF9A8BBF), style = MaterialTheme.typography.bodyMedium)
                }
                else -> Column(
                    // weight(1f) so this content SCROLLS in the space above the
                    // pinned Save footer, instead of pushing the button off-screen.
                    modifier = Modifier.fillMaxWidth().weight(1f, fill = false).verticalScroll(rememberScrollState()).padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(22.dp)
                ) {
                    // Live preview: avatar + frame overlay.
                    Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                        Box(modifier = Modifier.size(152.dp), contentAlignment = Alignment.Center) {
                            AsyncImage(
                                model = resolveAvatarUrl(draftAvatar),
                                contentDescription = null,
                                modifier = Modifier.size(92.dp).clip(CircleShape)
                                    .border(3.dp, Color(0x99E8B84B), CircleShape)
                            )
                            val frameUrl = resolveFrameUrl(draftFrame)
                            if (frameUrl != null) {
                                AsyncImage(model = frameUrl, contentDescription = null, modifier = Modifier.size(152.dp))
                            }
                        }
                    }

                    // Avatar grid.
                    Column {
                        Text("AVATAR", color = Color(0xFF8B7CAE), style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(bottom = 10.dp))
                        val avatars = ownedAvatars ?: emptyList()
                        LazyVerticalGrid(
                            columns = GridCells.Fixed(4),
                            horizontalArrangement = Arrangement.spacedBy(9.dp),
                            verticalArrangement = Arrangement.spacedBy(9.dp),
                            modifier = Modifier.fillMaxWidth().heightIn(max = 320.dp).height((((avatars.size + 4) / 4) * 78).dp)
                        ) {
                            items(avatars) { item ->
                                val selected = item.id == draftAvatar
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Box(
                                        modifier = Modifier.size(52.dp)
                                            .clip(CircleShape)
                                            .border(2.dp, if (selected) Color(0xFFF0CF72) else Color(0x59E8B84B), CircleShape)
                                            .clickable { draftAvatar = item.id },
                                        contentAlignment = Alignment.Center
                                    ) {
                                        AsyncImage(model = resolveAvatarUrl(item.id), contentDescription = item.name, modifier = Modifier.size(52.dp))
                                        if (selected) {
                                            Box(
                                                modifier = Modifier.align(Alignment.TopEnd).size(16.dp)
                                                    .background(Color(0xF23FBF6F), CircleShape),
                                                contentAlignment = Alignment.Center
                                            ) { Text("✓", color = Color(0xFF0A1F12), style = MaterialTheme.typography.labelSmall) }
                                        }
                                    }
                                    Text(item.name, color = Color(0xFFC9BCE6), style = MaterialTheme.typography.labelSmall, maxLines = 1, modifier = Modifier.padding(top = 3.dp))
                                }
                            }
                        }
                        if (avatars.isEmpty()) {
                            Text("You don't own any avatars yet. Visit the Store to unlock portraits.", color = Color(0xFF9A8BBF), style = MaterialTheme.typography.bodySmall)
                        }
                    }

                    // Frame grid.
                    Column {
                        Text("PROFILE FRAME", color = Color(0xFF8B7CAE), style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(bottom = 10.dp))
                        val frames = ownedFrames ?: emptyList()
                        LazyVerticalGrid(
                            columns = GridCells.Fixed(2),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier.fillMaxWidth().height((((frames.size + 2) / 2 + 1) * 92).dp)
                        ) {
                            // "None" tile always first.
                            item {
                                FrameTile(label = "None", frameUrl = null, isNone = true, selected = draftFrame == null) { draftFrame = null }
                            }
                            items(frames) { item ->
                                FrameTile(label = item.name, frameUrl = resolveFrameUrl(item.id), isNone = false, selected = draftFrame == item.id) { draftFrame = item.id }
                            }
                        }
                    }
                }
            }

            // "Save Changes" — a PINNED footer OUTSIDE the scroll (mockup keeps
            // the primary CTA fixed at the sheet's bottom). Only shown once the
            // grids have loaded (hidden while loading / on load error).
            if (ownedAvatars != null && !loadError) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = 20.dp, end = 20.dp, top = 6.dp, bottom = 20.dp)
                        .clickable(enabled = !saving) {
                            saving = true
                            scope.launch {
                                if (draftAvatar != startKey) {
                                    ProfileRepository.updateProfile(UpdateProfileRequest(avatarUrl = draftAvatar))
                                }
                                if (draftFrame != me?.frameId) {
                                    EconomyRepository.equip(EquipRequest(frame = draftFrame ?: ""))
                                }
                                saving = false
                                onClose()
                            }
                        }
                        .background(androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Color(0xFFEFC25A), Color(0xFFC9971F))), RoundedCornerShape(12.dp))
                        .padding(vertical = 14.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(if (saving) "Saving…" else "Save Changes", color = Color(0xFF2A1608), style = MaterialTheme.typography.titleMedium)
                }
            }
        }
        }
    }
}

@Composable
private fun FrameTile(label: String, frameUrl: String?, isNone: Boolean, selected: Boolean, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .background(
                if (selected) androidx.compose.ui.graphics.Brush.linearGradient(listOf(Color(0x33E8B84B), Color(0xD91B1030)))
                else androidx.compose.ui.graphics.Brush.linearGradient(listOf(Color(0xB31B1030), Color(0xB31B1030))),
                RoundedCornerShape(14.dp)
            )
            .border(1.dp, if (selected) Color(0xBFE8B84B) else Color(0x24E8B84B), RoundedCornerShape(14.dp))
            .padding(vertical = 9.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(modifier = Modifier.size(60.dp), contentAlignment = Alignment.Center) {
            Box(
                modifier = Modifier.size(38.dp)
                    .background(
                        androidx.compose.ui.graphics.Brush.radialGradient(listOf(Color(0xFF2A1740), Color(0xFF160C28))),
                        CircleShape
                    )
                    .border(1.dp, Color(0x40E8B84B), CircleShape)
            )
            if (frameUrl != null) {
                AsyncImage(model = frameUrl, contentDescription = null, modifier = Modifier.size(60.dp))
            }
            if (isNone) {
                Text("None", color = Color(0xFF6F6091), style = MaterialTheme.typography.labelSmall)
            }
        }
        Text(label, color = Color(0xFFC9BCE6), style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 6.dp))
    }
}

/** The avatar key an existing avatarUrl resolves to, mirroring AvatarPickerModal.tsx's avatarKeyOf(). */
private fun avatarKeyOf(avatarUrl: String?): String {
    if (avatarUrl.isNullOrBlank()) return "champion"
    val file = avatarUrl.substringAfterLast('/')
    return file.replace(Regex("\\.[a-z0-9]+$", RegexOption.IGNORE_CASE), "")
}
