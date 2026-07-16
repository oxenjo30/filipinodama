package com.filipinodama.app.ui.screens.game

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel

/** Normalized in-match message the shared display renders — mirrors
 *  apps/web/src/features/play/MatchChat.tsx's MatchChatMsg. */
data class MatchChatUiMsg(
    val id: String,
    val mine: Boolean,
    val emote: String?,
    val body: String?
)

/** Free-tier fallback emote set (mirrors MatchChat.tsx's FALLBACK_EMOTES — the
 *  full cosmetics-driven emote set is a store/inventory feature not yet built
 *  on Android; this is the same fallback the web uses when none are owned). */
val FALLBACK_EMOTES = listOf("👋", "😄", "😮", "😢", "👍", "🔥")

/** Mirrors packages/shared/src/constants.ts MATCH_PHRASES verbatim. */
val MATCH_PHRASES = listOf(
    "Good game!", "Nice move!", "Let's go!", "Well played", "Good luck", "Oops", "Close one", "Rematch?"
)

/**
 * MatchChat — the shared in-match emote + quick-chat surface, ported from
 * apps/web/src/features/play/MatchChat.tsx. Collapsed by default (feed +
 * composer only); a 😊 toggle opens a picker with the emoji row + phrase
 * chips. Picking an emoji/phrase sends it and closes the picker.
 *
 * Per the web source (OnlineMatchPage.tsx: `{myColor !== null && (<MatchChat.../>)}`),
 * this composable must be OMITTED ENTIRELY for spectators (myColor null) — a
 * spectator can watch but never chat. Callers gate visibility themselves;
 * this component has no [disabled] no-op mode for that case by design (mirrors
 * web exactly: spectators don't even get inert chat UI, the panel just isn't
 * there).
 */
@Composable
fun MatchChat(
    messages: List<MatchChatUiMsg>,
    onSend: (emote: String?, body: String?) -> Unit,
    modifier: Modifier = Modifier
) {
    var draft by remember { mutableStateOf("") }
    var pickerOpen by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()

    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) listState.animateScrollToItem(messages.size - 1)
    }

    fun sendText() {
        val t = draft.trim()
        if (t.isEmpty()) return
        onSend(null, t)
        draft = ""
    }

    fun pick(emote: String? = null, body: String? = null) {
        onSend(emote, body)
        pickerOpen = false
    }

    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        // message feed
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 56.dp, max = 180.dp)
        ) {
            if (messages.isEmpty()) {
                Text(
                    "Say hello or send an emote 👋",
                    color = Ink2,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.align(Alignment.Center)
                )
            } else {
                LazyColumn(state = listState, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(messages, key = { it.id }) { m -> ChatBubble(m) }
                }
            }
        }

        // composer — 😊 picker toggle + text input + send.
        // BUG FIX (emote tap did nothing): the picker and the composer Row used to
        // be plain siblings in a Box, both defaulting to TopStart, so they painted
        // at the SAME origin and OVERLAPPED — the Row (composed last) drew on top
        // and swallowed every tap in that region, so taps on the emoji chips never
        // reached their .clickable. A Column stacks the picker ABOVE the Row with
        // no overlap (mirroring web's `position:absolute; bottom:calc(100%+8px)`
        // popover-above-composer layout), so each has its own hit area.
        Column {
            if (pickerOpen) {
                ChatPicker(
                    onEmote = { pick(emote = it) },
                    onPhrase = { pick(body = it) },
                    modifier = Modifier
                        .padding(bottom = 8.dp)
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .border(1.dp, if (pickerOpen) Gold else Gold.copy(alpha = 0.28f), RoundedCornerShape(10.dp))
                        .background(if (pickerOpen) Gold.copy(alpha = 0.16f) else Color(0xCC0F0820), RoundedCornerShape(10.dp))
                        .clickable { pickerOpen = !pickerOpen },
                    contentAlignment = Alignment.Center
                ) {
                    Text("😊", fontSize = 18.sp)
                }
                OutlinedTextField(
                    value = draft,
                    onValueChange = { draft = it },
                    placeholder = { Text("Say something…", color = Ink2.copy(alpha = 0.7f)) },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                    keyboardActions = androidx.compose.foundation.text.KeyboardActions(onSend = { sendText() }),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White,
                        focusedBorderColor = Gold.copy(alpha = 0.6f),
                        unfocusedBorderColor = Gold.copy(alpha = 0.25f),
                        focusedContainerColor = Color.Black.copy(alpha = 0.3f),
                        unfocusedContainerColor = Color.Black.copy(alpha = 0.3f),
                        cursorColor = Gold
                    ),
                    shape = RoundedCornerShape(10.dp)
                )
                Box(
                    modifier = Modifier
                        .height(44.dp)
                        .background(Gold, RoundedCornerShape(10.dp))
                        .clickable { sendText() }
                        .padding(horizontal = 16.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text("Send", color = Color(0xFF2A1607), fontWeight = FontWeight.Bold, fontSize = 12.sp)
                }
            }
        }
    }
}

@Composable
private fun ChatBubble(m: MatchChatUiMsg) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = if (m.mine) Arrangement.End else Arrangement.Start) {
        if (m.emote != null) {
            Text(text = m.emote, fontSize = 24.sp, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
        } else {
            Box(
                modifier = Modifier
                    .background(
                        if (m.mine) Gold.copy(alpha = 0.16f) else Color.White.copy(alpha = 0.06f),
                        RoundedCornerShape(10.dp)
                    )
                    .padding(horizontal = 10.dp, vertical = 6.dp)
            ) {
                Text(text = m.body ?: "", color = Color.White, fontSize = 13.sp)
            }
        }
    }
}

@Composable
private fun ChatPicker(onEmote: (String) -> Unit, onPhrase: (String) -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(Color(0xFF20132F), RoundedCornerShape(14.dp))
            .border(1.dp, Gold.copy(alpha = 0.28f), RoundedCornerShape(14.dp))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            itemsIndexed(FALLBACK_EMOTES) { _, g ->
                Box(
                    modifier = Modifier
                        .size(38.dp)
                        .border(1.dp, Gold.copy(alpha = 0.18f), RoundedCornerShape(9.dp))
                        .background(Color(0x8C0F0820), RoundedCornerShape(9.dp))
                        .clickable { onEmote(g) },
                    contentAlignment = Alignment.Center
                ) {
                    Text(g, fontSize = 20.sp)
                }
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(Gold.copy(alpha = 0.14f)))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            itemsIndexed(MATCH_PHRASES) { _, p ->
                Box(
                    modifier = Modifier
                        .background(Color(0x8C0F0820), RoundedCornerShape(999.dp))
                        .border(1.dp, Gold.copy(alpha = 0.2f), RoundedCornerShape(999.dp))
                        .clickable { onPhrase(p) }
                        .padding(horizontal = 12.dp, vertical = 7.dp)
                ) {
                    Text(p, color = Ink, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                }
            }
        }
    }
}

/** Unread-message pill for the collapsed-chat toggle button (rows: "unread indicator"). */
@Composable
fun ChatUnreadBadge(count: Int, modifier: Modifier = Modifier) {
    if (count <= 0) return
    Box(
        modifier = modifier
            .size(18.dp)
            .background(Color(0xFFFF5A6A), CircleShape),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = if (count > 9) "9+" else count.toString(),
            color = Color.White,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold
        )
    }
}
