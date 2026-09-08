package com.filipinodama.app.ui.screens.game

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.filipinodama.app.ui.components.MotionBudget
import com.filipinodama.app.ui.components.brightIconFilter
import com.filipinodama.app.ui.components.iconGlow
import com.filipinodama.app.ui.components.idlePulse
import com.filipinodama.app.ui.theme.Ink2
import kotlinx.coroutines.delay

/**
 * A Game Modes "ticket" — the row the drawer is built from.
 *
 * Shape mirrors the approved mockup: a wide main panel carrying the mode name
 * and YOUR STANDING IN THAT MODE, plus a narrow stub panel on the right holding
 * the mode's symbol. The point of the ticket over a plain card is that a mode
 * is a ladder you are somewhere on, not a destination — so [stat] and
 * [progress] are first-class, not decoration.
 *
 * The chunky treatment (thick dark outline, accent ring, hard bottom edge) is
 * built from nested boxes rather than a single border, because Compose cannot
 * stack two borders of different widths on one node.
 *
 * @param stat the headline standing, e.g. "1,040 - Bayani". Null when a mode
 *   has no ladder to be on (Private Room is an action, not a standing) — and
 *   deliberately null where the number would have to be invented: per-mode win
 *   records need a server aggregate that does not exist yet.
 */
@Composable
fun ModeTicket(
    title: String,
    artRes: Int,
    stubRes: Int,
    accent: Color,
    bgTint: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    stat: String? = null,
    statIconRes: Int? = null,
    sub: String? = null,
    progress: Float? = null,
    progressLabel: String? = null,
    timer: String? = null,
    pill: String? = null,
    pillColor: Color = accent,
    selected: Boolean = false,
    budget: MotionBudget = MotionBudget.FULL,
    entryIndex: Int = 0
) {
    val shape = RoundedCornerShape(14.dp)
    val still = budget == MotionBudget.OFF

    // ── entry: tickets rise into place one after another ──
    // The drawer's AnimatedVisibility disposes its content on close, so this
    // re-arms on every open and the stagger plays each time rather than once.
    var appeared by remember { mutableStateOf(still) }
    LaunchedEffect(Unit) {
        if (!still) {
            delay(entryIndex * 55L)
            appeared = true
        }
    }
    val entryAlpha by animateFloatAsState(
        targetValue = if (appeared) 1f else 0f,
        animationSpec = tween(260),
        label = "ticketEntryAlpha"
    )
    val entryLift by animateFloatAsState(
        targetValue = if (appeared) 0f else 26f,
        animationSpec = tween(340, easing = FastOutSlowInEasing),
        label = "ticketEntryLift"
    )

    // ── press: the ticket visibly takes the tap ──
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val pressScale by animateFloatAsState(
        targetValue = if (pressed) 0.972f else 1f,
        animationSpec = tween(90),
        label = "ticketPress"
    )

    // ── armed: only the armed ticket breathes and catches a shine, so the
    // drawer shows which mode BATTLE will launch without adding a second label ──
    val transition = rememberInfiniteTransition(label = "ticketArmed")
    val ringPulse by transition.animateFloat(
        initialValue = if (selected && !still) 0.62f else 1f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(1500, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "ticketRing"
    )
    val shine by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            // A long rest between sweeps. A continuous shine across a stack of
            // tickets reads as a broken shader rather than as polish.
            animation = keyframes {
                durationMillis = 3400
                0f at 0
                0f at 1900
                1f at 3400 using FastOutSlowInEasing
            },
            repeatMode = RepeatMode.Restart
        ),
        label = "ticketShine"
    )
    val shineOn = selected && !still
    val ringColor = if (selected) accent.copy(alpha = ringPulse) else accent.copy(alpha = 0.55f)

    Box(
        modifier = modifier
            .fillMaxWidth()
            .graphicsLayer {
                alpha = entryAlpha
                translationY = entryLift
                scaleX = pressScale
                scaleY = pressScale
            }
            .clip(shape)
            // accent ring -> dark outline -> content, outermost first
            .background(ringColor, shape)
            .padding(if (selected) 2.5.dp else 1.5.dp)
            .clip(shape)
            .background(OUTLINE, shape)
            .padding(2.5.dp)
            .clip(shape)
            // indication = null because the ticket answers a press with its own
            // scale; a ripple on top of that reads as two different buttons.
            .clickable(interactionSource = interaction, indication = null, onClick = onClick)
            .drawWithContent {
                drawContent()
                if (!shineOn) return@drawWithContent
                val w = size.width
                val h = size.height
                val x = -w * 0.6f + shine * (w * 1.8f)
                drawRect(
                    brush = Brush.linearGradient(
                        0.00f to Color(0x00FFF3D0),
                        0.45f to Color(0x33FFF3D0),
                        0.50f to Color(0x59FFF8E4),
                        0.55f to Color(0x33FFF3D0),
                        1.00f to Color(0x00FFF3D0),
                        start = Offset(x, 0f),
                        end = Offset(x + w * 0.45f, h)
                    ),
                    blendMode = BlendMode.Plus
                )
            }
    ) {
        // IntrinsicSize.Min lets the stub fillMaxHeight() against the taller
        // main panel; without it the Row's height constraint is unbounded and
        // the stub collapses to its content.
        Row(modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
            // ── main panel ──
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(topStart = 12.dp, bottomStart = 12.dp))
                    .background(Brush.linearGradient(listOf(bgTint, PANEL_DEEP)))
            ) {
                // Bleed art: offset past the panel's edge so it is clipped by the
                // parent, which reads as depth rather than a pasted-on icon.
                // The bleed art drifts on its own slow loop, its period offset per
                // ticket so a column of them never rises and falls in unison.
                val artFloat by transition.animateFloat(
                    initialValue = 0f,
                    targetValue = if (still) 0f else 1f,
                    animationSpec = infiniteRepeatable(
                        animation = tween(2600 + entryIndex * 240, easing = FastOutSlowInEasing),
                        repeatMode = RepeatMode.Reverse
                    ),
                    label = "ticketArtFloat"
                )
                Image(
                    painter = painterResource(id = artRes),
                    contentDescription = null,
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        // Inset, not bled. The previous offset(14, 18) pushed the
                        // medallion past the panel so the parent clip sliced its
                        // right edge at the stub seam and cut its base off.
                        .padding(end = 12.dp, bottom = 10.dp)
                        .graphicsLayer {
                            translationY = -artFloat * 2.5f
                            val s = 1f + artFloat * 0.018f
                            scaleX = s
                            scaleY = s
                        }
                        .size(88.dp)
                )
                // Everything BELOW the title has to clear the medallion: 88dp of
                // art plus its 12dp inset, and 4dp so they never quite touch.
                val clearsArt = Modifier.padding(end = 104.dp)
                Column(modifier = Modifier.padding(start = 14.dp, top = 11.dp, end = 14.dp, bottom = 11.dp)) {
                    // The title row keeps the full width. It sits at the top of the
                    // panel, where the medallion is round and transparent, so it has
                    // nothing to clear — reserving space here is what wrapped the
                    // CASUAL pill onto two lines.
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            title,
                            color = TITLE_GOLD,
                            style = MaterialTheme.typography.titleMedium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        if (pill != null) {
                            Box(
                                modifier = Modifier
                                    .padding(start = 7.dp)
                                    .border(1.dp, pillColor, RoundedCornerShape(100.dp))
                                    .padding(horizontal = 7.dp, vertical = 2.dp)
                            ) {
                                Text(pill, color = pillColor, style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                    if (stat != null) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            modifier = clearsArt.padding(top = 7.dp)
                        ) {
                            if (statIconRes != null) {
                                Image(
                                    painter = painterResource(id = statIconRes),
                                    contentDescription = null,
                                    modifier = Modifier.size(17.dp)
                                )
                            }
                            Text(stat, color = accent, style = MaterialTheme.typography.labelLarge)
                        }
                    }
                    if (progress != null) {
                        Box(
                            modifier = clearsArt
                                .padding(top = 8.dp)
                                .fillMaxWidth()
                                .height(5.dp)
                                .clip(RoundedCornerShape(100.dp))
                                .background(Color.White.copy(alpha = 0.14f))
                        ) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth(progress.coerceIn(0f, 1f))
                                    .fillMaxHeight()
                                    .clip(RoundedCornerShape(100.dp))
                                    .background(Brush.horizontalGradient(listOf(accent, TITLE_GOLD)))
                            )
                        }
                    }
                    if (progressLabel != null) {
                        Text(
                            progressLabel,
                            color = Ink2,
                            style = MaterialTheme.typography.labelSmall,
                            modifier = clearsArt.padding(top = 5.dp)
                        )
                    }
                    if (sub != null) {
                        Text(
                            sub,
                            color = Ink2,
                            style = MaterialTheme.typography.labelSmall,
                            modifier = clearsArt.padding(top = 4.dp)
                        )
                    }
                    if (timer != null) {
                        Box(
                            modifier = clearsArt
                                .padding(top = 9.dp)
                                .clip(RoundedCornerShape(100.dp))
                                .background(Color(0xCC0A0514))
                                .border(1.dp, Color.White.copy(alpha = 0.16f), RoundedCornerShape(100.dp))
                                .padding(horizontal = 9.dp, vertical = 3.dp)
                        ) {
                            Text(timer, color = Color(0xFFF0E2BC), style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
            }

            // ── stub panel ──
            Box(
                modifier = Modifier
                    .width(86.dp)
                    .fillMaxHeight()
                    .clip(RoundedCornerShape(topEnd = 12.dp, bottomEnd = 12.dp))
                    .background(
                        Brush.linearGradient(
                            listOf(accent.copy(alpha = 0.26f).compositeOverDeep(), STUB_DEEP)
                        )
                    ),
                contentAlignment = Alignment.Center
            ) {
                Image(
                    painter = painterResource(id = stubRes),
                    contentDescription = null,
                    colorFilter = brightIconFilter(),
                    modifier = Modifier
                        .size(52.dp)
                        .idlePulse(budget = budget, delayMillis = entryIndex * 180)
                        .iconGlow(color = accent, alpha = if (selected) 0.42f else 0.26f)
                )
            }
        }
    }
}

/**
 * Flatten an accent at low alpha onto the deep panel colour. The stub sits on
 * an opaque gradient, so a translucent accent would let the ticket's own
 * background show through the seam and break the "two panels" read.
 */
private fun Color.compositeOverDeep(): Color {
    val a = alpha
    return Color(
        red = red * a + PANEL_DEEP.red * (1 - a),
        green = green * a + PANEL_DEEP.green * (1 - a),
        blue = blue * a + PANEL_DEEP.blue * (1 - a),
        alpha = 1f
    )
}

internal val OUTLINE = Color(0xFF0C0616)
private val PANEL_DEEP = Color(0xFF1A1030)
private val STUB_DEEP = Color(0xFF170D29)
private val TITLE_GOLD = Color(0xFFF6E7BC)
