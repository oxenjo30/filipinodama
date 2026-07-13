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
@Composable
fun SplashScreen(onResolved: (SplashDestination) -> Unit) {
    LaunchedEffect(Unit) {
        val user = AuthRepository.refreshMe()
        onResolved(resolveSplashDestination(hasUser = user != null, onboarded = AuthRepository.isOnboarded()))
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
    val progress by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(2600, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "progress"
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
 * from the composable so it's unit-testable without an Android Context:
 *   - no session                    -> Auth (Login)
 *   - session + onboarded           -> Home
 *   - session + NOT yet onboarded   -> Onboarding
 */
fun resolveSplashDestination(hasUser: Boolean, onboarded: Boolean): SplashDestination = when {
    !hasUser -> SplashDestination.Auth
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
