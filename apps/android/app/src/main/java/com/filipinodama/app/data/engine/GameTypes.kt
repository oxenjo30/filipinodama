package com.filipinodama.app.data.engine

import kotlinx.serialization.Serializable

/**
 * Kotlin mirror of packages/shared/src/game.ts + enums.ts. Field names and
 * shapes match the TS types EXACTLY (verbatim, verified against the source)
 * so payloads from the server (kotlinx.serialization, camelCase) decode
 * without any mapping layer. This is the wire format AND the format the
 * read-only [Rules] hint helper operates on — there is no separate "local"
 * representation.
 *
 * `red` sits at the bottom (rows 5-7) and moves UP (decreasing row); `blue`
 * sits at the top (rows 0-2) and moves DOWN (increasing row). See
 * packages/game-engine/src/engine.ts for the authoritative TS engine this
 * mirrors.
 */
typealias PieceColor = String // "red" | "blue" — kept as a plain string (not
// an enum) so an unrecognized value from the server never crashes decode;
// see PieceColors for the known constants.

object PieceColors {
    const val RED = "red"
    const val BLUE = "blue"
    fun opponent(color: String): String = if (color == RED) BLUE else RED
}

@Serializable
data class Square(val r: Int, val c: Int) {
    fun sameAs(other: Square): Boolean = r == other.r && c == other.c
}

@Serializable
data class Piece(
    val id: String,
    val color: PieceColor,
    val king: Boolean,
    val square: Square
)

@Serializable
data class Move(
    val from: Square,
    /** landing square(s); length > 1 for multi-jumps */
    val path: List<Square>,
    /** squares of pieces removed by this move */
    val captures: List<Square>,
    val promotion: Boolean
) {
    val landing: Square get() = path.last()
}

@Serializable
data class GameSettings(
    val forcedMaxCapture: Boolean,
    val drawMoveLimit: Int,
    val moveTimerSec: Int? = null
)

val DEFAULT_SETTINGS = GameSettings(forcedMaxCapture = true, drawMoveLimit = 40)

/** MatchEndReason union from packages/shared/src/enums.ts. */
object MatchEndReasons {
    const val CAPTURE_ALL = "capture-all"
    const val NO_MOVES = "no-moves"
    const val RESIGN = "resign"
    const val TIMEOUT = "timeout"
    const val ABANDON = "abandon"
    const val AGREEMENT = "agreement"
    const val REPETITION = "repetition"
    const val INACTIVITY = "inactivity"
}

@Serializable
data class GameResult(
    /** "red" | "blue" | "draw" */
    val winner: String,
    val reason: String
)

@Serializable
data class Clocks(val red: Long, val blue: Long)

@Serializable
data class GameState(
    val id: String,
    val pieces: List<Piece>,
    val turn: PieceColor,
    val moveNumber: Int,
    val history: List<Move> = emptyList(),
    val settings: GameSettings,
    val result: GameResult? = null,
    val clocks: Clocks? = null
)

/** true when (r,c) is a playable (dark) square. */
fun isDark(r: Int, c: Int): Boolean = (r + c) % 2 == 1

/** AiDifficulty union from packages/shared/src/enums.ts. */
object AiDifficulties {
    const val EASY = "easy"
    const val NORMAL = "normal"
    const val HARD = "hard"
}
