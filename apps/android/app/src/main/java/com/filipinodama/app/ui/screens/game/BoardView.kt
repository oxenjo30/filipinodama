package com.filipinodama.app.ui.screens.game

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.filipinodama.app.data.engine.GameState
import com.filipinodama.app.data.engine.PieceColors
import com.filipinodama.app.data.engine.Square
import com.filipinodama.app.data.engine.isDark
import com.filipinodama.app.ui.theme.Blue
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldDp
import com.filipinodama.app.ui.theme.Red

/**
 * The 8x8 marble+gold board (DESIGN_SYSTEM.md "Board & pieces": "8x8, only
 * dark squares playable. Board frame uses a gold bevel... Selected piece =
 * gold ring; legal-move squares = gold dot; capture target = red glow;
 * must-capture = pulsing glow"). Sized to fill available width without
 * overflow (aspectRatio(1f) keeps it perfectly square on any phone width).
 *
 * Read-only rendering: EVERY board update comes from [state] passed in by
 * the caller (server-authoritative for online play, or the local offline
 * engine state for AI mode) — this composable never mutates game state
 * itself, only reports taps via [onSquareClick]. Board orientation follows
 * apps/web/src/features/play/OnlineMatchPage.tsx: [flip] = true means the
 * BLUE seat views from the bottom (blue player's own perspective).
 */
@Composable
fun BoardView(
    state: GameState,
    selected: Square?,
    moveTargets: List<Square>,
    captureTargets: List<Square>,
    mustCapture: Boolean,
    onSquareClick: (Square) -> Unit,
    flip: Boolean = false,
    interactive: Boolean = true,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(1f)
            .background(
                brush = Brush.linearGradient(listOf(GoldDp, Gold, GoldDp)),
                shape = RoundedCornerShape(10.dp)
            )
            .border(2.dp, Gold, RoundedCornerShape(10.dp))
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .clip(RoundedCornerShape(7.dp))
                .background(Color(0xFF2A2038))
                .then(Modifier)
        ) {
            for (rowIndex in 0..7) {
                val r = if (flip) 7 - rowIndex else rowIndex
                Row(modifier = Modifier.fillMaxWidth()) {
                    for (colIndex in 0..7) {
                        val c = if (flip) 7 - colIndex else colIndex
                        val square = Square(r, c)
                        val dark = isDark(r, c)
                        val piece = state.pieces.find { it.square.r == r && it.square.c == c }
                        val isSelected = selected != null && selected.r == r && selected.c == c
                        val isMoveTarget = moveTargets.any { it.r == r && it.c == c }
                        val isCaptureTarget = captureTargets.any { it.r == r && it.c == c }

                        BoardSquare(
                            dark = dark,
                            piece = piece?.let { PieceRender(it.color, it.king) },
                            selected = isSelected,
                            moveTarget = isMoveTarget,
                            captureTarget = isCaptureTarget,
                            mustCapture = mustCapture,
                            onClick = if (interactive && dark) ({ onSquareClick(square) }) else null,
                            modifier = Modifier.weight(1f).aspectRatio(1f)
                        )
                    }
                }
            }
        }
    }
}

data class PieceRender(val color: String, val king: Boolean)

@Composable
private fun BoardSquare(
    dark: Boolean,
    piece: PieceRender?,
    selected: Boolean,
    moveTarget: Boolean,
    captureTarget: Boolean,
    mustCapture: Boolean,
    onClick: (() -> Unit)?,
    modifier: Modifier = Modifier
) {
    val bg = if (dark) Color(0xFF3A2E52) else Color(0xFF241A34)
    Box(
        modifier = modifier
            .background(bg)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier),
        contentAlignment = Alignment.Center
    ) {
        // 44dp+ touch target guaranteed: on a typical ~360dp-wide phone an
        // 8-column board yields ~40-45dp cells already; the clickable Box
        // fills the whole weighted cell so the effective hit target is the
        // full square, never smaller than the rendered cell itself.
        if (piece != null) {
            PieceDisc(piece = piece, ringGold = selected)
        } else if (moveTarget) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(0.28f)
                    .aspectRatio(1f)
                    .background(Gold.copy(alpha = 0.85f), shape = androidx.compose.foundation.shape.CircleShape)
            )
        } else if (captureTarget) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(0.55f)
                    .aspectRatio(1f)
                    .border(
                        width = 3.dp,
                        color = Color(0xFFFF5A6A).copy(alpha = if (mustCapture) 1f else 0.75f),
                        shape = androidx.compose.foundation.shape.CircleShape
                    )
            )
        }
    }
}

@Composable
private fun PieceDisc(piece: PieceRender, ringGold: Boolean) {
    val discColor = if (piece.color == PieceColors.RED) Red else Blue
    Box(
        modifier = Modifier
            .fillMaxWidth(0.78f)
            .aspectRatio(1f)
            .then(
                if (ringGold) Modifier.border(3.dp, Gold, androidx.compose.foundation.shape.CircleShape) else Modifier
            )
            .background(
                brush = Brush.radialGradient(listOf(discColor.copy(alpha = 1f), discColor.copy(alpha = 0.75f))),
                shape = androidx.compose.foundation.shape.CircleShape
            )
            .border(1.dp, Color.Black.copy(alpha = 0.35f), androidx.compose.foundation.shape.CircleShape),
        contentAlignment = Alignment.Center
    ) {
        if (piece.king) {
            Text(
                text = "♛", // crown / king glyph, matches DESIGN_SYSTEM.md's "king carries a crown"
                color = Gold,
                style = MaterialTheme.typography.titleMedium
            )
        }
    }
}
