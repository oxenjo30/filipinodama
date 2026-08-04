package com.filipinodama.app.ui.components

import androidx.annotation.DrawableRes
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.imageResource
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import com.filipinodama.app.R
import kotlin.math.PI
import kotlin.math.max
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.random.Random

/**
 * Which art the throne room is drawn from.
 *
 * [Baked] is what ships today: one WebP with the light shaft painted into it.
 * The shaft can be brightened and filled with dust, but it cannot travel —
 * rotating the overlay past about a degree visibly separates it from the
 * painted one underneath.
 *
 * [CleanPlate] is the upgrade, and it needs exactly one new asset: the same hall
 * with no light in it. The shaft this file already draws then becomes the *only*
 * shaft, so it is free to sweep. An optional hand-painted [shaft] image can
 * replace the procedural one, but nothing requires it.
 */
sealed interface ThroneArt {
    data object Baked : ThroneArt

    data class CleanPlate(
        @DrawableRes val plate: Int,
        @DrawableRes val shaft: Int? = null
    ) : ThroneArt
}

// ── scene geometry, as fractions of the drawn size ───────────────────────────
// Measured against loading_throne_portrait.webp as it crops on a phone.
private const val SHAFT_ORIGIN_X = 0.90f
private const val SHAFT_ORIGIN_Y = -0.05f
private const val SHAFT_ANGLE_DEG = 21f
private const val SHAFT_WIDTH_F = 0.50f
private const val SHAFT_LENGTH_F = 0.86f
private const val LAND_X = 0.44f
private const val LAND_Y = 0.545f
private const val POOL_RADIUS_F = 0.46f
private const val POOL_FLATTEN = 0.165f
private const val EMBLEM_X = 0.50f
private const val EMBLEM_Y = 0.238f
private const val EMBLEM_RADIUS_F = 0.19f

/** Emerald sconces, with phase offsets picked so no two ever fire together. */
private val GEMS = listOf(
    Triple(0.178f, 0.145f, 0.0f),
    Triple(0.822f, 0.135f, 1.7f),
    Triple(0.178f, 0.405f, 3.1f),
    Triple(0.822f, 0.408f, 4.6f),
    Triple(0.178f, 0.472f, 2.3f),
    Triple(0.822f, 0.470f, 5.4f)
)

private const val MOTES_FULL = 42
private const val MOTES_REDUCED = 18

/**
 * A dust mote inside the shaft, in shaft-local normalised units so it survives
 * a rotation or resize: [u] runs 0..1 down the shaft, [v] runs -0.5..0.5 across
 * it.
 */
private class DustMote(
    var u: Float,
    var v: Float,
    var speed: Float,
    var radius: Float,
    var phase: Float,
    var wobble: Float,
    var amp: Float
)

private fun newMote(rng: Random, seeded: Boolean) = DustMote(
    // Seeding the pool mid-flight avoids every mote marching in from the top
    // together on the first frame.
    u = if (seeded) rng.nextFloat() else 0f,
    v = (rng.nextFloat() - 0.5f) * 0.78f,
    speed = 0.018f + rng.nextFloat() * 0.055f,
    radius = 0.0013f + rng.nextFloat() * 0.0038f,
    phase = rng.nextFloat() * (2f * PI.toFloat()),
    wobble = 0.25f + rng.nextFloat() * 0.5f,
    amp = 0.008f + rng.nextFloat() * 0.022f
)

/** How many motes a budget allows. Exposed so the policy can be asserted in tests. */
internal fun moteCapFor(budget: MotionBudget): Int = when (budget) {
    MotionBudget.FULL -> MOTES_FULL
    MotionBudget.REDUCED -> MOTES_REDUCED
    MotionBudget.OFF -> 0
}

/**
 * Advances the mote pool: every mote moves down the shaft, motes past the far
 * end are recycled, and the pool settles at exactly the cap for the budget.
 * Split out from drawing so it can be exercised without a canvas.
 */
private fun advance(motes: MutableList<DustMote>, dt: Float, budget: MotionBudget, rng: Random) {
    val cap = moteCapFor(budget)
    if (cap == 0) {
        motes.clear()
        return
    }
    val it = motes.iterator()
    while (it.hasNext()) {
        val m = it.next()
        m.u += m.speed * dt
        if (m.u > 1f) it.remove()
    }
    while (motes.size > cap) motes.removeAt(motes.size - 1)
    while (motes.size < cap) motes.add(newMote(rng, seeded = true))
}

/** The one breathe curve. Light and floor pool share it, or they visibly disagree. */
internal fun breatheAt(t: Float): Float =
    0.72f + 0.28f * sin(t * 0.42f) + 0.09f * sin(t * 0.97f + 1.3f)

/** Alpha profile down the length of the shaft: bright near the window, gone by the floor. */
internal fun shaftFalloff(f: Float): Float = when {
    f < 0.16f -> lerpF(0.55f, 1f, f / 0.16f)
    f < 0.68f -> lerpF(1f, 0.5f, (f - 0.16f) / 0.52f)
    else -> lerpF(0.5f, 0f, ((f - 0.68f) / 0.32f).coerceAtMost(1f))
}

private fun lerpF(a: Float, b: Float, f: Float) = a + (b - a) * f.coerceIn(0f, 1f)

/**
 * The animated light over the throne room. Draws additively and nothing else —
 * no background, no scrim — so the caller controls exactly where in the stack
 * the light lands. On this screen it must sit between the art and the vertical
 * scrim, so the light is part of the scene rather than sitting on top of the UI.
 */
@Composable
fun ThroneLight(
    budget: MotionBudget,
    modifier: Modifier = Modifier,
    @DrawableRes shaftArt: Int? = null,
    freeSweep: Boolean = false
) {
    val time = remember { mutableFloatStateOf(0f) }
    val rng = remember { Random(0x0DA3A) }
    val motes = remember { mutableListOf<DustMote>() }

    // A hand-painted shaft is optional even on the clean-plate route; without
    // one the shaft is drawn procedurally.
    val shaftImage: ImageBitmap? = shaftArt?.let { ImageBitmap.imageResource(it) }

    LaunchedEffect(budget) {
        if (budget == MotionBudget.OFF) {
            // OFF still draws — it freezes the light, it does not delete it.
            motes.clear()
            return@LaunchedEffect
        }
        val clock = if (budget == MotionBudget.REDUCED) 0.45f else 1f
        var last = withFrameNanos { it }
        while (true) {
            withFrameNanos { now ->
                val dt = ((now - last) / 1_000_000_000.0).toFloat().coerceIn(0f, 0.05f)
                last = now
                time.floatValue += dt * clock
                advance(motes, dt, budget, rng)
            }
        }
    }

    Canvas(modifier) {
        drawThroneLight(
            t = time.floatValue,
            motes = motes,
            budget = budget,
            canSweep = freeSweep,
            shaftImage = shaftImage
        )
    }
}

private fun DrawScope.drawThroneLight(
    t: Float,
    motes: List<DustMote>,
    budget: MotionBudget,
    canSweep: Boolean,
    shaftImage: ImageBitmap?
) {
    val w = size.width
    val h = size.height
    if (w <= 0f || h <= 0f) return

    val intensity = if (budget == MotionBudget.REDUCED) 0.7f else 1f
    val breathe = breatheAt(t)

    // A painted shaft cannot follow the overlay, so on the Baked route sway is
    // capped where the two still read as one beam. On a clean plate there is
    // nothing to stay glued to, so the shaft can genuinely travel.
    val swayCap = if (canSweep) 6f else 0.8f
    val sway = sin(t * 0.13f) * swayCap

    val originX = w * SHAFT_ORIGIN_X
    val originY = h * SHAFT_ORIGIN_Y
    val shaftW = w * SHAFT_WIDTH_F
    val shaftL = h * SHAFT_LENGTH_F
    val half = shaftW / 2f

    val shaftBrush = Brush.horizontalGradient(
        0.00f to Color(0x00FFECBE),
        0.30f to Color(0x6BFFEEC6),
        0.50f to Color(0xFFFFF7DE),
        0.68f to Color(0x61FFEEC6),
        1.00f to Color(0x00FFECBE),
        startX = -half,
        endX = half
    )

    withTransform({
        translate(originX, originY)
        rotate(SHAFT_ANGLE_DEG + sway, Offset.Zero)
    }) {
        if (shaftImage != null) {
            // Hand-painted shaft art, moved outright.
            drawImage(
                image = shaftImage,
                dstOffset = IntOffset(-half.roundToInt(), 0),
                dstSize = IntSize(shaftW.roundToInt(), shaftL.roundToInt()),
                alpha = (0.9f * breathe * intensity).coerceIn(0f, 1f),
                blendMode = BlendMode.Plus
            )
        } else {
            // A soft gradient shaft. Drawn as horizontal slices because a single
            // brush cannot fade across its width and down its length at once.
            val slices = 20
            val sliceH = shaftL / slices
            for (i in 0 until slices) {
                val f = (i + 0.5f) / slices
                val a = shaftFalloff(f) * 0.55f * breathe * intensity
                if (a <= 0.002f) continue
                drawRect(
                    brush = shaftBrush,
                    topLeft = Offset(-half, i * sliceH),
                    size = Size(shaftW, sliceH + 1f),
                    alpha = a.coerceIn(0f, 1f),
                    blendMode = BlendMode.Plus
                )
            }
        }

        // Motes ride the same rotated frame as the shaft, so they always travel
        // along it rather than merely near it.
        for (m in motes) {
            val fade = sin(m.u.coerceIn(0f, 1f) * PI.toFloat())
            val a = fade * 0.95f * intensity
            if (a <= 0.01f) continue
            val x = (m.v + sin(t * m.wobble + m.phase) * m.amp) * shaftW
            drawCircle(
                color = Color(0xFFFFF4D2),
                radius = max(0.6f, m.radius * w),
                center = Offset(x, m.u * shaftL),
                alpha = a.coerceIn(0f, 1f),
                blendMode = BlendMode.Plus
            )
        }
    }

    // Floor pool — same breathe curve as the shaft, squashed into an ellipse.
    val landX = w * LAND_X
    val landY = h * LAND_Y
    val poolR = w * POOL_RADIUS_F
    val poolBrush = Brush.radialGradient(
        0.00f to Color(0x57FFEEC4),
        0.45f to Color(0x1AF0C882),
        1.00f to Color(0x00F0C882),
        center = Offset(landX, landY),
        radius = poolR
    )
    withTransform({ scale(1f, POOL_FLATTEN, Offset(landX, landY)) }) {
        drawCircle(
            brush = poolBrush,
            radius = poolR,
            center = Offset(landX, landY),
            alpha = (0.66f * breathe * intensity).coerceIn(0f, 1f),
            blendMode = BlendMode.Plus
        )
    }

    // The emblem is its own light source, so it runs on its own clock.
    val emblemR = w * EMBLEM_RADIUS_F
    val emblemCenter = Offset(w * EMBLEM_X, h * EMBLEM_Y)
    val emblemPulse = 0.7f + 0.3f * sin(t * 0.63f + 0.8f)
    drawCircle(
        brush = Brush.radialGradient(
            0.00f to Color(0x80FFF2CE),
            0.35f to Color(0x29FACE78),
            1.00f to Color(0x00FACE78),
            center = emblemCenter,
            radius = emblemR
        ),
        radius = emblemR,
        center = emblemCenter,
        alpha = (0.85f * emblemPulse * intensity).coerceIn(0f, 1f),
        blendMode = BlendMode.Plus
    )

    // Gem sconces.
    val gemR = w * 0.07f
    for ((gx, gy, offset) in GEMS) {
        val s = max(0f, sin(t * 0.5f + offset))
        val k = s * s * s * s * s * s // pow(6) without the boxing
        if (k < 0.01f) continue
        val c = Offset(w * gx, h * gy)
        drawCircle(
            brush = Brush.radialGradient(
                0f to Color(0xFF6FE8B0),
                1f to Color(0x006FE8B0),
                center = c,
                radius = gemR
            ),
            radius = gemR,
            center = c,
            alpha = (k * 0.85f * intensity).coerceIn(0f, 1f),
            blendMode = BlendMode.Plus
        )
    }
}

/**
 * The throne-room backdrop: base art plus its animated light, as one unit so no
 * caller has to know the ordering. Callers pass art, never booleans.
 */
@Composable
fun ThroneBackdrop(
    budget: MotionBudget,
    modifier: Modifier = Modifier,
    art: ThroneArt = ThroneArt.Baked
) {
    Box(modifier) {
        val baseRes = when (art) {
            is ThroneArt.Baked -> R.drawable.loading_throne_portrait
            is ThroneArt.CleanPlate -> art.plate
        }
        Image(
            painter = painterResource(id = baseRes),
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize()
        )
        ThroneLight(
            budget = budget,
            shaftArt = (art as? ThroneArt.CleanPlate)?.shaft,
            freeSweep = art is ThroneArt.CleanPlate,
            modifier = Modifier.fillMaxSize()
        )
    }
}
