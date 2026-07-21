package com.filipinodama.app.ui.screens.game

import androidx.compose.ui.graphics.Color
import com.filipinodama.app.data.engine.PieceColors

/**
 * Board & piece SKIN cosmetics for [BoardView], ported from the web renderer so
 * an equipped board theme / piece skin actually CHANGES the board look on
 * Android (before this, BoardView was hardcoded — equipping did nothing).
 *
 * Both board themes and piece skins are PROCEDURAL colour values on web
 * (Board.tsx MARBLE / IMAGE_THEMES for board squares, Piece.tsx FACE /
 * SKIN_FACE for pieces) — so we mirror them here as gradients/palettes and
 * select by the equipped item's key. The equipped values come from
 * AuthRepository.state.user.equippedBoard / equippedSkin (STORE ITEM IDS —
 * e.g. "ebony", "jadeskin"), resolved to a theme/palette by [boardThemeFor] /
 * [piecePaletteFor].
 *
 * ── KEY RESOLUTION (the PROBLEM-1 fix) ──
 * The value flowing in is the item ID (the server persists item.id on
 * User.equippedBoard/equippedSkin — see apps/server/src/auth/service.ts
 * publicUser()). The web resolves that id → the art key via the store catalog
 * assetKey (cosmeticsStore.boardKey/skinKey). We can't fetch the catalog on the
 * offline path, so we resolve by EXPLICIT id→key tables built from seed.ts
 * (the authoritative id/assetKey source). This replaces the old fragile
 * `key.contains(...)` substring matching, which (a) risked cross-type false
 * matches as ids grow and (b) collapsed the paid "marble" board onto the free
 * default so equipping the paid Marble Court Board showed NO change.
 */

// ── Board themes (mirrors web Board.tsx MARBLE default + IMAGE_THEMES) ──

/** A board theme = the frame gradient + the dark/light square gradients. The
 *  square lists are multi-stop so BoardSquare's proportional radial gradient
 *  reads with real marble/wood depth (the web uses 3–4 stop radial-gradients). */
data class BoardTheme(
    val frame: List<Color>,
    val darkSquare: List<Color>,
    val lightSquare: List<Color>,
)

/**
 * Free default "Marble & Gold" — the classic gold-bevel marble board.
 * Web: MARBLE dark `#454b59→#2a2f3b→#181b23`, light `#faf6ec→#ece5d5→#d4cbb6`,
 * gold bevel frame `#f5d88a→#d3a63c→#8a5a1e`.
 */
val BOARD_MARBLE = BoardTheme(
    frame = listOf(Color(0xFFF5D88A), Color(0xFFD3A63C), Color(0xFF8A5A1E)),
    darkSquare = listOf(Color(0xFF454B59), Color(0xFF2A2F3B), Color(0xFF181B23)),
    lightSquare = listOf(Color(0xFFFAF6EC), Color(0xFFECE5D5), Color(0xFFD4CBB6)),
)

/**
 * Paid "Marble Court Board" (id "marble") — DISTINCT from the free default so
 * equipping it is visibly different (PROBLEM-1 content gap: on web both use
 * board-marble.png, but a paid board that renders identically to the free one
 * reads as "equip did nothing"). A cooler blue-grey court marble inside a
 * platinum/steel bevel, so it reads as an upgraded court, not the warm default.
 */
private val BOARD_MARBLE_COURT = BoardTheme(
    frame = listOf(Color(0xFFE8EDF5), Color(0xFFB7C2D2), Color(0xFF6E7A8E)),
    darkSquare = listOf(Color(0xFF3C4658), Color(0xFF262E3C), Color(0xFF141922)),
    lightSquare = listOf(Color(0xFFF4F7FC), Color(0xFFDCE3EE), Color(0xFFBEC8D8)),
)

// Wood / Classic — warm walnut/maple checker inside a plain wood frame.
// Web IMAGE_THEMES.wood/classic dark `#6b4a2c→#4e3417→#3a2410`,
// light `#f0dcb0→#e6c98c→#d8b673`.
private val BOARD_WOOD = BoardTheme(
    frame = listOf(Color(0xFF7A5230), Color(0xFF54371C), Color(0xFF34210F)),
    darkSquare = listOf(Color(0xFF6B4A2C), Color(0xFF4E3417), Color(0xFF3A2410)),
    lightSquare = listOf(Color(0xFFF0DCB0), Color(0xFFE6C98C), Color(0xFFD8B673)),
)

// Ebony — cream vs deep-ebony inside a gold-filigree black frame.
// Web IMAGE_THEMES.ebony dark `#3a2c22→#241812→#160d09`,
// light `#f4e7c8→#e8d6a8→#dcc890`.
private val BOARD_EBONY = BoardTheme(
    frame = listOf(Color(0xFFE8C87A), Color(0xFF6E5A2C), Color(0xFF160D09)),
    darkSquare = listOf(Color(0xFF3A2C22), Color(0xFF241812), Color(0xFF160D09)),
    lightSquare = listOf(Color(0xFFF4E7C8), Color(0xFFE8D6A8), Color(0xFFDCC890)),
)

// Obsidian — charcoal vs near-black slate inside a purple-rimmed stone frame.
// Web IMAGE_THEMES.obsidian dark `#1c1c22→#101014→#08080b`,
// light `#3a3a44→#2a2a32→#1e1e24`.
private val BOARD_OBSIDIAN = BoardTheme(
    frame = listOf(Color(0xFF6E5AA0), Color(0xFF322A48), Color(0xFF120E1E)),
    darkSquare = listOf(Color(0xFF1C1C22), Color(0xFF101014), Color(0xFF08080B)),
    lightSquare = listOf(Color(0xFF3A3A44), Color(0xFF2A2A32), Color(0xFF1E1E24)),
)

// ── Batch 2 boards — colors mirror web Board.tsx IMAGE_THEMES exactly ──
// Sapphire — deep sapphire-blue vs silver-pearl, silver filigree frame.
private val BOARD_SAPPHIRE = BoardTheme(
    frame = listOf(Color(0xFFE8EDF5), Color(0xFFB7C2D2), Color(0xFF6E7A8E)),
    darkSquare = listOf(Color(0xFF1C3A86), Color(0xFF0D215C), Color(0xFF06123F)),
    lightSquare = listOf(Color(0xFFEEF1F6), Color(0xFFD3D9E6), Color(0xFFB9C2D6)),
)
// Emerald Jade — deep emerald vs pale cream-jade, gold dragon frame.
private val BOARD_EMERALD_JADE = BoardTheme(
    frame = listOf(Color(0xFFF5D88A), Color(0xFFB78A34), Color(0xFF5A3E14)),
    darkSquare = listOf(Color(0xFF256B3F), Color(0xFF154028), Color(0xFF0D2A1A)),
    lightSquare = listOf(Color(0xFFEEF0D8), Color(0xFFD6DBB0), Color(0xFFC2C99A)),
)
// Blood Narra — rich red narra hardwood vs dark walnut, carved wood frame.
private val BOARD_BLOOD_NARRA = BoardTheme(
    frame = listOf(Color(0xFF8A6038), Color(0xFF5A3A20), Color(0xFF34210F)),
    darkSquare = listOf(Color(0xFF7A2E22), Color(0xFF54180F), Color(0xFF3A0F08)),
    lightSquare = listOf(Color(0xFFD99A6C), Color(0xFFC17C4C), Color(0xFFA8633A)),
)
// Pearl Ivory — iridescent pearl vs champagne-ivory, rose-gold frame.
private val BOARD_PEARL_IVORY = BoardTheme(
    frame = listOf(Color(0xFFF0D2B8), Color(0xFFD4A484), Color(0xFFA8785C)),
    darkSquare = listOf(Color(0xFFE6E0D0), Color(0xFFD3CBB6), Color(0xFFC2B89F)),
    lightSquare = listOf(Color(0xFFFBF8F0), Color(0xFFF3EEDE), Color(0xFFE9E2CC)),
)
// Volcanic Ember — black basalt vs charcoal veined with molten orange, iron frame.
private val BOARD_VOLCANIC_EMBER = BoardTheme(
    frame = listOf(Color(0xFFE07A20), Color(0xFF6E3A12), Color(0xFF1A1210)),
    darkSquare = listOf(Color(0xFF2A2422), Color(0xFF171210), Color(0xFF0C0908)),
    lightSquare = listOf(Color(0xFF5A4A44), Color(0xFF40332E), Color(0xFF2C221E)),
)
// Royal Amethyst — violet amethyst vs polished silver, silver-purple frame.
private val BOARD_AMETHYST = BoardTheme(
    frame = listOf(Color(0xFFCEC2E4), Color(0xFF8A72B0), Color(0xFF432C66)),
    darkSquare = listOf(Color(0xFF6A4F8E), Color(0xFF432C66), Color(0xFF2C1A48)),
    lightSquare = listOf(Color(0xFFF0EEF5), Color(0xFFD8D2E4), Color(0xFFC2BAD2)),
)

/**
 * Explicit BOARD item-id → theme table (ids from seed.ts). Kept as a `when` so
 * every real id resolves deterministically and a paid board that shares its art
 * with the free default still gets its OWN distinct look. Unknown ids fall back
 * to the free marble default (never a blank board).
 */
fun boardThemeFor(equippedBoardId: String?): BoardTheme {
    return when (equippedBoardId) {
        "board-marble-default" -> BOARD_MARBLE        // free default
        "marble" -> BOARD_MARBLE_COURT                // paid Marble Court — distinct
        "ebony" -> BOARD_EBONY
        "classicwood" -> BOARD_WOOD
        "obsidian" -> BOARD_OBSIDIAN
        // Batch 2 boards (keyed on the item id from seed.ts).
        "sapphire" -> BOARD_SAPPHIRE
        "emeraldjade" -> BOARD_EMERALD_JADE
        "bloodnarra" -> BOARD_BLOOD_NARRA
        "pearlivory" -> BOARD_PEARL_IVORY
        "volcanicember" -> BOARD_VOLCANIC_EMBER
        "amethystboard" -> BOARD_AMETHYST
        else -> BOARD_MARBLE                          // null / unknown → default
    }
}

// ── Piece skins (mirrors web Piece.tsx FACE + SKIN_FACE) ──

/** Default classic discs — deep crimson (red) / royal blue (blue).
 *  Web FACE.red `#ff9aa0→#e5434f→#b3222e→#7a1420` rim `#5c0f18`;
 *  FACE.blue `#a3c8ff→#3f79d6→#255aa8→#153a72` rim `#0f2b57`. */
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
// Keyed by the item's ASSET KEY (the PieceSkin key the web uses, e.g. "jade").
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
 * Explicit SKIN item-id → assetKey table (ids/assetKeys from seed.ts). The
 * SKINS map is keyed by ASSET KEY, but the value flowing in is the item ID, so
 * we resolve id→assetKey first (exactly what the web's cosmeticsStore.skinKey
 * does via the catalog). This is deterministic and avoids the substring-match
 * collision risk of the old `key.contains(it.key)` scan. "skin-classic" / null /
 * unknown → the default crimson-vs-royal disc.
 */
private fun skinAssetKeyFor(equippedSkinId: String?): String? = when (equippedSkinId) {
    "jadeskin" -> "jade"
    "crimsonskin" -> "crimson"
    "obsidianskin" -> "obsidian"
    "sarimanokskin" -> "sarimanok"
    "bakunawaskin" -> "bakunawa"
    "sunstarsskin" -> "sunstars"
    "tamarawskin" -> "tamaraw"
    "baybayinskin" -> "baybayin"
    // Batch 2 skins (item id → assetKey).
    "rosegoldskin" -> "rosegold"
    "verdantskin" -> "verdant"
    "pearlskin" -> "pearl"
    "amethystskin" -> "amethyst"
    "emberskin" -> "ember"
    "bronzeskin" -> "bronze"
    else -> null // "skin-classic" / null / unknown → default disc
}

/**
 * Resolve an equipped SKIN item id → the per-colour piece palette. Resolves the
 * item id → assetKey → palette; "skin-classic" / null / unknown fall back to the
 * default crimson-vs-royal look.
 */
fun piecePaletteFor(equippedSkinId: String?, color: String): PiecePalette {
    val skin = skinAssetKeyFor(equippedSkinId)?.let { SKINS[it] }
    val isRed = color == PieceColors.RED
    return when {
        skin != null -> if (isRed) skin.red else skin.blue
        else -> if (isRed) PIECE_RED_DEFAULT else PIECE_BLUE_DEFAULT
    }
}

/**
 * Skins that ship real coin-art PNGs under
 * /assets/pieces/skins/<assetKey>/<color>-<man|king>.png. Ported VERBATIM from
 * the web renderer's `SKINS_WITH_ART` set (apps/web/src/components/Piece.tsx):
 * these render the actual art in-game (matching the store preview) instead of
 * the procedural disc. "default"/"classic" has no art → procedural fallback.
 */
private val SKINS_WITH_ART: Set<String> = setOf(
    "jade", "crimson", "obsidian",
    "sarimanok", "bakunawa", "sunstars", "tamaraw", "baybayin",
    // Batch 2 skins.
    "rosegold", "verdant", "pearl", "amethyst", "ember", "bronze",
)

/**
 * Resolve an equipped SKIN item id → its PNG art assetKey, but ONLY for skins
 * that actually ship coin art (per web's SKINS_WITH_ART). Returns null for the
 * classic/default skin and for any skin without art — those keep using the
 * procedural [piecePaletteFor] disc so a piece is never blank. Mirrors web:
 * `skin !== "default" && SKINS_WITH_ART.has(skin)` gates the PNG path.
 */
fun skinArtKeyFor(equippedSkinId: String?): String? =
    skinAssetKeyFor(equippedSkinId)?.takeIf { it in SKINS_WITH_ART }
