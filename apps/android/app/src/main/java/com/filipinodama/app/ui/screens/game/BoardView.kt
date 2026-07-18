package com.filipinodama.app.ui.screens.game

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.filipinodama.app.data.engine.GameState
import com.filipinodama.app.data.engine.PieceColors
import com.filipinodama.app.data.engine.Square
import com.filipinodama.app.data.engine.isDark
import com.filipinodama.app.ui.theme.Gold

/**
 * The 8x8 marble+gold board (DESIGN_SYSTEM.md "Board & pieces": "8x8, only
 * dark squares playable. Board frame uses a gold bevel... Selected piece =
 * gold ring; legal-move squares = gold dot; capture target = red glow;
 * must-capture = pulsing glow"). Sized to fill available width without
 * overflow (aspectRatio(1f) keeps it perfectly square on any phone width).
 *
 * Frame + square treatment mirrors the web's DEFAULT board exactly
 * (apps/web/src/components/Board.tsx): for the default "marble" theme the
 * web renders a CSS gold-bevel frame + procedurally-gradient marble squares
 * — it deliberately does NOT stretch `board-marble.png` as the playing
 * surface, because that source image's hand-rendered squares are irregular
 * and never line up with a mathematically perfect 8x8 grid (see Board.tsx's
 * own comment). `board-marble.png` is reserved there for equippable board
 * SKINS (wood/ebony/obsidian), which Android already loads correctly and
 * remotely via StoreAssets.kt when a skin is equipped. This composable
 * replicates the same procedural gold-bevel + marble-gradient look so the
 * default board matches the live web app pixel-for-pixel in spirit, rather
 * than bundling an unused PNG.
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
    // Equipped cosmetics (item ids). boardId → board theme; red/blueSkinId → each
    // colour's piece skin (per-colour so online, each player sees their own skin).
    // Null = the default marble board / classic pieces (the prior hardcoded look).
    boardId: String? = null,
    redSkinId: String? = null,
    blueSkinId: String? = null,
    modifier: Modifier = Modifier
) {
    val theme = boardThemeFor(boardId)
    // Gold-bevel frame — colour comes from the equipped board theme.
    Box(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(1f)
            .background(
                brush = Brush.linearGradient(theme.frame),
                shape = RoundedCornerShape(12.dp)
            )
            .padding(BOARD_FRAME_PADDING)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .clip(RoundedCornerShape(4.dp))
                // thin gold hairline inset, matching web's boxShadow inset ring
                .border(2.dp, Gold.copy(alpha = 0.4f), RoundedCornerShape(4.dp))
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
                            theme = theme,
                            piece = piece?.let { PieceRender(it.color, it.king) },
                            redSkinId = redSkinId,
                            blueSkinId = blueSkinId,
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

private val BOARD_FRAME_PADDING = 10.dp

data class PieceRender(val color: String, val king: Boolean)

@Composable
private fun BoardSquare(
    dark: Boolean,
    theme: BoardTheme,
    piece: PieceRender?,
    redSkinId: String?,
    blueSkinId: String?,
    selected: Boolean,
    moveTarget: Boolean,
    captureTarget: Boolean,
    mustCapture: Boolean,
    onClick: (() -> Unit)?,
    modifier: Modifier = Modifier
) {
    // Square gradient comes from the equipped board theme (radial highlight
    // anchored top-left, matching the web MARBLE/IMAGE_THEMES look).
    val bg = Brush.radialGradient(
        colors = if (dark) theme.darkSquare else theme.lightSquare,
        radius = 420f
    )
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
            // Resolve the piece palette from the equipped skin for THIS piece's
            // colour (red uses redSkinId, blue uses blueSkinId).
            val palette = piecePaletteFor(
                if (piece.color == PieceColors.RED) redSkinId else blueSkinId,
                piece.color
            )
            PieceDisc(piece = piece, palette = palette, ringGold = selected)
        } else if (moveTarget) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(0.28f)
                    .aspectRatio(1f)
                    .background(Gold.copy(alpha = 0.85f), shape = CircleShape)
            )
        } else if (captureTarget) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(0.55f)
                    .aspectRatio(1f)
                    .border(
                        width = 3.dp,
                        color = Color(0xFFFF5A6A).copy(alpha = if (mustCapture) 1f else 0.75f),
                        shape = CircleShape
                    )
            )
        }
    }
}

/** Glossy face/rim palette per piece color. The concrete palettes (default +
 *  each equippable skin) live in BoardCosmetics.kt so an equipped skin changes
 *  the piece look. */
data class PiecePalette(val faceColors: List<Color>, val rim: Color, val ringLo: Color)

/**
 * A single glossy Dama disc, ported from the web's `Piece.tsx` CSS layering:
 * radial-gradient face (bright top-left specular anchor) + dark bevel rim,
 * a raised concentric inner ring (the classic checker groove), a top-left
 * specular highlight blob, and a gold ♛ crown for kings. Pieces stay drawn
 * discs (approved design, not sprite art) — only the gloss treatment was
 * missing before this pass.
 */
@Composable
private fun PieceDisc(piece: PieceRender, palette: PiecePalette, ringGold: Boolean) {
    val pal = palette
    Box(
        modifier = Modifier
            .fillMaxWidth(0.82f)
            .aspectRatio(1f),
        contentAlignment = Alignment.Center
    ) {
        // outer disc: glossy face + dark bevel rim (gold rim on kings, or a
        // gold selection ring when this piece is the tapped/selected one).
        // The face brush needs the real pixel size to place its specular
        // anchor at 36%/26% (matching Piece.tsx's `circle at 36% 26%`), so
        // it's built in drawBehind where size is known, not a static Brush.
        Box(
            modifier = Modifier
                .fillMaxSize()
                .drawBehind {
                    drawCircle(
                        brush = Brush.radialGradient(
                            colors = pal.faceColors,
                            center = androidx.compose.ui.geometry.Offset(size.width * 0.36f, size.height * 0.26f),
                            radius = size.minDimension * 0.75f
                        )
                    )
                }
                .border(2.dp, if (piece.king || ringGold) Gold else pal.rim, CircleShape)
                .then(
                    if (ringGold) Modifier.border(3.dp, Gold, CircleShape) else Modifier
                ),
            contentAlignment = Alignment.Center
        ) {
            // raised concentric ring (the classic checker groove)
            Box(
                modifier = Modifier
                    .fillMaxSize(0.66f)
                    .border(1.5.dp, pal.ringLo, CircleShape)
            )
            // specular highlight
            Box(
                modifier = Modifier
                    .fillMaxSize(0.4f)
                    .padding(bottom = 6.dp, end = 6.dp)
                    .background(
                        brush = Brush.radialGradient(
                            colors = listOf(Color.White.copy(alpha = 0.7f), Color.Transparent)
                        ),
                        shape = CircleShape
                    )
            )
            if (piece.king) {
                Text(
                    text = "♛", // crown / king glyph, matches DESIGN_SYSTEM.md's "king carries a crown"
                    color = Gold,
                    style = MaterialTheme.typography.titleMedium
                )
            }
        }
    }
}
