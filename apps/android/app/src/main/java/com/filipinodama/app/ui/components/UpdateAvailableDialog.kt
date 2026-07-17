package com.filipinodama.app.ui.components

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel

/**
 * Soft, dismissible "update available" prompt. Non-blocking — "Later" keeps the
 * user on the current build. "Update now" opens the app's Play listing.
 */
@Composable
fun UpdateAvailableDialog(onUpdate: () -> Unit, onDismiss: () -> Unit) {
    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(Panel, RoundedCornerShape(20.dp))
                .padding(24.dp)
        ) {
            Text("✨ Update available", color = GoldLt, style = MaterialTheme.typography.titleMedium)
            Text(
                "A newer version of FilipinoDama is ready. Update for the latest features and fixes.",
                color = Ink,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = 8.dp, bottom = 20.dp)
            )
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                Text(
                    "Later",
                    color = Ink2,
                    style = MaterialTheme.typography.labelLarge,
                    modifier = Modifier.clickable { onDismiss() }.padding(horizontal = 16.dp, vertical = 10.dp)
                )
                Text(
                    "Update now",
                    color = Color(0xFF2A1607),
                    style = MaterialTheme.typography.labelLarge,
                    modifier = Modifier
                        .clickable { onUpdate() }
                        .background(Gold, RoundedCornerShape(10.dp))
                        .padding(horizontal = 18.dp, vertical = 10.dp)
                )
            }
        }
    }
}

/**
 * Open the app's Google Play listing. Tries the Play app (market://) first, then
 * falls back to the web listing. Both are guarded: a device with neither Play nor
 * a browser must not crash the click handler. packageName resolves to the real
 * Play id (com.filipinodama.app) in debug and release (single applicationId, no
 * debug suffix).
 */
fun openPlayStoreListing(context: Context) {
    val id = context.packageName
    val market = Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$id"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
        context.startActivity(market)
    } catch (_: ActivityNotFoundException) {
        val web = Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$id"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            context.startActivity(web)
        } catch (_: ActivityNotFoundException) {
            // No Play app AND no browser — nothing we can open; don't crash.
        }
    }
}
