package com.filipinodama.app.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.filipinodama.app.R
import kotlin.random.Random
import kotlinx.coroutines.delay

/**
 * In-flow pre-match loader — Compose port of `handoffv3/Loading Screen.dc.html`,
 * embedded via the mockup's `<!-- LOADING OVERLAY -->` (FilipinoDama Mobile.dc.html
 * lines 70-75, `loadingActive`/`loadingCtx`/`show-dust`). Distinct from
 * SplashScreen (one-time app-boot probe) — this shows briefly (mockup:
 * `playWithLoader`, 2050ms) whenever a match transition needs a beat: entering
 * matchmaking/AI/room-match, before the board is shown.
 *
 * Ported 1:1 per context (mockup `ctx()`, lines 90-100):
 *   default      -> "Preparing the court"  / load-throne-portrait
 *   matchmaking  -> "Finding opponent"     / load-matchmaking-portrait
 *   ranked       -> "Ranked match"         / load-crimson-portrait
 *
 * [durationMs] mirrors the mockup's fixed `loadingDur` (1500 passed to the
 * component prop, though the JS caller's own `playWithLoader` timer is
 * 2050ms — the LONGER of the two so the art/progress never look "done" before
 * the actual hand-off; see the mockup extraction notes). [onFinished] fires
 * once, matching `playWithLoader`'s `finally` clearing `loadingCtx`.
 */
enum class LoadingContext { DEFAULT, MATCHMAKING, RANKED }

private data class LoadingCtxSpec(
    val artRes: Int,
    val eyebrow: String,
    val glow: Color
)

private fun specFor(ctx: LoadingContext): LoadingCtxSpec = when (ctx) {
    LoadingContext.DEFAULT -> LoadingCtxSpec(R.drawable.loading_throne_portrait, "Preparing the court", Color(0x80785AAA))
    LoadingContext.MATCHMAKING -> LoadingCtxSpec(R.drawable.load_matchmaking_portrait, "Finding opponent", Color(0x80785AAA))
    LoadingContext.RANKED -> LoadingCtxSpec(R.drawable.load_crimson_portrait, "Ranked match", Color(0x80963C50))
}

private val LOADING_TIPS = listOf(
    "Kapag may kaya kang kunin, kailangan mong kunin — captures are forced.",
    "Protect your back row to stop enemy pieces from crowning.",
    "A dama (king) glides and captures along the entire diagonal.",
    "Bait one piece to win two — set up the double capture.",
    "Control the center. Doon nangyayari ang laban.",
    "Trade pieces when you're ahead — simplify your way to victory.",
    "Patience wins. Wag padalos-dalos sa unang kilos."
)

@Composable
fun LoadingOverlay(
    context: LoadingContext = LoadingContext.MATCHMAKING,
    durationMs: Int = 2050,
    onFinished: () -> Unit = {}
) {
    val spec = specFor(context)
    var pct by remember(context) { mutableFloatStateOf(0f) }
    var tipIdx by remember(context) { mutableIntStateOf(0) }

    // One-shot smooth fill 0->100 over durationMs, guaranteed to REACH 100 and
    // hold briefly before finishing, so the board never appears mid-fill (owner
    // fix: "it needs to reach 100% before the match shows up", no sudden jump
    // from ~66%). Keyed on durationMs (not context) so a context flip mid-fill
    // doesn't restart the bar; the last frame is pinned to exactly 100.
    LaunchedEffect(durationMs) {
        val t0 = System.currentTimeMillis()
        while (true) {
            val elapsed = System.currentTimeMillis() - t0
            pct = (elapsed.toFloat() / durationMs * 100f).coerceAtMost(100f)
            if (elapsed >= durationMs) break
            delay(32)
        }
        pct = 100f
        // Hold the full bar visibly for a beat so 100% actually registers on
        // screen before we hand off to the board.
        delay(180)
        onFinished()
    }
    // Tips rotate every 3800ms regardless of duration (mockup componentDidMount).
    LaunchedEffect(context) {
        while (true) {
            delay(3800)
            tipIdx = (tipIdx + 1) % LOADING_TIPS.size
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(listOf(Color(0xFF1C1030), Color(0xFF120A24), Color(0xFF0B0616)))
            )
    ) {
        // Top-center + bottom-corner glows, context-tinted (sceneLayer).
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Brush.radialGradient(colors = listOf(spec.glow, Color.Transparent)))
        )

        // Meshy art (real portrait per context) — full-bleed cover.
        Image(
            painter = painterResource(id = spec.artRes),
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize()
        )

        // Vignette + bottom scrim, matching the mockup's two scrim layers.
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Brush.radialGradient(listOf(Color.Transparent, Color(0x8C08041D))))
        )
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        0f to Color.Transparent,
                        0.62f to Color(0xD208041D),
                        1f to Color(0xF508041D)
                    )
                )
        )

        // Floating gold dust motes — mockup show-dust (18 motes, lsDust keyframe).
        DustLayer()

        Column(
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(modifier = Modifier.weight(0.18f))

            // Ornate rotating crest + pulsing dama diamond centerpiece.
            Crest()
            Text(
                "FILIPINO",
                color = Color(0xFFF5D783),
                style = MaterialTheme.typography.labelLarge,
                letterSpacing = 7.sp,
                fontWeight = FontWeight.ExtraBold,
                modifier = Modifier.padding(top = 4.dp)
            )
            Text(
                "DAMA ROYAL",
                color = Color(0xFFE8B84B),
                style = MaterialTheme.typography.headlineLarge,
                fontWeight = FontWeight.Black,
                letterSpacing = 3.sp
            )
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                modifier = Modifier.padding(top = 20.dp)
            ) {
                Box(modifier = Modifier.width(56.dp).height(1.dp).background(Color(0x8CE8B84B)))
                Text(
                    spec.eyebrow.uppercase(),
                    color = Color(0xFFE8B84B),
                    style = MaterialTheme.typography.labelMedium,
                    letterSpacing = 3.sp
                )
                Box(modifier = Modifier.width(56.dp).height(1.dp).background(Color(0x8CE8B84B)))
            }

            Spacer(modifier = Modifier.weight(1f))

            // Tip line — "Tip · " (gold bold) + rotating Taglish gameplay tip.
            Row(
                modifier = Modifier.padding(horizontal = 24.dp).height(44.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Tip · ",
                    color = Color(0xFFE8B84B),
                    fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.bodyMedium
                )
                Text(
                    text = LOADING_TIPS[tipIdx],
                    color = Color(0xFFC9B8E0),
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Center
                )
            }

            // Spinner + progress bar + percent readout.
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 0.dp).padding(bottom = 48.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                MiniSpinner()
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(9.dp)
                        .clip(RoundedCornerShape(100.dp))
                        .background(Color(0xBF0F0820))
                        .border(1.dp, Color(0x59E8B84B), RoundedCornerShape(100.dp))
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(pct / 100f)
                            .fillMaxSize()
                            .background(Brush.horizontalGradient(listOf(Color(0xFFC99A2E), Color(0xFFF5D783), Color(0xFFFFF3CF))))
                    )
                }
                Text(
                    "${pct.toInt()}%",
                    color = Color(0xFFF5D783),
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

@Composable
private fun Crest() {
    val infinite = rememberInfiniteTransition(label = "crest")
    val spin by infinite.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(tween(3400, easing = LinearEasing)),
        label = "crestSpin"
    )
    val pulse by infinite.animateFloat(
        initialValue = 1f,
        targetValue = 1.08f,
        animationSpec = infiniteRepeatable(tween(1100, easing = LinearEasing)),
        label = "crestPulse"
    )
    Box(modifier = Modifier.size(80.dp).padding(bottom = 4.dp), contentAlignment = Alignment.Center) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            rotate(spin) {
                drawArc(
                    brush = Brush.sweepGradient(listOf(Color.Transparent, Color(0xF2F5D783), Color.Transparent)),
                    startAngle = 0f,
                    sweepAngle = 360f,
                    useCenter = false,
                    style = androidx.compose.ui.graphics.drawscope.Stroke(width = size.minDimension * 0.14f)
                )
            }
        }
        Box(
            modifier = Modifier
                .size(62.dp)
                .border(1.dp, Color(0x66E8B84B), CircleShape)
        )
        Box(
            modifier = Modifier
                .size((30 * pulse).dp)
                .background(
                    Brush.linearGradient(listOf(Color(0xFFF7E2A0), Color(0xFFC99A2E))),
                    RoundedCornerShape(7.dp)
                )
        )
    }
}

@Composable
private fun MiniSpinner() {
    val infinite = rememberInfiniteTransition(label = "spinner")
    val spin by infinite.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(tween(900, easing = LinearEasing)),
        label = "miniSpin"
    )
    Canvas(modifier = Modifier.size(20.dp)) {
        rotate(spin) {
            drawArc(
                brush = Brush.sweepGradient(listOf(Color.Transparent, Color(0xFFF5D783))),
                startAngle = 0f,
                sweepAngle = 360f,
                useCenter = false,
                style = androidx.compose.ui.graphics.drawscope.Stroke(width = size.minDimension * 0.2f)
            )
        }
    }
}

private data class Mote(val x: Float, val y: Float, val size: Float, val alpha: Float, val phase: Float, val durationMs: Int)

/**
 * 18 floating gold motes, mockup lsDust keyframe: fade in by 15%, drift up
 * 120px while scaling to 1.1, fade out by 100%, randomized duration
 * (6.0-13.0s) and start delay (0-6.0s) per mote, generated once so identity
 * (and therefore the animation) never resets across recompositions.
 */
@Composable
private fun DustLayer() {
    val motes = remember {
        List(18) {
            Mote(
                x = Random.nextFloat(),
                y = 0.58f + Random.nextFloat() * 0.42f,
                size = 2f + Random.nextFloat() * 3f,
                alpha = 0.3f + Random.nextFloat() * 0.5f,
                phase = Random.nextFloat(),
                durationMs = (6000 + Random.nextFloat() * 7000).toInt()
            )
        }
    }
    val infinite = rememberInfiniteTransition(label = "dust")
    val density = androidx.compose.ui.platform.LocalDensity.current
    val driftPx = with(density) { 120.dp.toPx() }
    Box(modifier = Modifier.fillMaxSize()) {
        motes.forEach { m ->
            val t by infinite.animateFloat(
                initialValue = 0f,
                targetValue = 1f,
                animationSpec = infiniteRepeatable(tween(m.durationMs, easing = LinearEasing)),
                label = "mote"
            )
            val local = (t + m.phase) % 1f
            val opacity = when {
                local < 0.15f -> local / 0.15f
                else -> (1f - local)
            }.coerceIn(0f, 1f) * m.alpha
            Box(
                modifier = Modifier
                    .fillMaxWidth(m.x.coerceIn(0.01f, 1f))
                    .fillMaxHeight(m.y.coerceIn(0.01f, 1f))
            ) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .offset { androidx.compose.ui.unit.IntOffset(0, -(local * driftPx).toInt()) }
                        .size(m.size.dp)
                        .background(Color(0xFFF5D783).copy(alpha = opacity), CircleShape)
                )
            }
        }
    }
}
