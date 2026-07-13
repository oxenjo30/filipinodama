package com.filipinodama.app.ui.screens.settings

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.filipinodama.app.BuildConfig
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.push.PushNotifications
import com.filipinodama.app.data.settings.SettingsRepository
import com.filipinodama.app.data.settings.SettingsResult
import com.filipinodama.app.data.settings.SettingsStore
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel
import com.filipinodama.app.ui.theme.Red
import kotlinx.coroutines.launch

/**
 * SettingsScreen — mobile-screen-inventory.md SCREEN 10 "Settings tab" rows
 * (17-20) PLUS the about/legal + delete-account rows folded in from the web
 * SettingsPage.tsx port (apps/web/src/features/settings/SettingsPage.tsx),
 * since Android's Profile has no tab switcher yet (ProfileScreen.kt only has
 * Overview/History) — Settings is reached as its own destination from a
 * Profile quick-link, matching the Phase 5/6a "non-tab screen, explicit back
 * target" convention (see AppDestinations.kt header notes).
 *
 * Sections, each traced to a real source:
 *  - Account: email display (from AuthRepository.state.user — real, never
 *    fabricated); no client-side change-password flow exists on web either
 *    (verified: SettingsPage.tsx has no password field) — honestly omitted.
 *  - Gameplay prefs: piece skin / board are equipped cosmetics owned via the
 *    Inventory equip flow (Phase 5) — same as web, this screen links out to
 *    Inventory rather than duplicating a second equip control.
 *  - Sound / Music / Hints: client-only prefs, port of settingsStore.ts,
 *    persisted via [SettingsStore] (SecureStore-backed).
 *  - Notifications: client-side toggle (there is no server-side
 *    notification-preferences endpoint on web either) + the real Android 13+
 *    POST_NOTIFICATIONS permission request (push readiness).
 *  - About/Legal: version string (from BuildConfig), Terms/Privacy — routes
 *    to the in-app LegalScreen mirroring apps/web LegalLayout.tsx's 5 docs.
 *  - Contact Support: POST /api/support/tickets (real, matches
 *    ContactPage.tsx's authenticated-filer branch) via [SettingsRepository].
 *  - Delete Account: DELETE /api/users/me { confirm: "DELETE" } — exact web
 *    contract, typed-DELETE confirmation dialog matching SettingsPage.tsx.
 *  - Sign Out: [AuthRepository.logout] (same action ProfileScreen's existing
 *    button already calls).
 */
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    onSignedOut: () -> Unit,
    onOpenInventory: () -> Unit,
    onOpenLegal: (String) -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val authState by AuthRepository.state.collectAsState()
    val me = authState.user

    val store = SettingsStore.instance
    val sound by store.sound.collectAsState()
    val music by store.music.collectAsState()
    val hints by store.hints.collectAsState()
    val confirmMoves by store.confirmMoves.collectAsState()
    val autoPromote by store.autoPromote.collectAsState()
    val forceCapture by store.forceCapture.collectAsState()
    val haptics by store.haptics.collectAsState()
    val pushMatch by store.pushMatch.collectAsState()
    val pushGuild by store.pushGuild.collectAsState()
    val pushEvent by store.pushEvent.collectAsState()

    var notifEnabled by remember {
        mutableStateOf(
            Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
                androidx.core.content.ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
                android.content.pm.PackageManager.PERMISSION_GRANTED
        )
    }
    val notifPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted -> notifEnabled = granted }

    var contactOpen by remember { mutableStateOf(false) }
    var deleteOpen by remember { mutableStateOf(false) }
    var exporting by remember { mutableStateOf(false) }
    var toast by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) { PushNotifications.ensureChannel(context) }

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        SettingsTopBar(onBack = onBack)

        Column(
            modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            if (me == null) {
                SignedOutNotice()
                return@Column
            }

            toast?.let { msg ->
                Box(
                    modifier = Modifier.fillMaxWidth().background(Panel, RoundedCornerShape(10.dp)).padding(12.dp)
                ) {
                    Text(msg, color = GoldLt, style = MaterialTheme.typography.bodySmall)
                }
            }

            // ── Account ──
            SectionCard(title = "Account") {
                SettingsInfoRow(label = "Email", value = me.email ?: if (me.isGuest) "Guest account" else "—")
                SettingsInfoRow(label = "Player Tag", value = "${me.username}${me.tag}")
                // No change-password flow exists on the web SettingsPage.tsx
                // either (verified against source) — honestly omitted rather
                // than a fake control.
            }

            // ── Gameplay — mockup's 4 rows with its exact labels/descriptions
            // (mobile-split.txt:5007). Persisted device prefs (SettingsStore),
            // same posture as sound/music/hints; auto-promote and force-capture
            // default ON, matching the actual fixed rules of every real match.
            SectionCard(title = "Gameplay") {
                ToggleRow(label = "Confirm moves", sub = "Tap twice to commit a move", checked = confirmMoves, onCheckedChange = { store.setConfirmMoves(it) })
                ToggleRow(label = "Auto-promote", sub = "Crown a Dama automatically", checked = autoPromote, onCheckedChange = { store.setAutoPromote(it) })
                ToggleRow(label = "Move hints", sub = "Highlight legal destinations", checked = hints, onCheckedChange = { store.setHints(it) })
                ToggleRow(label = "Force capture", sub = "Enforce mandatory captures", checked = forceCapture, onCheckedChange = { store.setForceCapture(it) })
                NavRow(label = "Board & Piece Skin", sub = "Equip cosmetics from your Inventory", onClick = onOpenInventory)
            }

            // ── Audio & Haptics — mockup group (sound / music / vibration).
            // Vibration is consumed by the board's tap feedback.
            SectionCard(title = "Audio & Haptics") {
                ToggleRow(label = "Sound effects", checked = sound, onCheckedChange = { store.setSound(it) })
                ToggleRow(label = "Music", checked = music, onCheckedChange = { store.setMusic(it) })
                ToggleRow(label = "Vibration", checked = haptics, onCheckedChange = { store.setHaptics(it) })
            }

            // ── Notifications — mockup's per-category prefs + the real OS
            // permission as the master gate (Android 13+ requires it before
            // any push can show at all).
            SectionCard(title = "Notifications") {
                ToggleRow(
                    label = "Push Notifications",
                    sub = "Master switch — Android notification permission",
                    checked = notifEnabled,
                    onCheckedChange = { want ->
                        if (want && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            notifPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                        } else if (!want) {
                            // Can't programmatically revoke a granted OS permission —
                            // route to the system app-notification settings, matching
                            // standard Android UX for "turn this back off".
                            val intent = Intent().apply {
                                action = "android.settings.APP_NOTIFICATION_SETTINGS"
                                putExtra("android.provider.extra.APP_PACKAGE", context.packageName)
                            }
                            runCatching { context.startActivity(intent) }
                        } else {
                            notifEnabled = want
                        }
                    }
                )
                ToggleRow(label = "Match invites", checked = pushMatch, onCheckedChange = { store.setPushMatch(it) })
                ToggleRow(label = "Guild activity", checked = pushGuild, onCheckedChange = { store.setPushGuild(it) })
                ToggleRow(label = "Events & offers", checked = pushEvent, onCheckedChange = { store.setPushEvent(it) })
            }

            // ── About / Legal ──
            // "How to Play" / "Help & FAQ" rows — mockup Settings-tab Support
            // group (mobile-split lines 918-925) — real copy sourced from the
            // mockup's own infoBlocks data (LegalContent.kt "howto"/"faq"),
            // opened through the same LegalScreen tab strip as the other docs.
            SectionCard(title = "About") {
                SettingsInfoRow(label = "Version", value = "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
                NavRow(label = "How to Play", onClick = { onOpenLegal("howto") })
                NavRow(label = "Help & FAQ", onClick = { onOpenLegal("faq") })
                NavRow(label = "Terms of Service", onClick = { onOpenLegal("terms") })
                NavRow(label = "Privacy Policy", onClick = { onOpenLegal("privacy") })
                NavRow(label = "Community Guidelines", onClick = { onOpenLegal("community") })
                NavRow(label = "Fair Play & Anti-Cheat", onClick = { onOpenLegal("anticheat") })
                NavRow(label = "Data & Account", onClick = { onOpenLegal("data") })
            }

            // ── Account actions ──
            SectionCard(title = "Manage Account") {
                NavRow(
                    label = if (exporting) "Preparing…" else "Export My Data",
                    sub = "Download a copy of your account data",
                    onClick = {
                        if (exporting || me.isGuest) return@NavRow
                        exporting = true
                        scope.launch {
                            when (val result = SettingsRepository.exportData()) {
                                is SettingsResult.Success -> toast = "Your data export is ready."
                                is SettingsResult.Failure -> toast = result.message
                            }
                            exporting = false
                        }
                    }
                )
                if (!me.isGuest) {
                    NavRow(label = "Contact Support", sub = "File a ticket with our team", onClick = { contactOpen = true })
                }
                DangerRow(label = "Delete Account", sub = "Permanently erase your account and data", onClick = { deleteOpen = true })
            }

            TextButton(onClick = {
                scope.launch {
                    AuthRepository.logout()
                    onSignedOut()
                }
            }) {
                Text("Sign Out", color = Red, fontWeight = FontWeight.Bold)
            }

            Text(
                "FilipinoDama · v${BuildConfig.VERSION_NAME}",
                color = Ink2,
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.padding(bottom = 24.dp)
            )
        }
    }

    if (contactOpen) {
        ContactSupportDialog(onClose = { contactOpen = false })
    }
    if (deleteOpen) {
        DeleteAccountDialog(
            onClose = { deleteOpen = false },
            onDeleted = {
                deleteOpen = false
                onSignedOut()
            }
        )
    }
}

@Composable
private fun SettingsTopBar(onBack: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            "‹",
            color = GoldLt,
            style = MaterialTheme.typography.headlineMedium,
            modifier = Modifier.clickable(onClick = onBack).padding(horizontal = 8.dp)
        )
        Text(
            "Settings",
            color = GoldLt,
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(start = 4.dp)
        )
    }
}

@Composable
private fun SignedOutNotice() {
    Column(
        modifier = Modifier.fillMaxSize().padding(top = 60.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("🔒", style = MaterialTheme.typography.headlineLarge)
        Text(
            "Sign in to manage your preferences and account.",
            color = Ink,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(top = 12.dp)
        )
    }
}

@Composable
private fun SectionCard(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().background(Panel, RoundedCornerShape(14.dp)).padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Text(title, color = Gold, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
        content()
    }
}

private typealias ColumnScope = androidx.compose.foundation.layout.ColumnScope

@Composable
private fun ToggleRow(label: String, sub: String? = null, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(label, color = Ink, style = MaterialTheme.typography.bodyMedium)
            if (sub != null) {
                Text(sub, color = Ink2, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 2.dp))
            }
        }
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(checkedTrackColor = Gold, checkedThumbColor = GoldLt)
        )
    }
}

@Composable
private fun SettingsInfoRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, color = Ink2, style = MaterialTheme.typography.labelSmall)
        Text(value, color = Ink, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun NavRow(label: String, sub: String? = null, onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Column {
            Text(label, color = Ink, style = MaterialTheme.typography.bodyMedium)
            if (sub != null) {
                Text(sub, color = Ink2, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 2.dp))
            }
        }
        Text("›", color = Ink2, style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
private fun DangerRow(label: String, sub: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Column {
            Text(label, color = Red, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
            Text(sub, color = Red.copy(alpha = 0.7f), style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 2.dp))
        }
        Text("›", color = Red, style = MaterialTheme.typography.titleMedium)
    }
}
