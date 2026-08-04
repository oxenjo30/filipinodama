package com.filipinodama.app.ui.components

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.graphicsLayer

/**
 * Icon treatment for the Play screen: the shipped PNGs are dark-ish plate art
 * that reads as flat, near-disabled, against the throne room behind them. These
 * helpers lift them at render time — no new art, no re-export.
 */

private const val ICON_BRIGHTNESS = 1.38f
private const val ICON_SATURATION = 1.12f

/**
 * A saturation matrix pre-scaled by a brightness factor.
 *
 * Written out longhand rather than composing two [ColorMatrix] instances so the
 * multiplication order is explicit and cannot be read the wrong way round.
 * Luminance weights are the usual Rec.709 set that [ColorMatrix.setToSaturation]
 * uses.
 */
internal fun brightIconMatrix(
    brightness: Float = ICON_BRIGHTNESS,
    saturation: Float = ICON_SATURATION
): ColorMatrix {
    val lr = 0.213f
    val lg = 0.715f
    val lb = 0.072f
    val inv = 1f - saturation
    val b = brightness
    return ColorMatrix(
        floatArrayOf(
            b * (inv * lr + saturation), b * (inv * lg), b * (inv * lb), 0f, 0f,
            b * (inv * lr), b * (inv * lg + saturation), b * (inv * lb), 0f, 0f,
            b * (inv * lr), b * (inv * lg), b * (inv * lb + saturation), 0f, 0f,
            0f, 0f, 0f, 1f, 0f
        )
    )
}

/** The brightness lift, ready to hand to an `Image(colorFilter = ...)`. */
fun brightIconFilter(
    brightness: Float = ICON_BRIGHTNESS,
    saturation: Float = ICON_SATURATION
): ColorFilter = ColorFilter.colorMatrix(brightIconMatrix(brightness, saturation))

/**
 * A soft warm glow behind an icon, so it reads as metal catching torchlight
 * rather than a sticker pasted on a tile.
 */
fun Modifier.iconGlow(
    color: Color = Color(0xFFE8B84B),
    alpha: Float = 0.34f,
    radiusScale: Float = 0.8f
): Modifier = this.drawBehind {
    val r = size.minDimension * radiusScale
    if (r <= 0f) return@drawBehind
    drawCircle(
        brush = Brush.radialGradient(
            0f to color.copy(alpha = alpha),
            1f to color.copy(alpha = 0f),
            center = center,
            radius = r
        ),
        radius = r,
        center = center
    )
}

/**
 * A slow breathing scale. [delayMillis] staggers neighbouring icons so a column
 * of them never beats in unison, which reads as a glitch rather than as life.
 *
 * The transition is always created — collapsing the target to 1f under
 * [MotionBudget.OFF] rather than returning early, because a conditional
 * composable call would break composition.
 */
@Composable
fun Modifier.idlePulse(
    budget: MotionBudget,
    delayMillis: Int = 0,
    peak: Float = 1.07f
): Modifier {
    val target = if (budget == MotionBudget.OFF) 1f else peak
    val duration = if (budget == MotionBudget.REDUCED) 3200 else 1800
    val transition = rememberInfiniteTransition(label = "idlePulse")
    val scale by transition.animateFloat(
        initialValue = 1f,
        targetValue = target,
        animationSpec = infiniteRepeatable(
            animation = tween(
                durationMillis = duration,
                delayMillis = delayMillis,
                easing = FastOutSlowInEasing
            ),
            repeatMode = RepeatMode.Reverse
        ),
        label = "idlePulseScale"
    )
    return this.graphicsLayer {
        scaleX = scale
        scaleY = scale
    }
}

/**
 * A periodic bounce for something the player can act on right now.
 *
 * [active] must come from real state — this fires only when there is genuinely
 * something to claim. A decorative bounce trains players to ignore it.
 */
@Composable
fun Modifier.attentionBounce(
    active: Boolean,
    budget: MotionBudget
): Modifier {
    val enabled = active && budget != MotionBudget.OFF
    val transition = rememberInfiniteTransition(label = "attentionBounce")
    val lift by transition.animateFloat(
        initialValue = 0f,
        targetValue = 0f,
        animationSpec = infiniteRepeatable(
            animation = keyframes {
                durationMillis = 3800
                0f at 0
                0f at 2350
                -7f at 2650 using FastOutSlowInEasing
                0f at 2880
                -3f at 3020
                0f at 3180
                0f at 3800
            },
            repeatMode = RepeatMode.Restart
        ),
        label = "attentionBounceLift"
    )
    return this.graphicsLayer { translationY = if (enabled) lift else 0f }
}
