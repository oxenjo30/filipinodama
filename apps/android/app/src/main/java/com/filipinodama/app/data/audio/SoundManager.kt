package com.filipinodama.app.data.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.media.MediaPlayer
import com.filipinodama.app.R
import com.filipinodama.app.data.settings.SettingsStore
import kotlin.concurrent.thread
import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.sin

/**
 * Mobile audio — the Android counterpart to the web's apps/web/src/lib/sfx.ts.
 *
 * TWO independent channels, each gated by its own Settings toggle
 * ([SettingsStore.sound] for effects, [SettingsStore.music] for the loading
 * loop) so a player who wants ambience but not clicks (or vice-versa) is
 * honoured, exactly like the web reads its `sound`/`music` flags at call time.
 *
 *  - Board SFX ([playSfx]) — the web SYNTHESIZES these with Web Audio
 *    oscillators (there are no sound FILES for move/capture/king/win/lose), so
 *    we synthesize the equivalent short tones on-device with [AudioTrack]
 *    rather than shipping clips. Kept deliberately tiny + non-blocking (each
 *    plays on a short-lived thread) so a rapid capture chain doesn't stutter
 *    the UI.
 *  - Loading music ([startLoadingMusic]/[stopLoadingMusic]) — the real
 *    bundled loop res/raw/loading_theme.mp3 (copied from the web's
 *    public/assets/audio/loading-theme.mp3), looped via [MediaPlayer], faded
 *    so it never pops in/out.
 *
 * A process-wide singleton (the app has one foreground game/loading surface at
 * a time); call [init] once from Application/MainActivity before first use.
 */
object SoundManager {

    enum class Sfx { MOVE, CAPTURE, KING, WIN, LOSE, DRAW, SELECT }

    private lateinit var appContext: Context
    private var initialized = false

    fun init(context: Context) {
        if (initialized) return
        appContext = context.applicationContext
        initialized = true
    }

    private fun soundEnabled(): Boolean =
        initialized && runCatching { SettingsStore.instance.sound.value }.getOrDefault(true)

    private fun musicEnabled(): Boolean =
        initialized && runCatching { SettingsStore.instance.music.value }.getOrDefault(true)

    // ─────────────────────────── Board SFX ───────────────────────────

    private const val SAMPLE_RATE = 44100

    /**
     * Play a short synthesized effect for a board event. No-op when the Sound
     * effects toggle is off. Fire-and-forget on a throwaway thread so a burst
     * of captures never blocks the caller/UI.
     */
    fun playSfx(sfx: Sfx) {
        if (!soundEnabled()) return
        thread(isDaemon = true, name = "sfx-${sfx.name.lowercase()}") {
            runCatching { renderAndPlay(sfx) }
        }
    }

    private fun renderAndPlay(sfx: Sfx) {
        val samples = when (sfx) {
            // A soft two-note "tick" — the woody placement of a disc.
            Sfx.MOVE -> tone(freq = 420.0, durMs = 90, gain = 0.28, decay = 26.0)
            Sfx.SELECT -> tone(freq = 660.0, durMs = 55, gain = 0.18, decay = 40.0)
            // A brighter, punchier hit for a capture.
            Sfx.CAPTURE -> mix(
                tone(freq = 300.0, durMs = 140, gain = 0.34, decay = 18.0),
                noise(durMs = 90, gain = 0.22, decay = 30.0)
            )
            // Rising flourish for a crowned Dama.
            Sfx.KING -> mix(
                tone(freq = 523.0, durMs = 120, gain = 0.26, decay = 14.0),
                tone(freq = 784.0, durMs = 180, gain = 0.24, decay = 12.0, startMs = 60)
            )
            // Triumphant two-note major on win.
            Sfx.WIN -> mix(
                tone(freq = 587.0, durMs = 160, gain = 0.30, decay = 10.0),
                tone(freq = 880.0, durMs = 280, gain = 0.30, decay = 8.0, startMs = 120)
            )
            // Falling minor on loss.
            Sfx.LOSE -> mix(
                tone(freq = 392.0, durMs = 200, gain = 0.28, decay = 9.0),
                tone(freq = 294.0, durMs = 320, gain = 0.28, decay = 7.0, startMs = 150)
            )
            // Neutral, flat pair for a draw.
            Sfx.DRAW -> mix(
                tone(freq = 440.0, durMs = 160, gain = 0.24, decay = 11.0),
                tone(freq = 440.0, durMs = 220, gain = 0.22, decay = 9.0, startMs = 130)
            )
        }
        playPcm(samples)
    }

    /** A decaying sine tone → a ShortArray of 16-bit PCM samples. */
    private fun tone(freq: Double, durMs: Int, gain: Double, decay: Double, startMs: Int = 0): ShortArray {
        val total = SAMPLE_RATE * (startMs + durMs) / 1000
        val startN = SAMPLE_RATE * startMs / 1000
        val out = ShortArray(total)
        for (n in startN until total) {
            val t = (n - startN).toDouble() / SAMPLE_RATE
            val env = exp(-decay * t) // exponential decay envelope
            val v = sin(2.0 * PI * freq * t) * env * gain
            out[n] = (v * Short.MAX_VALUE).toInt().coerceIn(-32768, 32767).toShort()
        }
        return out
    }

    /** A decaying white-noise burst (the body of a capture "thunk"). */
    private fun noise(durMs: Int, gain: Double, decay: Double): ShortArray {
        val total = SAMPLE_RATE * durMs / 1000
        val out = ShortArray(total)
        var seed = 0x9E3779B9.toInt()
        for (n in 0 until total) {
            val t = n.toDouble() / SAMPLE_RATE
            val env = exp(-decay * t)
            // Cheap deterministic LCG noise (Math.random is banned in the wider
            // codebase for reproducibility; a fixed-seed PRNG is fine for SFX).
            seed = seed * 1103515245 + 12345
            val r = (seed ushr 16).toDouble() / 32768.0 - 1.0
            val v = r * env * gain
            out[n] = (v * Short.MAX_VALUE).toInt().coerceIn(-32768, 32767).toShort()
        }
        return out
    }

    /** Overlay two sample buffers (clamped), returning a buffer as long as the longer. */
    private fun mix(a: ShortArray, b: ShortArray): ShortArray {
        val out = ShortArray(maxOf(a.size, b.size))
        for (i in out.indices) {
            val s = (a.getOrElse(i) { 0 }).toInt() + (b.getOrElse(i) { 0 }).toInt()
            out[i] = s.coerceIn(-32768, 32767).toShort()
        }
        return out
    }

    private fun playPcm(samples: ShortArray) {
        if (samples.isEmpty()) return
        val track = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_GAME)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(SAMPLE_RATE)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build()
            )
            .setBufferSizeInBytes(samples.size * 2)
            .setTransferMode(AudioTrack.MODE_STATIC)
            .build()
        try {
            track.write(samples, 0, samples.size)
            track.play()
            // Hold the thread until playback finishes, then release.
            val durMs = (samples.size.toLong() * 1000 / SAMPLE_RATE) + 40
            Thread.sleep(durMs)
        } finally {
            runCatching { track.stop() }
            runCatching { track.release() }
        }
    }

    // ─────────────────────────── Loading music ───────────────────────────

    private var loadingPlayer: MediaPlayer? = null

    /**
     * Start the looping loading-screen theme (idempotent). No-op when the Music
     * toggle is off. Mirrors the web's startLoadingMusic(): a single looping
     * track that never stacks, faded up so it doesn't pop.
     */
    fun startLoadingMusic() {
        if (!musicEnabled()) return
        if (loadingPlayer != null) return // never stack
        runCatching {
            val mp = MediaPlayer.create(appContext, R.raw.loading_theme) ?: return
            mp.isLooping = true
            mp.setVolume(0f, 0f)
            mp.setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build()
            )
            mp.start()
            loadingPlayer = mp
            // Fade in over ~500ms.
            fadeVolume(mp, from = 0f, to = 0.75f, durationMs = 500)
        }
    }

    /** Stop the loading theme (fade out then release). Safe to call any time. */
    fun stopLoadingMusic() {
        val mp = loadingPlayer ?: return
        loadingPlayer = null
        thread(isDaemon = true, name = "music-stop") {
            runCatching {
                fadeVolumeBlocking(mp, from = 0.75f, to = 0f, durationMs = 350)
                mp.stop()
                mp.release()
            }.onFailure { runCatching { mp.release() } }
        }
    }

    private fun fadeVolume(mp: MediaPlayer, from: Float, to: Float, durationMs: Int) {
        thread(isDaemon = true, name = "music-fade") {
            runCatching { fadeVolumeBlocking(mp, from, to, durationMs) }
        }
    }

    private fun fadeVolumeBlocking(mp: MediaPlayer, from: Float, to: Float, durationMs: Int) {
        val steps = 16
        val stepMs = (durationMs / steps).toLong().coerceAtLeast(1)
        for (i in 0..steps) {
            val v = from + (to - from) * (i.toFloat() / steps)
            runCatching { mp.setVolume(v, v) }
            Thread.sleep(stepMs)
        }
    }
}
