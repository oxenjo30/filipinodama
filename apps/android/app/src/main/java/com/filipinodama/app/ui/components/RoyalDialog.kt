package com.filipinodama.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Shared royal-theme modal primitives.
 *
 * The canonical modal look is defined by [SignInRequiredDialog]: a deep-purple
 * VERTICAL GRADIENT panel with a GOLD HAIRLINE BORDER and rounded corners, and a
 * GOLD-GRADIENT primary button. Many older dialogs instead used a FLAT single
 * colour panel (theme `Panel` = #1E1134) with plain/flat buttons, so they read as
 * a touch off-brand next to the canonical ones (see
 * docs/ops/android-modal-design-audit.md).
 *
 * This file is the single source of truth for that treatment. A dialog styles its
 * panel with [royalDialogPanel] / [royalSheetPanel] (drop-in replacements for the
 * old `.background(Panel, RoundedCornerShape(..))`) and uses [RoyalPrimaryButton]
 * for its main call-to-action. Fixing the primitive keeps every dialog consistent
 * and stops the next one from regressing.
 */

// The canonical panel gradient + gold border (matches SignInRequiredDialog).
private val PanelGradientTop = Color(0xFF241748)
private val PanelGradientBottom = Color(0xFF160B28)
private val GoldBorder = Color(0x4DE8B84B)
private val GoldGradientTop = Color(0xFFEFC25A)
private val GoldGradientBottom = Color(0xFFC9971F)
private val GoldButtonInk = Color(0xFF3A2405)

/**
 * Royal dialog panel background: deep-purple vertical gradient + gold hairline
 * border, clipped to [corner]-radius corners. Drop-in replacement for the old
 * `.background(Panel, RoundedCornerShape(corner))` on a dialog's root Column/Box.
 * The caller keeps its own `.padding(..)`, scroll, and content.
 */
fun Modifier.royalDialogPanel(corner: Dp = 22.dp): Modifier = this
    .clip(RoundedCornerShape(corner))
    .background(Brush.verticalGradient(listOf(PanelGradientTop, PanelGradientBottom)))
    .border(1.dp, GoldBorder, RoundedCornerShape(corner))

/**
 * Bottom-sheet variant: same gradient + gold border but only the TOP corners are
 * rounded (a sheet sits flush to the bottom edge). Use on a sheet's root.
 */
fun Modifier.royalSheetPanel(corner: Dp = 26.dp): Modifier {
    val shape = RoundedCornerShape(topStart = corner, topEnd = corner)
    return this
        .clip(shape)
        .background(Brush.verticalGradient(listOf(PanelGradientTop, PanelGradientBottom)))
        .border(1.dp, GoldBorder, shape)
}

/**
 * The canonical gold-gradient primary CTA (matches SignInRequiredDialog's primary).
 * A full-width gold-gradient box with dark-ink label. Use for a dialog's main
 * action (Save, Buy, Confirm, Collect…). [enabled] dims it when false.
 */
@Composable
fun RoyalPrimaryButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    corner: Dp = 14.dp,
) {
    val gradient = if (enabled) {
        Brush.verticalGradient(listOf(GoldGradientTop, GoldGradientBottom))
    } else {
        Brush.verticalGradient(listOf(GoldGradientTop.copy(alpha = 0.4f), GoldGradientBottom.copy(alpha = 0.4f)))
    }
    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(corner))
            .then(if (enabled) Modifier.clickable(onClick = onClick) else Modifier)
            .background(gradient)
            .padding(vertical = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            color = GoldButtonInk.copy(alpha = if (enabled) 1f else 0.7f),
            style = MaterialTheme.typography.titleMedium,
        )
    }
}
