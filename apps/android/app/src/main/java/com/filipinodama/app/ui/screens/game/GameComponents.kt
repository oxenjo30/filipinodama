package com.filipinodama.app.ui.screens.game

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.filipinodama.app.ui.theme.ButtonGoldBottom
import com.filipinodama.app.ui.theme.ButtonGoldTextColor
import com.filipinodama.app.ui.theme.ButtonGoldTop
import com.filipinodama.app.ui.theme.ButtonPurpleBottom
import com.filipinodama.app.ui.theme.ButtonPurpleTop
import com.filipinodama.app.ui.theme.ButtonRedBottom
import com.filipinodama.app.ui.theme.ButtonRedTop
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.Panel
import com.filipinodama.app.ui.theme.TextDefault

/**
 * Shared button/card building blocks for the Play tab (Mode Select,
 * Matchmaking, AI Setup, Board). Extends the AuthPrimaryButton/
 * AuthSecondaryButton pattern from ui/screens/auth/AuthComponents.kt with the
 * red/purple gradient variants DESIGN_SYSTEM.md defines under `.btn-*`
 * (buttonRedBrush/buttonPurpleBrush/buttonGoldBrush in ui/theme/Color.kt),
 * which Phase 1/2 defined but never consumed until now.
 */

enum class GameButtonVariant { GOLD, RED, PURPLE }

@Composable
fun GameButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    variant: GameButtonVariant = GameButtonVariant.GOLD,
    enabled: Boolean = true
) {
    val brush = when (variant) {
        GameButtonVariant.GOLD -> Brush.verticalGradient(listOf(ButtonGoldTop, ButtonGoldBottom))
        GameButtonVariant.RED -> Brush.verticalGradient(listOf(ButtonRedTop, ButtonRedBottom))
        GameButtonVariant.PURPLE -> Brush.verticalGradient(listOf(ButtonPurpleTop, ButtonPurpleBottom))
    }
    val textColor = if (variant == GameButtonVariant.GOLD) ButtonGoldTextColor else TextDefault
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(50.dp)
            .clickable(enabled = enabled, onClick = onClick)
            .background(brush = brush, shape = RoundedCornerShape(11.dp))
            .then(if (!enabled) Modifier.background(Color.Black.copy(alpha = 0.4f), RoundedCornerShape(11.dp)) else Modifier),
        contentAlignment = Alignment.Center
    ) {
        Text(text = text, color = textColor, style = MaterialTheme.typography.titleMedium)
    }
}

/** A bordered "frame" card, matching DESIGN_SYSTEM.md's `.frame` panel convention. */
@Composable
fun GameFrameCard(
    modifier: Modifier = Modifier,
    borderColor: Color = Gold.copy(alpha = 0.25f),
    content: @Composable () -> Unit
) {
    Box(
        modifier = modifier
            .background(Panel, RoundedCornerShape(14.dp))
            .border(1.dp, borderColor, RoundedCornerShape(14.dp))
            .padding(16.dp)
    ) {
        content()
    }
}
