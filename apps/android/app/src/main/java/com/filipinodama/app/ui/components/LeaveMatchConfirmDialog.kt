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
 * Confirm before LEAVING a live match. Leaving is NOT resigning — the game keeps
 * running server-side and can be re-entered from the "Return to match" banner —
 * so this dialog reassures rather than warns (gold "Leave", not a red
 * destructive one). It exists because back/chevron used to drop the player out
 * of a live match silently, with no obvious way back (owner-reported).
 *
 * Same royal panel styling as [ResignConfirmDialog].
 */
@Composable
fun LeaveMatchConfirmDialog(
    onCancel: () -> Unit,
    onLeave: () -> Unit,
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
                    "Leave the match?",
                    color = GoldLt,
                    style = MaterialTheme.typography.headlineSmall
                )
                Text(
                    "Your game keeps going — you can jump back in any time from the " +
                        "“Return to match” bar at the top. To forfeit instead, use Resign.",
                    color = Ink2,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(top = 10.dp)
                )
                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 22.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    // Ghost cancel (stay in the match).
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clickable(onClick = onCancel)
                            .background(Color(0x14FFFFFF), RoundedCornerShape(12.dp))
                            .border(1.dp, Color(0x22E8B84B), RoundedCornerShape(12.dp))
                            .padding(vertical = 13.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("Keep playing", color = GoldLt, style = MaterialTheme.typography.labelLarge, textAlign = TextAlign.Center)
                    }
                    // Gold leave (non-destructive — game persists).
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clickable(onClick = onLeave)
                            .background(Color(0x2EE8B84B), RoundedCornerShape(12.dp))
                            .border(1.dp, Color(0x66E8B84B), RoundedCornerShape(12.dp))
                            .padding(vertical = 13.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("Leave", color = GoldLt, style = MaterialTheme.typography.labelLarge)
                    }
                }
            }
        }
    }
}
