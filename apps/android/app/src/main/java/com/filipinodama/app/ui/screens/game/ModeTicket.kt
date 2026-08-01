package com.filipinodama.app.ui.screens.game

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.filipinodama.app.ui.theme.Ink2

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
    selected: Boolean = false
) {
    val shape = RoundedCornerShape(14.dp)
    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            // accent ring -> dark outline -> content, outermost first
            .background(if (selected) accent else accent.copy(alpha = 0.55f), shape)
            .padding(if (selected) 2.5.dp else 1.5.dp)
            .clip(shape)
            .background(OUTLINE, shape)
            .padding(2.5.dp)
            .clip(shape)
            .clickable(onClick = onClick)
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
                Image(
                    painter = painterResource(id = artRes),
                    contentDescription = null,
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .offset(x = 14.dp, y = 18.dp)
                        .size(104.dp)
                )
                Column(modifier = Modifier.padding(start = 14.dp, top = 11.dp, end = 10.dp, bottom = 11.dp)) {
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
                            modifier = Modifier.padding(top = 7.dp)
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
                            modifier = Modifier
                                .padding(top = 8.dp)
                                .fillMaxWidth(0.74f)
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
                            modifier = Modifier.padding(top = 5.dp)
                        )
                    }
                    if (sub != null) {
                        Text(
                            sub,
                            color = Ink2,
                            style = MaterialTheme.typography.labelSmall,
                            modifier = Modifier.padding(top = 4.dp)
                        )
                    }
                    if (timer != null) {
                        Box(
                            modifier = Modifier
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
                    modifier = Modifier.size(52.dp)
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
