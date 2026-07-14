package com.filipinodama.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * The `‹` (U+2039) back-chevron button used across nearly every pushed
 * (non-tab-root) mockup screen — owner round-3 correction: this MUST be a
 * bordered square glyph button, never a plain "‹ Back"/"‹" text label and
 * never a Material arrow icon. Two mockup variants, both reproduced here via
 * named factory functions so call sites can't accidentally blend them:
 *
 *  - [MockupBackButton] — the DEFAULT variant used by the majority of pushed
 *    screens (Checkout-adjacent screens excluded — see below): Guild (line
 *    1227), Quests (1895), Leaderboard (2012), Friends (2061), Add Friend
 *    (2174), Achievements (2326 area), Discover (1515), Season (2411), AI
 *    Difficulty (1574), Mode Select (1602), Private Room (1807/1631), Replay
 *    (2227), Public Profile (2254), Match Detail (2300), Receipt (2349),
 *    Wallet (2379). Spec: 38x38dp box, radius 12dp, border 1px solid
 *    rgba(232,184,75,.25) [Color(0x40E8B84B)], background rgba(27,16,48,.7)
 *    [Color(0xB31B1030)], glyph `‹` color #F4ECD6, weight 700, 20sp.
 *  - [MockupBackButtonStore] — the Store-family variant (Inventory line 659,
 *    Notifications 701, Purchase History 746): 40x40dp box, radius 12dp,
 *    border 1px solid rgba(232,184,75,.16) [Color(0x29E8B84B)], glyph color
 *    #F4D886.
 *
 * Checkout (mockup line 899) uses a THIRD one-off size (36x36dp, radius
 * 11dp, border rgba(232,184,75,.22)) — see [MockupBackButtonCheckout] below.
 */
@Composable
fun MockupBackButton(onClick: () -> Unit, modifier: Modifier = Modifier) {
    BackChevronButton(
        onClick = onClick,
        modifier = modifier,
        size = 38.dp,
        cornerRadius = 12.dp,
        borderColor = Color(0x40E8B84B),
        background = Color(0xB31B1030),
        glyphColor = Color(0xFFF4ECD6)
    )
}

/** Store-family back button — 40x40dp, .16-alpha gold border, #F4D886 glyph (see file kdoc). */
@Composable
fun MockupBackButtonStore(onClick: () -> Unit, modifier: Modifier = Modifier) {
    BackChevronButton(
        onClick = onClick,
        modifier = modifier,
        size = 40.dp,
        cornerRadius = 12.dp,
        borderColor = Color(0x29E8B84B),
        background = Color(0xB31B1030),
        glyphColor = Color(0xFFF4D886)
    )
}

/** Checkout-family back button — 36x36dp, .22-alpha gold border, #F4ECD6 glyph (mockup line 899, see file kdoc). */
@Composable
fun MockupBackButtonCheckout(onClick: () -> Unit, modifier: Modifier = Modifier) {
    BackChevronButton(
        onClick = onClick,
        modifier = modifier,
        size = 36.dp,
        cornerRadius = 11.dp,
        borderColor = Color(0x38E8B84B),
        background = Color(0xB31B1030),
        glyphColor = Color(0xFFF4ECD6)
    )
}

/** Shared chevron-button primitive — always the bordered `‹` square, never a text link. */
@Composable
private fun BackChevronButton(
    onClick: () -> Unit,
    modifier: Modifier,
    size: Dp,
    cornerRadius: Dp,
    borderColor: Color,
    background: Color,
    glyphColor: Color
) {
    Box(
        modifier = modifier
            .size(size)
            .clickable(onClick = onClick)
            .background(background, RoundedCornerShape(cornerRadius))
            .border(1.dp, borderColor, RoundedCornerShape(cornerRadius)),
        contentAlignment = Alignment.Center
    ) {
        Text(
            "‹",
            color = glyphColor,
            fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
            fontSize = 20.sp
        )
    }
}
