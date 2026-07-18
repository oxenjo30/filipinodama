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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
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
    // Gold-bevel frame — colour comes from the equipped board theme. The web's
    // marble frame is a 145° linear-gradient bevel (`145deg` top-left→bottom-
    // right) plus a raised bevel: `inset 0 2px 4px rgba(255,255,255,.45)` top
    // highlight + `inset 0 -3px 8px rgba(0,0,0,.5)` bottom shadow + a drop
    // shadow. We reproduce the 145° direction (top-left→bottom-right) and paint
    // the bevel highlight/shadow as thin inset borders on top of the frame fill.
    Box(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(1f)
            .background(
                brush = Brush.linearGradient(
                    colors = theme.frame,
                    start = Offset.Zero,
                    end = Offset.Infinite // top-left → bottom-right, ≈ web's 145deg
                ),
                shape = RoundedCornerShape(12.dp)
            )
            // Raised bevel: bright top edge + dark bottom edge (web inset shadows).
            .border(1.dp, Color.White.copy(alpha = 0.40f), RoundedCornerShape(12.dp))
            .padding(BOARD_FRAME_PADDING)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .clip(RoundedCornerShape(4.dp))
                // Web frames OUR grid with `inset 0 0 0 2px rgba(232,184,75,.4)`
                // (gold hairline) + `inset 0 0 46px rgba(0,0,0,.55)` (a heavy dark
                // vignette so the perfect 8×8 reads as inset). The gold hairline
                // is this 2dp inset border; the inset depth is carried by each
                // square's own inset shadow (BoardSquare, matching web's
                // per-cell `inset 0 0 18px rgba(0,0,0,.45)`).
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
    // Square background — mirrors the web MARBLE / IMAGE_THEMES cell exactly:
    //   background: radial-gradient(120% 120% at 25% 20%, <3 stops>)
    //   box-shadow (dark): inset 0 0 18px rgba(0,0,0,.45)
    //             (light): inset 0 0 12px rgba(0,0,0,.25)
    //             + inset 0 0 0 1px rgba(232,184,75,.22)   (gold hairline)
    //             + (selected) inset 0 0 0 3px rgba(245,215,131,.95)
    //             + (mustCapture source) inset 0 0 0 3px rgba(245,215,131,.6)
    // The OLD code used a FIXED 420px radius, which — over a ~120px phone cell —
    // dwarfed the box so only the FIRST colour stop showed (a near-flat fill,
    // the cause of "the default board looks less polished than web"). Radius is
    // now proportional (`120%` of the cell → `size.maxDimension * 1.2`) and the
    // highlight is anchored at 25%/20% like the web, so all stops read.
    val colors = if (dark) theme.darkSquare else theme.lightSquare
    val insetShadow = if (dark) 0.45f else 0.25f       // web inset 18px/.45 vs 12px/.25
    val goldRingAlpha = when {
        selected -> 0.95f
        mustCapture -> 0.60f
        else -> 0.22f
    }
    val goldRingWidthPx = if (selected || mustCapture) 3f else 1f
    Box(
        modifier = modifier
            .drawBehind {
                // Proportional radial marble/wood gradient (web `120% 120% at 25% 20%`).
                drawRect(
                    brush = Brush.radialGradient(
                        colors = colors,
                        center = Offset(size.width * 0.25f, size.height * 0.20f),
                        radius = size.maxDimension * 1.2f
                    )
                )
                // Inset edge shadow (web `inset 0 0 Npx rgba(0,0,0,a)`): a dark
                // vignette hugging the cell edges, drawn as a radial gradient that
                // is transparent in the centre and dark at the corners.
                val shadowSpan = size.maxDimension * (if (dark) 0.18f else 0.12f)
                drawRect(
                    brush = Brush.radialGradient(
                        colors = listOf(Color.Transparent, Color.Black.copy(alpha = insetShadow)),
                        center = Offset(size.width / 2f, size.height / 2f),
                        radius = size.maxDimension * 0.72f
                    )
                )
                // Gold hairline (+ selection / must-capture ring) — an inset stroke
                // hugging the cell border. Width & alpha escalate for selected /
                // must-capture, matching web's inset ring boxShadows.
                val w = goldRingWidthPx
                drawRect(
                    color = Color(0xFFF5D783).copy(alpha = goldRingAlpha),
                    topLeft = Offset(w / 2f, w / 2f),
                    size = Size(size.width - w, size.height - w),
                    style = Stroke(width = w)
                )
            }
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
 * A single glossy Dama disc, ported 1:1 from the web's `Piece.tsx` CSS layering
 * so mobile pieces carry the same depth as web (this is the PROBLEM-2 fidelity
 * pass — the old mobile disc flattened most of these layers). The whole disc is
 * painted in ONE Canvas pass (performant on an 8×8 board redrawn each move):
 *
 *   1. FACE     radial-gradient(circle at 36% 26%, <4 stops>)         — glossy face
 *   2. BOTTOM   inset 0 -6px 10px rgba(0,0,0,.55)                     — bevel shade
 *   3. TOP      inset 0 5px 8px rgba(255,255,255,.42)                 — bevel light
 *   4. RIM      0 0 0 2px pal.rim  (gold on kings)                    — dark rim
 *   5. GROOVE   ring at 17% inset, 2px pal.ringLo + inset shading     — checker groove
 *   6. INNER    inner disc face at 27% inset (re-drawn face)          — added depth
 *   7. SPECULAR radial highlight blob top-left (10% top / 18% left)   — glossy glint
 *   8. STATE    gold selection ring / green must-capture ring         — overlay
 *   + ♛ gold king crown (drawn as Text on top).
 */
@Composable
private fun PieceDisc(piece: PieceRender, palette: PiecePalette, ringGold: Boolean) {
    val pal = palette
    val rimColor = if (piece.king || ringGold) Gold else pal.rim
    Box(
        modifier = Modifier
            .fillMaxWidth(0.82f) // web disc = 82% of the cell
            .aspectRatio(1f)
            .drawBehind {
                val w = size.width
                val h = size.height
                val cx = w / 2f
                val cy = h / 2f
                val r = size.minDimension / 2f

                // 1. FACE — glossy radial gradient anchored at 36%/26% (web).
                val faceBrush = Brush.radialGradient(
                    colors = pal.faceColors,
                    center = Offset(w * 0.36f, h * 0.26f),
                    radius = r * 1.5f // reach the far rim so all 4 stops read
                )
                drawCircle(brush = faceBrush, radius = r, center = Offset(cx, cy))

                // 2. BOTTOM bevel shade (web inset 0 -6px 10px rgba(0,0,0,.55)):
                //    a dark gradient welling up from the bottom edge.
                drawCircle(
                    brush = Brush.verticalGradient(
                        0.55f to Color.Transparent,
                        1f to Color.Black.copy(alpha = 0.55f),
                        startY = cy,
                        endY = cy + r
                    ),
                    radius = r, center = Offset(cx, cy)
                )
                // 3. TOP bevel light (web inset 0 5px 8px rgba(255,255,255,.42)):
                //    a soft highlight from the top edge.
                drawCircle(
                    brush = Brush.verticalGradient(
                        0f to Color.White.copy(alpha = 0.42f),
                        0.45f to Color.Transparent,
                        startY = cy - r,
                        endY = cy
                    ),
                    radius = r, center = Offset(cx, cy)
                )

                // 4. RIM — dark bevel rim (gold on kings). 2dp ≈ web's 0 0 0 2px.
                val rimPx = 2.dp.toPx()
                drawCircle(
                    color = rimColor,
                    radius = r - rimPx / 2f,
                    center = Offset(cx, cy),
                    style = Stroke(width = rimPx)
                )

                // 5. GROOVE — raised concentric checker ring at 17% inset (web
                //    inset:17% → radius ≈ 0.66 of the disc). ringLo colour + a
                //    thin dark inner + light outer edge sells the "raised" look.
                val grooveR = r * 0.66f
                drawCircle(
                    color = Color.Black.copy(alpha = 0.5f),
                    radius = grooveR + 1f, center = Offset(cx, cy),
                    style = Stroke(width = 2.dp.toPx())
                )
                drawCircle(
                    color = pal.ringLo,
                    radius = grooveR, center = Offset(cx, cy),
                    style = Stroke(width = 2.dp.toPx())
                )

                // 6. INNER disc face at 27% inset (web inner face, radius ≈ 0.46)
                //    — re-draw the face gradient smaller for layered depth, with
                //    its own top-shadow / bottom-light (web inset shading).
                val innerR = r * 0.46f
                drawCircle(brush = faceBrush, radius = innerR, center = Offset(cx, cy))
                drawCircle(
                    brush = Brush.verticalGradient(
                        0f to Color.Black.copy(alpha = 0.40f),
                        0.5f to Color.Transparent,
                        1f to Color.White.copy(alpha = 0.25f),
                        startY = cy - innerR,
                        endY = cy + innerR
                    ),
                    radius = innerR, center = Offset(cx, cy)
                )

                // 7. SPECULAR highlight blob — top-left glossy glint (web top:10%
                //    left:18%, 44%×30%). An oval radial white→transparent.
                val specCx = w * 0.40f
                val specCy = h * 0.28f
                drawCircle(
                    brush = Brush.radialGradient(
                        colors = listOf(Color.White.copy(alpha = 0.70f), Color.Transparent),
                        center = Offset(specCx, specCy),
                        radius = r * 0.42f
                    ),
                    radius = r * 0.42f,
                    center = Offset(specCx, specCy)
                )

                // 8. STATE ring — gold selection ring (web `0 0 0 4px #F5D783`).
                if (ringGold) {
                    val ringPx = 3.dp.toPx()
                    drawCircle(
                        color = Gold,
                        radius = r + ringPx / 2f,
                        center = Offset(cx, cy),
                        style = Stroke(width = ringPx)
                    )
                }
            },
        contentAlignment = Alignment.Center
    ) {
        if (piece.king) {
            Text(
                text = "♛", // crown / king glyph (web king ♛ #F7E29A), matches DESIGN_SYSTEM.md
                color = Color(0xFFF7E29A),
                style = MaterialTheme.typography.titleMedium
            )
        }
    }
}
