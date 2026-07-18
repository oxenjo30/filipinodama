package com.filipinodama.app.ui.screens.game

import androidx.compose.ui.graphics.Color
import com.filipinodama.app.data.engine.PieceColors

/**
 * Board & piece SKIN cosmetics for [BoardView], ported from the web renderer so
 * an equipped board theme / piece skin actually CHANGES the board look on
 * Android (before this, BoardView was hardcoded — equipping did nothing).
 *
 * Both board themes and piece skins are PROCEDURAL colour values on web
 * (Board.tsx IMAGE_THEMES for board squares, Piece.tsx SKIN_FACE for pieces) —
 * not images — so we mirror them here as gradients/palettes and select by the
 * equipped item's key. The equipped values come from
 * AuthRepository.state.user.equippedBoard / equippedSkin (item ids), resolved
 * to keys by [boardKeyFor] / [skinKeyFor].
 */

// ── Board themes (mirrors web Board.tsx IMAGE_THEMES + the default MARBLE) ──

/** A board theme = the frame gradient + the dark/light square gradients. */
data class BoardTheme(
    val frame: List<Color>,
    val darkSquare: List<Color>,
    val lightSquare: List<Color>,
)

/** Default "Marble & Gold" — the current hardcoded look (unchanged). */
val BOARD_MARBLE = BoardTheme(
    frame = listOf(Color(0xFFF5D88A), Color(0xFFD3A63C), Color(0xFF8A5A1E)),
    darkSquare = listOf(Color(0xFF454B59), Color(0xFF2A2F3B), Color(0xFF181B23)),
    lightSquare = listOf(Color(0xFFFAF6EC), Color(0xFFECE5D5), Color(0xFFD4CBB6)),
)

// Wood / Classic — warm walnut/maple checker inside a plain wood frame.
private val BOARD_WOOD = BoardTheme(
    frame = listOf(Color(0xFF7A5230), Color(0xFF54371C), Color(0xFF34210F)),
    darkSquare = listOf(Color(0xFF6B4A2C), Color(0xFF4E3417), Color(0xFF3A2410)),
    lightSquare = listOf(Color(0xFFF0DCB0), Color(0xFFE6C98C), Color(0xFFD8B673)),
)

// Ebony — cream vs deep-ebony inside a gold-filigree black frame.
private val BOARD_EBONY = BoardTheme(
    frame = listOf(Color(0xFFE8C87A), Color(0xFF6E5A2C), Color(0xFF160D09)),
    darkSquare = listOf(Color(0xFF3A2C22), Color(0xFF241812), Color(0xFF160D09)),
    lightSquare = listOf(Color(0xFFF4E7C8), Color(0xFFE8D6A8), Color(0xFFDCC890)),
)

// Obsidian — charcoal vs near-black slate inside a purple-rimmed stone frame.
private val BOARD_OBSIDIAN = BoardTheme(
    frame = listOf(Color(0xFF6E5AA0), Color(0xFF322A48), Color(0xFF120E1E)),
    darkSquare = listOf(Color(0xFF1C1C22), Color(0xFF101014), Color(0xFF08080B)),
    lightSquare = listOf(Color(0xFF3A3A44), Color(0xFF2A2A32), Color(0xFF1E1E24)),
)

/**
 * Map an equipped BOARD item id (or its assetKey) → a theme. Board item
 * assetKeys are filenames like "board-ebony.png"; the ids are "ebony",
 * "classicwood", "marble", "obsidian", "board-marble-default". We normalise on
 * the recognisable substring so either the id or the assetKey resolves.
 */
fun boardThemeFor(equippedBoardId: String?): BoardTheme {
    val key = (equippedBoardId ?: "").lowercase()
    return when {
        key.contains("ebony") -> BOARD_EBONY
        key.contains("obsidian") -> BOARD_OBSIDIAN
        key.contains("wood") || key.contains("classic") -> BOARD_WOOD
        else -> BOARD_MARBLE // marble / default / unknown
    }
}

// ── Piece skins (mirrors web Piece.tsx FACE + SKIN_FACE) ──

/** Default classic discs — deep crimson (red) / royal blue (blue). */
val PIECE_RED_DEFAULT = PiecePalette(
    faceColors = listOf(Color(0xFFFF9AA0), Color(0xFFE5434F), Color(0xFFB3222E), Color(0xFF7A1420)),
    rim = Color(0xFF5C0F18),
    ringLo = Color(0xFF781422).copy(alpha = 0.85f),
)
val PIECE_BLUE_DEFAULT = PiecePalette(
    faceColors = listOf(Color(0xFFA3C8FF), Color(0xFF3F79D6), Color(0xFF255AA8), Color(0xFF153A72)),
    rim = Color(0xFF0F2B57),
    ringLo = Color(0xFF142D5F).copy(alpha = 0.85f),
)

/** One skin = the red palette + the blue palette (each player's own colour). */
private data class SkinPalettes(val red: PiecePalette, val blue: PiecePalette)

private fun pal(face: List<Long>, rim: Long, ringLo: Long) = PiecePalette(
    faceColors = face.map { Color(it) },
    rim = Color(rim),
    ringLo = Color(ringLo).copy(alpha = 0.85f),
)

// Ported verbatim from web Piece.tsx SKIN_FACE (face gradient stops + rim + ring).
private val SKINS: Map<String, SkinPalettes> = mapOf(
    "jade" to SkinPalettes(
        red = pal(listOf(0xFFFFD9A0, 0xFFE8A23C, 0xFFB8781F, 0xFF7A4D12), 0xFF5C3A0F, 0xFF785014),
        blue = pal(listOf(0xFFB8F0D0, 0xFF3FBF7A, 0xFF2A8F57, 0xFF175236), 0xFF0F3A22, 0xFF145032),
    ),
    "crimson" to SkinPalettes(
        red = pal(listOf(0xFFFFB0A8, 0xFFD63B46, 0xFFA01F2B, 0xFF66101A), 0xFF4D0C14, 0xFF6E121A),
        blue = pal(listOf(0xFFE6C3FF, 0xFF8B5CF0, 0xFF5F3AB0, 0xFF3A2270), 0xFF281550, 0xFF371E6E),
    ),
    "obsidian" to SkinPalettes(
        red = pal(listOf(0xFFC98A92, 0xFF7A3A44, 0xFF4D222A, 0xFF2A1218), 0xFF1A0C10, 0xFF3C1920),
        blue = pal(listOf(0xFF8A9AB8, 0xFF3A4A6E, 0xFF22304D, 0xFF12182A), 0xFF0A0E18, 0xFF192337),
    ),
    "sarimanok" to SkinPalettes(
        red = pal(listOf(0xFFFFC9A0, 0xFFE04A3A, 0xFFA51F1F, 0xFF5F0F12), 0xFF4A0C0E, 0xFF6E1414),
        blue = pal(listOf(0xFFBFE0FF, 0xFF3F7FE0, 0xFF274FA5, 0xFF132F5F), 0xFF0E1C4A, 0xFF142D6E),
    ),
    "bakunawa" to SkinPalettes(
        red = pal(listOf(0xFFFFB8B0, 0xFFD63B46, 0xFF8F1F2B, 0xFF54101A), 0xFF3D0C14, 0xFF64121A),
        blue = pal(listOf(0xFFAECDF5, 0xFF3A6AE0, 0xFF233F9C, 0xFF12235F), 0xFF0C1A4A, 0xFF122364),
    ),
    "sunstars" to SkinPalettes(
        red = pal(listOf(0xFFFFD0A0, 0xFFE5502E, 0xFFA83320, 0xFF601A12), 0xFF4A1408, 0xFF6E2D14),
        blue = pal(listOf(0xFFBCDCFF, 0xFF3F78D8, 0xFF274FA0, 0xFF132F60), 0xFF0E1E50, 0xFF142D64),
    ),
    "tamaraw" to SkinPalettes(
        red = pal(listOf(0xFFFFC4A8, 0xFFD84A2E, 0xFFA3341E, 0xFF5C1C10), 0xFF451408, 0xFF692814),
        blue = pal(listOf(0xFFB6D4F0, 0xFF3A6AC8, 0xFF22406E, 0xFF12233F), 0xFF0C1A3A, 0xFF122350),
    ),
    "baybayin" to SkinPalettes(
        red = pal(listOf(0xFFFFBCA8, 0xFFD13B3B, 0xFF9C1F28, 0xFF5A1018), 0xFF420C12, 0xFF691218),
        blue = pal(listOf(0xFFC0D8FF, 0xFF4470E0, 0xFF2A479C, 0xFF152A5F), 0xFF101E4A, 0xFF162864),
    ),
)

/**
 * Resolve an equipped SKIN item id / assetKey → the per-colour piece palette.
 * The SKIN item's assetKey IS the key ("jade", "crimson", …); "classic" / null
 * / unknown fall back to the default crimson-vs-royal look.
 */
fun piecePaletteFor(equippedSkinId: String?, color: String): PiecePalette {
    val key = (equippedSkinId ?: "").lowercase()
    val skin = SKINS.entries.firstOrNull { key.contains(it.key) }?.value
    val isRed = color == PieceColors.RED
    return when {
        skin != null -> if (isRed) skin.red else skin.blue
        else -> if (isRed) PIECE_RED_DEFAULT else PIECE_BLUE_DEFAULT
    }
}
