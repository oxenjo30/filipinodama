package com.filipinodama.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.filipinodama.app.data.ApiClient
import com.filipinodama.app.data.audio.SoundManager
import com.filipinodama.app.data.push.PushNotifications
import com.filipinodama.app.navigation.AppNavHost
import com.filipinodama.app.navigation.DeepLinks
import com.filipinodama.app.ui.theme.FilipinoDamaTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Pre-UI startup init must NEVER throw uncaught — an exception here dies
        // before any UI draws, which shows up as "installs but won't open,
        // nothing happens" on the affected device (this bit some newer Android
        // 14+/16 flagships via EncryptedSharedPreferences; now hardened in
        // SecureStore, and guarded here defensively too so no future startup
        // init can silently brick launch). A degraded launch beats a dead app.
        runCatching { ApiClient.init(applicationContext) }
        // Push readiness (Phase 7): create the notification channel up front
        // so it exists before any future notification (local or FCM-based)
        // is ever posted into it. Idempotent — see PushNotifications kdoc.
        runCatching { PushNotifications.ensureChannel(applicationContext) }
        // Audio (loading music + board SFX). Init is just stashing the context;
        // playback is always gated by the Sound/Music settings toggles.
        runCatching { SoundManager.init(applicationContext) }
        // App Links cold start: the room invite that launched us. Parked in
        // DeepLinks and replayed by AppNavHost once Splash has resolved the
        // session, since Splash's goClearingStack() would wipe an earlier
        // navigation. Guarded like the inits above — a malformed link must
        // never take the launch down.
        runCatching { DeepLinks.offer(intent) }
        enableEdgeToEdge()
        setContent {
            FilipinoDamaTheme {
                AppNavHost()
            }
        }
    }

    /**
     * App Links warm start — tapping a room invite while the app is already
     * running. Reached because the activity is launchMode="singleTask".
     *
     * singleTop is NOT sufficient here, and this was measured rather than
     * assumed: the application sets android:taskAffinity="" (a deliberate API
     * 26-30 task-hijack mitigation, see the manifest). With no affinity there
     * is no task for an incoming VIEW intent to be matched into, so the intent
     * — which arrives with FLAG_ACTIVITY_NEW_TASK from a browser or `am start`
     * — starts its OWN task, and singleTop only ever de-duplicates within a
     * single task. dumpsys confirmed two live MainActivity records (t122 and
     * t125) in one process. Two nav hosts over the process-scoped
     * AuthRepository / MatchRepository / RoomRepository would then drive one
     * socket. singleTask instead routes the intent to the existing instance
     * wherever it lives, which is safe here because this is a single-activity
     * app: singleTask's "clear activities above it" behaviour has nothing to
     * clear.
     *
     * setIntent() keeps getIntent() truthful for anything that reads it later.
     */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        runCatching { DeepLinks.offer(intent) }
    }
}
