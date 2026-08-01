package com.filipinodama.app.data.play

import com.filipinodama.app.data.ApiClient
import com.filipinodama.app.data.KeyValueStore
import com.filipinodama.app.data.engine.AiDifficulties
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * The Battle screen's "loadout": which mode the BATTLE button is armed with,
 * and — for the AI mode — which difficulty it will start at.
 *
 * Both are genuine LOCAL device preferences, not server state, so they live in
 * [KeyValueStore] alongside [com.filipinodama.app.data.settings.SettingsStore]
 * rather than in a new storage primitive.
 *
 * This also fixes a real defect in the screen it replaces: AiDifficultyScreen
 * held its selection in a plain `remember { mutableStateOf(NORMAL) }`, so a
 * player who always plays Hard had to re-pick Hard on every visit AND lost the
 * choice on rotation. Persisting it means the drawer arms whatever you last
 * chose, which is most of what makes the dock-loadout model feel fast.
 *
 * Unknown persisted values are ignored rather than trusted: a stale string from
 * an older build (or a mode later removed) must never arm the primary CTA with
 * something the screen cannot route.
 */
class PlayLoadoutStore(private val store: KeyValueStore) {

    private val _armedMode = MutableStateFlow(readMode())
    /** The mode BATTLE will start. One of [ArmedMode]'s constants. */
    val armedMode: StateFlow<String> = _armedMode.asStateFlow()

    private val _aiDifficulty = MutableStateFlow(readDifficulty())
    /** Difficulty used when [armedMode] is [ArmedMode.AI]. One of [AiDifficulties]. */
    val aiDifficulty: StateFlow<String> = _aiDifficulty.asStateFlow()

    fun setArmedMode(mode: String) {
        if (mode !in ArmedMode.ALL) return
        store.putString(KEY_ARMED_MODE, mode)
        _armedMode.value = mode
    }

    fun setAiDifficulty(difficulty: String) {
        if (difficulty !in AI_DIFFICULTIES) return
        store.putString(KEY_AI_DIFFICULTY, difficulty)
        _aiDifficulty.value = difficulty
    }

    private fun readMode(): String =
        store.getString(KEY_ARMED_MODE)?.takeIf { it in ArmedMode.ALL } ?: ArmedMode.RANKED

    private fun readDifficulty(): String =
        store.getString(KEY_AI_DIFFICULTY)?.takeIf { it in AI_DIFFICULTIES } ?: AiDifficulties.NORMAL

    companion object {
        const val KEY_ARMED_MODE = "fdr_play_armed_mode"
        const val KEY_AI_DIFFICULTY = "fdr_play_ai_difficulty"

        val AI_DIFFICULTIES = setOf(AiDifficulties.EASY, AiDifficulties.NORMAL, AiDifficulties.HARD)

        /**
         * App-wide singleton, matching the data-layer access convention — built
         * lazily off [ApiClient.secureStore] so it is only touched after
         * [ApiClient.init] has run.
         */
        val instance: PlayLoadoutStore by lazy { PlayLoadoutStore(ApiClient.secureStore) }
    }
}

/**
 * A one-shot request to open the Battle screen's Loadout drawer on arrival.
 *
 * The drawer lives inside the Battle screen, so screens that used to send
 * players to the Inventory route (Settings' "Board & Piece Skin" row, the
 * post-purchase "Go to loadout" overlay) navigate to the Play tab and set this;
 * the Battle screen opens the drawer and clears it. A nav argument would have
 * meant changing MODE_SELECT's route pattern, which the bottom tab bar matches
 * on — not worth the risk for a transient UI intent.
 */
object PlayScreenRequests {
    private val _openLoadout = MutableStateFlow(false)
    val openLoadout: StateFlow<Boolean> = _openLoadout.asStateFlow()

    fun requestLoadout() { _openLoadout.value = true }

    fun consumeLoadout() { _openLoadout.value = false }
}

/**
 * What the BATTLE button can be armed with. Deliberately a small closed set —
 * every value here must have a route in the Battle screen's `onBattle`
 * dispatch, which is why [PlayLoadoutStore] validates against [ALL] on read
 * and write.
 */
object ArmedMode {
    const val RANKED = "ranked"
    const val CASUAL = "casual"
    const val AI = "ai"
    const val PRIVATE = "private"

    val ALL = setOf(RANKED, CASUAL, AI, PRIVATE)

    // Tournaments is deliberately NOT armable (owner directive): it is its own
    // page reached from the Battle screen's side rail, not a mode BATTLE
    // starts. A stale "tournaments" value persisted by an earlier build is
    // rejected by PlayLoadoutStore's validation and falls back to RANKED.
}
