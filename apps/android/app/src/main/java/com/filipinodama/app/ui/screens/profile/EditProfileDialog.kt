package com.filipinodama.app.ui.screens.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.profile.ProfileRepository
import com.filipinodama.app.ui.components.RoyalPrimaryButton
import com.filipinodama.app.ui.components.royalDialogPanel
import com.filipinodama.app.data.profile.ProfileResult
import com.filipinodama.app.data.profile.UpdateProfileRequest
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel
import kotlinx.coroutines.launch

/**
 * Edit Profile dialog — a port of apps/web EditProfileModal.tsx. Persisted
 * fields go through PATCH /api/users/me { displayName, bio } exactly like
 * web; Player Tag is server-assigned and shown read-only (never editable via
 * the API — matches EditProfileModal.tsx's honesty about persistence).
 *
 * "Change Avatar" opens [AvatarPickerDialog] — as of the Tier-2 UI-fidelity
 * pass that dialog is the mockup's combined avatar+profile-frame sheet
 * (`avEditShow`, mobile-split lines 1860-1932), not an avatar-only picker.
 * apps/web's own EditProfileModal/AvatarPickerModal never built the mockup's
 * frame half (verified against both files' source), but the mockup is the
 * 1:1 source of truth and the equip route already supports frames — see
 * AvatarPickerDialog's kdoc for the full rationale.
 */
@Composable
fun EditProfileDialog(onClose: () -> Unit, onChangeAvatar: () -> Unit) {
    val scope = rememberCoroutineScope()
    val me = AuthRepository.state.value.user

    var name by remember { mutableStateOf(me?.displayName ?: "") }
    var bio by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        name = me?.displayName ?: ""
    }

    Dialog(onDismissRequest = onClose) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .royalDialogPanel()
                // Scroll so a large accessibility font / open keyboard can't push
                // the Save CTA off-screen (the versionCode-12 unreachable-CTA class).
                .verticalScroll(rememberScrollState())
                .padding(24.dp)
        ) {
            Text("Your profile", color = Gold, style = MaterialTheme.typography.labelMedium)
            Text("Edit Profile", color = GoldLt, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 4.dp, bottom = 18.dp))

            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 18.dp)) {
                AvatarView(avatarUrl = me?.avatarUrl, frameId = me?.frameId, size = 64.dp)
                TextButton(onClick = { onClose(); onChangeAvatar() }, modifier = Modifier.padding(start = 12.dp)) {
                    Text("Change Avatar", color = GoldLt)
                }
            }

            Text("DISPLAY NAME", color = GoldLt, style = MaterialTheme.typography.labelSmall)
            OutlinedTextField(
                value = name,
                onValueChange = { if (it.length <= 20) name = it },
                modifier = Modifier.fillMaxWidth().padding(top = 6.dp, bottom = 16.dp),
                singleLine = true,
                colors = OutlinedTextFieldDefaults.colors(focusedTextColor = androidx.compose.ui.graphics.Color.White, unfocusedTextColor = androidx.compose.ui.graphics.Color.White)
            )

            Text("PLAYER TAG", color = GoldLt, style = MaterialTheme.typography.labelSmall)
            Text(
                me?.tag ?: "",
                color = Ink,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = 6.dp, bottom = 4.dp)
            )
            Text("Tags are assigned automatically.", color = Ink2, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(bottom = 16.dp))

            Text("BIO", color = GoldLt, style = MaterialTheme.typography.labelSmall)
            OutlinedTextField(
                value = bio,
                onValueChange = { if (it.length <= 90) bio = it },
                modifier = Modifier.fillMaxWidth().height(90.dp).padding(top = 6.dp, bottom = 20.dp),
                placeholder = { Text("Say something about your play style…", color = Ink2) },
                colors = OutlinedTextFieldDefaults.colors(focusedTextColor = androidx.compose.ui.graphics.Color.White, unfocusedTextColor = androidx.compose.ui.graphics.Color.White)
            )

            RoyalPrimaryButton(
                label = if (saving) "Saving…" else "Save Changes",
                enabled = !saving,
                modifier = Modifier.padding(top = 22.dp),
                onClick = {
                    saving = true
                    scope.launch {
                        val trimmed = name.trim().ifEmpty { me?.displayName ?: "" }
                        val result = ProfileRepository.updateProfile(
                            UpdateProfileRequest(displayName = trimmed, bio = bio.trim())
                        )
                        saving = false
                        if (result is ProfileResult.Success) onClose()
                    }
                }
            )
            Row(horizontalArrangement = Arrangement.Center, modifier = Modifier.fillMaxWidth().padding(top = 10.dp)) {
                TextButton(onClick = onClose, enabled = !saving) { Text("Cancel", color = Ink2) }
            }
        }
    }
}
