package com.filipinodama.app.ui.screens.system

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.filipinodama.app.ui.theme.Bg2
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Panel

/**
 * Full-screen maintenance takeover — mobile-screen-inventory.md SCREEN 1
 * (`{{ maintenance }}`), z-index 200 in the prototype, top of the layering
 * stack in SYSTEM_STATES.md (z-index 380, above everything except the
 * offline strip). Copy is verbatim from the inventory: "The kingdom is being
 * fortified" heading, the body line, and the "Check again" retry action —
 * the message itself comes from the server's MAINTENANCE_TEXT (or the
 * inventory's own fallback body if blank), never invented client copy.
 */
@Composable
fun MaintenanceScreen(message: String, onCheckAgain: () -> Unit) {
    Box(
        modifier = Modifier.fillMaxSize().background(Bg2),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier.fillMaxSize().padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text("✦", color = Gold, fontSize = 40.sp)
            Text(
                text = "✦ Scheduled maintenance ✦",
                color = Gold,
                fontSize = 12.sp,
                letterSpacing = 2.sp,
                modifier = Modifier.padding(top = 14.dp)
            )
            Text(
                text = "The kingdom is being fortified",
                color = GoldLt,
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 10.dp)
            )
            Text(
                text = message,
                color = Ink,
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 14.dp, start = 8.dp, end = 8.dp)
            )
            Box(
                modifier = Modifier
                    .padding(top = 20.dp)
                    .background(Panel, RoundedCornerShape(999.dp))
                    .padding(horizontal = 18.dp, vertical = 10.dp)
            ) {
                Text("● We're working on it", color = GoldLt, fontSize = 12.sp)
            }
            Button(
                onClick = onCheckAgain,
                colors = ButtonDefaults.buttonColors(containerColor = Gold),
                modifier = Modifier.padding(top = 26.dp)
            ) {
                Text("Check again", color = androidx.compose.ui.graphics.Color(0xFF3A2405), fontWeight = FontWeight.Bold)
            }
        }
    }
}
