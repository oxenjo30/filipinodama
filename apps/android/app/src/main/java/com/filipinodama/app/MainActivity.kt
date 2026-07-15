package com.filipinodama.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.filipinodama.app.data.ApiClient
import com.filipinodama.app.data.audio.SoundManager
import com.filipinodama.app.data.push.PushNotifications
import com.filipinodama.app.navigation.AppNavHost
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
        enableEdgeToEdge()
        setContent {
            FilipinoDamaTheme {
                AppNavHost()
            }
        }
    }
}
