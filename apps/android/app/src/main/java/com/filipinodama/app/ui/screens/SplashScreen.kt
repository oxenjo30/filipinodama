package com.filipinodama.app.ui.screens

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.filipinodama.app.R
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.ui.theme.Bg2
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldHi
import com.filipinodama.app.ui.theme.GoldLo
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink
import kotlinx.coroutines.async
import kotlinx.coroutines.delay

/**
 * Splash / loading screen — replaces the Phase 1 tap-to-enter placeholder
 * with the approved royal loader design (handoffv3/Loading Screen.dc.html,
 * "default" context: ornate rotating gold crest, "FILIPINO" eyebrow +
 * gradient-gold "DAMA ROYAL" wordmark, tip line, spinner + progress bar,
 * background art `load-throne-portrait.webp`).
 *
 * Unlike the design file's standalone/looping preview mode, this instance
 * always runs the "boot" flow: on first composition it calls
 * [AuthRepository.refreshMe] against GET /api/auth/me (session probe) and
 * reports which destination to navigate to once resolved:
 *   - signed-in (guest or real) + onboarded  -> Home tabs
 *   - signed-in, not yet onboarded           -> Onboarding carousel
 *   - no session                             -> Login
 */

/**
 * Minimum time the splash fill is shown before navigation, even if the session
 * probe resolves instantly. The bar eases toward 90% across this window and the
 * final 10% is spent the moment the probe completes, so the loader always reads
 * as real, visible progress that reaches 100% before Home appears (rather than
 * flashing and cutting away mid-fill on a fast probe / warm cache).
 */
private const val MIN_VISIBLE_MS = 1400L

@Composable
fun SplashScreen(onResolved: (SplashDestination) -> Unit) {
    // Real, monotonic boot progress that is JOINED to the session probe — the
    // bar must reach 100% BEFORE we navigate (owner fix: "it hasn't been 100%
    // but it already moved to the home page"). The bar and the navigation used
    // to be two independent timelines (an infinite decorative loop + a
    // fire-the-instant-the-probe-returns effect), so on a fast probe the app
    // jumped to Home while the bar sat at ~40%. Now one coroutine drives both:
    // ease toward 90% while the probe is in flight, snap to 100% once it
    // resolves (and never before the floor time so the fill is always visible),
    // hold the full bar for a beat, then navigate.
    var progress by remember { mutableFloatStateOf(0f) }

    // Loading-screen music, same as the in-flow LoadingOverlay (mirrors web).
    // Gated by the Music setting; stops when the splash leaves the composition.
    androidx.compose.runtime.DisposableEffect(Unit) {
        com.filipinodama.app.data.audio.SoundManager.startLoadingMusic()
        onDispose { com.filipinodama.app.data.audio.SoundManager.stopLoadingMusic() }
    }

    LaunchedEffect(Unit) {
        // OWNER POLICY (2026-07-15): NEVER auto-create a guest account and never
        // force a login wall on launch. Probe the existing session; if there is
        // none the user browses ANONYMOUSLY (user == null, no server record) and
        // goes straight into the app. Login is prompted ONLY at gated actions —
        // claiming rewards and playing Ranked (see ModeSelectScreen / the reward
        // screens). A returning signed-in (real) user still resolves to Home.

        // Kick the session probe off concurrently with the fill animation.
        // (coroutineScope makes `this` a scope so async can run alongside the
        // fill loop below and be awaited once the floor time is also met.)
        kotlinx.coroutines.coroutineScope {
        val probe = async { runCatching { AuthRepository.refreshMe() != null }.getOrDefault(false) }

        val t0 = System.currentTimeMillis()
        // While loading, creep toward the 90% ceiling over ~MIN_VISIBLE_MS so
        // the fill reads as real progress; the last 10% is reserved for the
        // moment the probe actually completes.
        while (!probe.isCompleted || (System.currentTimeMillis() - t0) < MIN_VISIBLE_MS) {
            val elapsed = System.currentTimeMillis() - t0
            val eased = (elapsed.toFloat() / MIN_VISIBLE_MS).coerceIn(0f, 1f)
            progress = (eased * 0.9f).coerceAtMost(0.9f)
            delay(32)
        }
        val hasUser = probe.await()

        // Probe done and the minimum-visible floor is met: drive the final
        // stretch to a full 100% so it's never a sudden jump from mid-fill.
        while (progress < 1f) {
            progress = (progress + 0.06f).coerceAtMost(1f)
            delay(16)
        }
        progress = 1f
        // Hold the full bar briefly so 100% actually registers before we leave.
        delay(200)

        onResolved(resolveSplashDestination(hasUser = hasUser, onboarded = AuthRepository.isOnboarded()))
        }
    }

    val infiniteTransition = rememberInfiniteTransition(label = "splash")
    val crestRotation by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(3400, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "crestRotation"
    )
    val spinnerRotation by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(900, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "spinnerRotation"
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Bg2)
    ) {
        Image(
            painter = painterResource(id = R.drawable.loading_throne_portrait),
            contentDescription = null,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop
        )
        // Bottom scrim so the wordmark/tip/progress row stay legible over the art.
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(Color.Transparent, Bg2.copy(alpha = 0.85f), Bg2.copy(alpha = 0.97f)),
                        startY = 0f
                    )
                )
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 24.dp, vertical = 48.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            // Center crest + wordmark, pinned roughly mid-screen like the design.
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.padding(top = 140.dp)
            ) {
                SunEmblem(rotationDegrees = crestRotation)
                Text(
                    text = "FILIPINO",
                    color = GoldLt,
                    fontFamily = MaterialTheme.typography.labelLarge.fontFamily,
                    fontSize = 15.sp,
                    letterSpacing = 7.sp
                )
                Text(
                    text = "DAMA ROYAL",
                    style = MaterialTheme.typography.displaySmall,
                    color = GoldLt
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(top = 20.dp)
                ) {
                    Divider(width = 56.dp)
                    Text(
                        text = "PREPARING THE COURT",
                        color = Gold,
                        fontSize = 12.sp,
                        letterSpacing = 3.sp,
                        modifier = Modifier.padding(horizontal = 14.dp)
                    )
                    Divider(width = 56.dp)
                }
            }

            // Bottom: tip + spinner/progress bar.
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(20.dp)
            ) {
                Text(
                    text = "Tip: Kapag may kaya kang kunin, kailangan mong kunin — captures are forced.",
                    color = Ink,
                    fontSize = 14.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(horizontal = 8.dp)
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier
                            .size(20.dp)
                            .rotate(spinnerRotation),
                        color = GoldLt,
                        strokeWidth = 2.dp
                    )
                    LoaderProgressBar(progress = progress, modifier = Modifier.weight(1f))
                    Text(
                        text = "${(progress * 100).toInt()}%",
                        color = GoldLt,
                        fontFamily = MaterialTheme.typography.labelSmall.fontFamily,
                        fontSize = 14.sp
                    )
                }
            }
        }
    }
}

/** Destination the splash screen resolves to once the session probe finishes. */
enum class SplashDestination { Auth, Onboarding, Home }

/**
 * Pure decision function for where Splash sends the user, kept separate
 * from the composable so it's unit-testable without an Android Context.
 *
 * Launch NEVER routes to the login wall — an anonymous user (no session)
 * browses freely, so routing depends only on whether onboarding has been
 * seen, NOT on whether a user is signed in:
 *   - NOT yet onboarded (anyone)    -> Onboarding
 *   - onboarded (anyone)            -> Home
 * [hasUser] is retained for the signature/tests but no longer sends anyone to
 * Auth; login is prompted later, only at gated actions (rewards / Ranked).
 */
fun resolveSplashDestination(hasUser: Boolean, onboarded: Boolean): SplashDestination = when {
    onboarded -> SplashDestination.Home
    else -> SplashDestination.Onboarding
}

@Composable
private fun Divider(width: androidx.compose.ui.unit.Dp) {
    Box(
        modifier = Modifier
            .width(width)
            .height(1.dp)
            .background(Gold.copy(alpha = 0.55f))
    )
}


/**
 * The real handoff sun emblem (`logo-sun.png`, ASSETS.md "Sun logo mark"),
 * replacing the earlier Compose-drawn gradient-blob crest per the owner
 * directive to use handoff art verbatim rather than approximate it. A soft
 * gold glow halo sits behind the image (kept from the original design) and
 * the slow rotation animation carries over onto the real artwork.
 */
@Composable
private fun SunEmblem(rotationDegrees: Float) {
    Box(
        modifier = Modifier
            .size(88.dp)
            .padding(bottom = 22.dp),
        contentAlignment = Alignment.Center
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    brush = Brush.radialGradient(
                        colors = listOf(GoldLt.copy(alpha = 0.35f), GoldLt.copy(alpha = 0f))
                    ),
                    shape = CircleShape
                )
        )
        Image(
            painter = painterResource(id = R.drawable.logo_sun),
            contentDescription = "FilipinoDama",
            modifier = Modifier
                .size(72.dp)
                .rotate(rotationDegrees * 0.15f) // real art spins subtly, not a full blur-spin
        )
    }
}

@Composable
private fun LoaderProgressBar(progress: Float, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .height(9.dp)
            .background(Color(0xFF0F0820).copy(alpha = 0.75f), shape = RoundedCornerShape(100.dp))
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(fraction = progress.coerceIn(0f, 1f))
                .fillMaxSize()
                .background(
                    brush = Brush.horizontalGradient(colors = listOf(GoldLo, GoldLt)),
                    shape = RoundedCornerShape(100.dp)
                )
        )
    }
}
