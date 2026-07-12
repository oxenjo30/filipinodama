package com.filipinodama.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.filipinodama.app.data.ApiClient
import com.filipinodama.app.navigation.AppNavHost
import com.filipinodama.app.ui.theme.FilipinoDamaTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ApiClient.init(applicationContext)
        enableEdgeToEdge()
        setContent {
            FilipinoDamaTheme {
                AppNavHost()
            }
        }
    }
}
