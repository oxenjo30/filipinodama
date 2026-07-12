package com.filipinodama.app.data.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build

/**
 * Push-readiness scaffolding — NO live push in this phase (no Firebase/FCM
 * dependency added; that needs the owner's google-services.json + Firebase
 * project setup, explicitly out of this phase's boundaries). What IS real
 * here:
 *   1. A single [NotificationChannel] ("match_and_social") that any future
 *      local OR remote notification would post into, created once at app
 *      start (idempotent — createNotificationChannel is a no-op if the
 *      channel already exists with the same id).
 *   2. The Android 13+ (API 33+) runtime POST_NOTIFICATIONS permission is
 *      requested from [com.filipinodama.app.ui.screens.settings.SettingsScreen]
 *      (see NOTIFICATION_PERMISSION in AndroidManifest.xml + the permission
 *      launcher wired in that screen) — matching web's client-side
 *      notification-prefs toggles (there is no server-side push-token
 *      registration endpoint on the web client either; web has no push at
 *      all, it relies on in-app polling/socket events).
 *
 * STUB HOOK for a later phase: [onPushTokenReady] is where an FCM
 * `FirebaseMessaging.getInstance().token` callback would eventually call in
 * to POST the device token to a (currently nonexistent) server endpoint —
 * documented here, not implemented, since there is no server-side route to
 * receive it yet and no Firebase project configured. See apps/android/README.md
 * "Push notifications (future work)" for the exact steps enabling this later.
 */
object PushNotifications {

    const val CHANNEL_ID = "match_and_social"

    /** Idempotent — safe to call on every app start (MainActivity.onCreate). */
    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val existing = manager.getNotificationChannel(CHANNEL_ID)
        if (existing != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Matches & Social",
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = "Match invites, friend requests, guild activity, and support replies."
        }
        manager.createNotificationChannel(channel)
    }

    /**
     * STUB — not wired to anything real. When FCM is added (see README),
     * this is where the device token handoff to the server would begin:
     * `SettingsApi`/a new endpoint POSTing { token } for this account, so
     * the server can target a push at this device. Left as a documented
     * no-op rather than a half-built call to a nonexistent route.
     */
    fun onPushTokenReady(token: String) {
        // Intentionally empty — see kdoc above and README "Push notifications".
    }
}
