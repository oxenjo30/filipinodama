package com.filipinodama.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink2

/**
 * Royal-themed confirm dialog for resigning a match (owner: "Resign This match is
 * not following our design"). Replaces the default Material [androidx.compose.material3.AlertDialog]
 * (a flat gray box) with the app's deep-purple gradient panel, gold hairline
 * border, Cinzel-style gold title, and a red-tinted primary / ghost cancel —
 * matching SignInRequiredDialog and the rest of the game's chrome.
 *
 * @param subtitle who is awarded the win ("The AI will be awarded the win." /
 *   "Your opponent will be awarded the win.").
 */
@Composable
fun ResignConfirmDialog(
    subtitle: String,
    onCancel: () -> Unit,
    onResign: () -> Unit
) {
    Dialog(onDismissRequest = onCancel) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.verticalGradient(listOf(Color(0xFF241748), Color(0xFF160B28))),
                    RoundedCornerShape(22.dp)
                )
                .border(1.dp, Color(0x4DE8B84B), RoundedCornerShape(22.dp))
        ) {
            Column(modifier = Modifier.padding(24.dp)) {
                Text(
                    "Resign this match?",
                    color = GoldLt,
                    style = MaterialTheme.typography.headlineSmall
                )
                Text(
                    subtitle,
                    color = Ink2,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(top = 10.dp)
                )
                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 22.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    // Ghost cancel.
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clickable(onClick = onCancel)
                            .background(Color(0x14FFFFFF), RoundedCornerShape(12.dp))
                            .border(1.dp, Color(0x22E8B84B), RoundedCornerShape(12.dp))
                            .padding(vertical = 13.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("Cancel", color = GoldLt, style = MaterialTheme.typography.labelLarge)
                    }
                    // Red-tinted resign (destructive).
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clickable(onClick = onResign)
                            .background(Color(0x33E85D73), RoundedCornerShape(12.dp))
                            .border(1.dp, Color(0x66FF5A6A), RoundedCornerShape(12.dp))
                            .padding(vertical = 13.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("Resign", color = Color(0xFFFF8F9C), style = MaterialTheme.typography.labelLarge, textAlign = TextAlign.Center)
                    }
                }
            }
        }
    }
}
