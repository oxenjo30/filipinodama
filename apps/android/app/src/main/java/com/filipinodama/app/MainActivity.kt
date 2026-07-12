package com.filipinodama.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.filipinodama.app.data.ApiClient
import com.filipinodama.app.data.push.PushNotifications
import com.filipinodama.app.navigation.AppNavHost
import com.filipinodama.app.ui.theme.FilipinoDamaTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ApiClient.init(applicationContext)
        // Push readiness (Phase 7): create the notification channel up front
        // so it exists before any future notification (local or FCM-based)
        // is ever posted into it. Idempotent — see PushNotifications kdoc.
        PushNotifications.ensureChannel(applicationContext)
        enableEdgeToEdge()
        setContent {
            FilipinoDamaTheme {
                AppNavHost()
            }
        }
    }
}
