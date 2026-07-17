package com.filipinodama.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import com.filipinodama.app.ui.theme.Gold

/**
 * A curated set of chat-friendly emojis (game/social flavored). Kept small and
 * common so the picker stays quick to scan on a phone — not an exhaustive set.
 */
private val CHAT_EMOJIS = listOf(
    "😀", "😄", "😁", "😆", "😅", "😂", "🙂", "😊",
    "😉", "😎", "😍", "😘", "🤗", "🤔", "😐", "😴",
    "😢", "😭", "😤", "😠", "😱", "🥳", "😇", "🤝",
    "👍", "👎", "👏", "🙌", "🙏", "💪", "🔥", "✨",
    "⚔️", "🛡️", "👑", "🏆", "🎯", "🎲", "♟️", "💎",
    "❤️", "💜", "💛", "💚", "💙", "🎉", "⭐", "💯",
    "😏", "😅", "🤣", "😬", "🫡", "🤩", "😌", "🥲",
)

/**
 * A compact emoji picker for chat composers (guild chat + friend/DM chat). A
 * small round emoji button; tapping it opens a popup grid of common emojis, and
 * tapping an emoji calls [onEmojiSelected] with that emoji so the caller can
 * append it to the message draft. The picker closes after a pick.
 *
 * This is an INSERT helper — the text fields already accept typed emoji from the
 * system keyboard; this gives a one-tap way to add them without switching the
 * keyboard, which is what the owner asked for on guild + friend chat.
 */
@Composable
fun EmojiPickerButton(
    onEmojiSelected: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    var open by remember { mutableStateOf(false) }

    Box(modifier = modifier) {
        // The trigger button.
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(Color(0x1FE8B84B))
                .border(1.dp, Gold.copy(alpha = 0.3f), CircleShape)
                .clickable { open = !open },
            contentAlignment = Alignment.Center
        ) {
            Text("😊", fontSize = 18.sp)
        }

        if (open) {
            // Anchored popup grid above/near the button. Dismisses on outside tap
            // or back press.
            Popup(
                alignment = Alignment.BottomStart,
                onDismissRequest = { open = false },
                properties = PopupProperties(focusable = true)
            ) {
                Column(
                    modifier = Modifier
                        .padding(bottom = 52.dp) // sit above the composer row
                        .fillMaxWidth()
                        .heightIn(max = 240.dp)
                        .background(
                            androidx.compose.ui.graphics.Brush.verticalGradient(
                                listOf(Color(0xFF241748), Color(0xFF160B28))
                            ),
                            RoundedCornerShape(18.dp)
                        )
                        .border(1.dp, Gold.copy(alpha = 0.3f), RoundedCornerShape(18.dp))
                        .padding(10.dp)
                ) {
                    Text(
                        "Emojis",
                        color = Gold,
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.padding(start = 4.dp, bottom = 6.dp)
                    )
                    LazyVerticalGrid(
                        columns = GridCells.Adaptive(minSize = 40.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        items(CHAT_EMOJIS) { emoji ->
                            Box(
                                modifier = Modifier
                                    .size(40.dp)
                                    .clip(RoundedCornerShape(10.dp))
                                    .clickable {
                                        onEmojiSelected(emoji)
                                        open = false
                                    },
                                contentAlignment = Alignment.Center
                            ) {
                                Text(emoji, fontSize = 22.sp)
                            }
                        }
                    }
                }
            }
        }
    }
}
