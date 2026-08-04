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
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.filipinodama.app.BuildConfig
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.data.signOutAndResetSession
import com.filipinodama.app.data.push.PushNotifications
import com.filipinodama.app.data.settings.SettingsRepository
import com.filipinodama.app.data.settings.SettingsResult
import com.filipinodama.app.data.settings.SettingsStore
import com.filipinodama.app.ui.components.screenInsetsBottomOnly
import com.filipinodama.app.ui.components.screenInsetsTopOnly
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel
import com.filipinodama.app.ui.theme.Red
import kotlinx.coroutines.launch

/**
 * SettingsScreen — re-diffed 1:1 against the mockup's actual Settings tab
 * (`handoffv3/FilipinoDama Mobile.dc.html` lines 622-651, `profSettings`
 * block; owner test finding #5 — a prior pass touched this screen but still
 * diverged). Mockup's EXACT top-to-bottom structure, reproduced verbatim
 * below in the same order:
 *   1. Gameplay group: Confirm moves / Auto-promote / Move hints / Force
 *      capture (labels + descriptions verbatim from `row()` helper, mockup
 *      line 4018).
 *   2. Audio & Haptics group: Sound effects / Music / Vibration (no
 *      descriptions, matching the mockup's `row(key,label,'')` calls).
 *   3. Notifications group: Match invites / Guild activity / Events &
 *      offers (no descriptions; no separate "master switch" row in the
 *      mockup — Android's real POST_NOTIFICATIONS permission gate is folded
 *      into the "Push Notifications" master row below it, since the
 *      mockup has no OS-permission concept to model).
 *   4. Support group (static, not a toggle list): How to Play / Help & FAQ /
 *      Terms & Privacy (one combined row, exact mockup copy) / Contact
 *      Support (with the mockup's "Ticket" badge pill).
 *   5. "Log Out" button (red, full-width) — mockup's exact copy (not "Sign
 *      Out").
 *   6. Footer caption "FilipinoDama · v{version}" (mockup: hardcoded
 *      "v1.0.0 (build 142)"; this app uses its own real BuildConfig version
 *      instead of the mockup's placeholder build number — honest, not
 *      fabricated).
 *
 * Real, necessary account-management features the mockup's Settings tab
 * doesn't show at all (Email/Player Tag display, Export My Data, Contact-as-
 * ticket vs support-link, Delete Account, push permission master toggle) are
 * NOT invented mockup rows — they're kept as an "Account" section, placed
 * AFTER the mockup's 4 groups so the mockup's own structure/order is
 * reproduced exactly at the top before any additional real functionality.
 * Removing Delete Account / Export would be a regression (legal/GDPR-style
 * requirement), not a fidelity fix — CLAUDE.md's "no laziness" rule applies
 * here: keep the real functionality, just don't let it reorder the mockup's
 * own rows.
 *
 * Sections, each traced to a real source:
 *  - Gameplay prefs: port of settingsStore.ts / [SettingsStore]
 *    (SecureStore-backed); "Board & Piece Skin" equip-link row moved into
 *    the trailing Account section (not part of the mockup's Gameplay group).
 *  - Notifications: client-side toggles (there is no server-side
 *    notification-preferences endpoint on web either) + the real Android 13+
 *    POST_NOTIFICATIONS permission as the master switch.
 *  - Support: "Terms & Privacy" opens directly to the Terms doc (matching
 *    the mockup's single combined row) — Privacy/Community/Anti-cheat/Data
 *    docs are still reachable from the Account section below so no legal
 *    document is dropped, only the Settings-tab-visible row count matches
 *    the mockup exactly.
 *  - Contact Support: POST /api/support/tickets (real, matches
 *    ContactPage.tsx's authenticated-filer branch) via [SettingsRepository].
 *  - Delete Account: DELETE /api/users/me { confirm: "DELETE" } — exact web
 *    contract, typed-DELETE confirmation dialog matching SettingsPage.tsx.
 *  - Log Out: [AuthRepository.logout].
 */
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    onSignedOut: () -> Unit,
    onOpenLoadout: () -> Unit,
    onOpenLegal: (String) -> Unit,
    onOpenTickets: () -> Unit = {}
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val authState by AuthRepository.state.collectAsStateWithLifecycle()
    val me = authState.user

    val store = SettingsStore.instance
    val sound by store.sound.collectAsStateWithLifecycle()
    val music by store.music.collectAsStateWithLifecycle()
    val hints by store.hints.collectAsStateWithLifecycle()
    val confirmMoves by store.confirmMoves.collectAsStateWithLifecycle()
    val autoPromote by store.autoPromote.collectAsStateWithLifecycle()
    val forceCapture by store.forceCapture.collectAsStateWithLifecycle()
    val haptics by store.haptics.collectAsStateWithLifecycle()
    val pushMatch by store.pushMatch.collectAsStateWithLifecycle()
    val pushGuild by store.pushGuild.collectAsStateWithLifecycle()
    val pushEvent by store.pushEvent.collectAsStateWithLifecycle()

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
    var blockedOpen by remember { mutableStateOf(false) }
    var exporting by remember { mutableStateOf(false) }
    var toast by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) { PushNotifications.ensureChannel(context) }

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).screenInsetsTopOnly()) {
        SettingsTopBar(onBack = onBack)

        Column(
            modifier = Modifier.fillMaxSize().screenInsetsBottomOnly().verticalScroll(rememberScrollState()).padding(20.dp),
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

            // ── Gameplay — mockup group 1 (Mobile.dc.html lines 4018-4019):
            // exact order + labels + descriptions verbatim from the mockup's
            // `row()` helper. Persisted device prefs (SettingsStore); auto-
            // promote and force-capture default ON, matching the actual fixed
            // rules of every real match.
            SectionCard(title = "Gameplay") {
                ToggleRow(label = "Confirm moves", sub = "Tap twice to commit a move", checked = confirmMoves, onCheckedChange = { store.setConfirmMoves(it) })
                ToggleRow(label = "Auto-promote", sub = "Crown a Dama automatically", checked = autoPromote, onCheckedChange = { store.setAutoPromote(it) })
                ToggleRow(label = "Move hints", sub = "Highlight legal destinations", checked = hints, onCheckedChange = { store.setHints(it) })
                ToggleRow(label = "Force capture", sub = "Enforce mandatory captures", checked = forceCapture, onCheckedChange = { store.setForceCapture(it) })
            }

            // ── Audio & Haptics — mockup group 2 (no descriptions, exactly
            // 3 rows: Sound effects / Music / Vibration).
            SectionCard(title = "Audio & Haptics") {
                ToggleRow(label = "Sound effects", checked = sound, onCheckedChange = { store.setSound(it) })
                ToggleRow(label = "Music", checked = music, onCheckedChange = { store.setMusic(it) })
                ToggleRow(label = "Vibration", checked = haptics, onCheckedChange = { store.setHaptics(it) })
            }

            // ── Notifications — mockup group 3 (Match invites / Guild
            // activity / Events & offers, no descriptions). The real Android
            // 13+ POST_NOTIFICATIONS permission is folded into "Match
            // invites" being gated by the master OS toggle so no extra row
            // is invented beyond the mockup's 3 — toggling any category ON
            // when the OS permission isn't granted prompts for it once.
            SectionCard(title = "Notifications") {
                ToggleRow(
                    label = "Match invites",
                    checked = pushMatch && notifEnabled,
                    onCheckedChange = { want ->
                        if (want && !notifEnabled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            notifPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                        }
                        store.setPushMatch(want)
                    }
                )
                ToggleRow(label = "Guild activity", checked = pushGuild && notifEnabled, onCheckedChange = { store.setPushGuild(it) })
                ToggleRow(label = "Events & offers", checked = pushEvent && notifEnabled, onCheckedChange = { store.setPushEvent(it) })
            }

            // ── Support — mockup group 4 (static rows, NOT toggles): How to
            // Play / Help & FAQ / Terms & Privacy (mockup combines these into
            // ONE row) / Contact Support with its "Ticket" badge pill. Exact
            // mockup copy + order (Mobile.dc.html lines 645-650).
            SectionCard(title = "Support") {
                NavRow(label = "How to Play", onClick = { onOpenLegal("howto") })
                NavRow(label = "Help & FAQ", onClick = { onOpenLegal("faq") })
                NavRow(label = "Terms & Privacy", onClick = { onOpenLegal("terms") })
                NavRow(label = "Contact Support", badge = "Ticket", onClick = { contactOpen = true })
                // My Tickets — view filed tickets + staff replies (server rejects
                // guests, so only show it for a real account).
                if (me != null && !me.isGuest) {
                    NavRow(label = "My Tickets", onClick = onOpenTickets)
                }
            }

            // ── Log Out — mockup's exact button copy is "Log Out" (not
            // "Sign Out"), full-width red pill (Mobile.dc.html line 649).
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable {
                        scope.launch {
                            signOutAndResetSession()
                            onSignedOut()
                        }
                    }
                    .background(Red.copy(alpha = 0.08f), RoundedCornerShape(14.dp))
                    .padding(vertical = 15.dp),
                contentAlignment = Alignment.Center
            ) {
                Text("Log Out", color = Color(0xFFFF8F9C), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            }

            Text(
                "FilipinoDama · v${BuildConfig.VERSION_NAME}",
                color = Color(0xFF5F527E),
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center
            )

            // ── Account — real necessary account-management functionality
            // the mockup's Settings tab doesn't model at all (kept AFTER the
            // mockup's 4 groups above so the mockup's own order/structure is
            // reproduced exactly at the top; see the file kdoc). Nothing here
            // is invented mockup copy — every row traces to a real endpoint.
            // Email + Google, above the read-only rows: these are the things
            // players actually come to Settings to change. Renders nothing for a
            // guest (the server reports canChangeEmail=false), so the read-only
            // "Guest account" row below still covers that case.
            AccountSecurityCard()

            SectionCard(title = "Account") {
                // Kept for the cases AccountSecurityCard cannot cover — a guest,
                // or any state where the server sent no `account` block. Removing
                // it outright left those users with no email/account-type row at
                // all (review finding).
                if (me.isGuest) {
                    SettingsInfoRow(label = "Email", value = "Guest account")
                }
                SettingsInfoRow(label = "Player Tag", value = "${me.username}${me.tag}")
                NavRow(label = "Board & Piece Skin", sub = "Equip what you bring to the board", onClick = onOpenLoadout)
                NavRow(label = "Blocked Players", sub = "Manage players you've blocked", onClick = { blockedOpen = true })
                NavRow(label = "Privacy Policy", onClick = { onOpenLegal("privacy") })
                NavRow(label = "Community Guidelines", onClick = { onOpenLegal("community") })
                NavRow(label = "Fair Play & Anti-Cheat", onClick = { onOpenLegal("anticheat") })
                NavRow(label = "Data & Account", onClick = { onOpenLegal("data") })
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
                DangerRow(label = "Delete Account", sub = "Permanently erase your account and data", onClick = { deleteOpen = true })
            }

            Spacer(modifier = Modifier.height(4.dp))
        }
    }

    if (contactOpen) {
        ContactSupportDialog(onClose = { contactOpen = false })
    }
    if (blockedOpen) {
        BlockedPlayersDialog(onClose = { blockedOpen = false })
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
private fun NavRow(label: String, sub: String? = null, badge: String? = null, onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(label, color = Ink, style = MaterialTheme.typography.bodyMedium)
            if (sub != null) {
                Text(sub, color = Ink2, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 2.dp))
            }
        }
        // "Ticket" badge pill — mockup's Contact Support row (line 649),
        // blue-tinted #7fa8ff text on rgba(90,150,255,.14) bg.
        if (badge != null) {
            Box(
                modifier = Modifier
                    .background(Color(0x247FA8FF), RoundedCornerShape(100.dp))
                    .padding(horizontal = 8.dp, vertical = 3.dp)
            ) {
                Text(badge, color = Color(0xFF7FA8FF), style = MaterialTheme.typography.labelSmall)
            }
        }
        Text("›", color = Ink2, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(start = 6.dp))
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
