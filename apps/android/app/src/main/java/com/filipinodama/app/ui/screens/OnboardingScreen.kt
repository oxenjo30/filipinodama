package com.filipinodama.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.ui.screens.auth.AuthPrimaryButton
import com.filipinodama.app.ui.screens.auth.AuthSecondaryButton
import com.filipinodama.app.ui.theme.Bg
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2

/**
 * Onboarding carousel — shown once, right after a fresh (non-guest) account
 * is created, per apps/web/src/features/onboarding/OnboardingFlow.tsx
 * (the real, wired, currently-shipped onboarding tour — used here as the
 * authoritative copy/slide source rather than the older prototype's generic
 * 3-dot placeholder in mobile-screen-inventory.md §2 Screen 3, since that
 * inventory describes an earlier pre-real-content iteration of this exact
 * flow). 4 slides, dot pagination, Skip always available, final slide's CTA
 * reads "Enter the Arena".
 *
 * On completion (Skip or finishing slide 4) persists
 * SecureStore.KEY_ONBOARDED = true — the native equivalent of the web
 * client's localStorage "fdr.onboarded" flag — so a returning user is never
 * re-shown the tour after a process restart.
 */

private val EYEBROWS = listOf("✦ Welcome ✦", "How to play", "Your currencies", "Ready to play")
private val TITLES = listOf(
    "Welcome to FilipinoDama Royal",
    "Capture to win",
    "Trophies, Gold & Diamonds",
    "Choose how you play"
)
private val BODIES = listOf(
    "You've joined the royal board of the Philippines. Let's take a quick tour so you're ready for your first match.",
    "Move your pieces diagonally and jump over your opponent to capture. Captures are mandatory — reach the far row to promote a piece into a crowned Dama king.",
    "Earn Trophies from ranked wins to climb the tiers, spend Gold from victories in the store, and unlock premium cosmetics with Diamonds.",
    "Practice against the AI, jump into ranked matchmaking, or open a private room and invite a friend. Your kingdom awaits."
)
private const val SLIDE_COUNT = 4

@Composable
fun OnboardingScreen(onFinished: () -> Unit) {
    var step by remember { mutableIntStateOf(0) }

    fun finish() {
        AuthRepository.setOnboarded()
        AuthRepository.clearJustRegistered()
        onFinished()
    }

    fun next() {
        if (step >= SLIDE_COUNT - 1) finish() else step += 1
    }

    val last = step == SLIDE_COUNT - 1

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Bg)
            .padding(horizontal = 28.dp, vertical = 24.dp)
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            Text(
                text = "Skip",
                color = Ink2,
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier
                    .clickable { finish() }
                    .padding(8.dp)
            )
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(top = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                text = EYEBROWS[step],
                color = Gold,
                style = MaterialTheme.typography.labelLarge
            )

            Box(
                modifier = Modifier
                    .padding(top = 20.dp, bottom = 6.dp)
                    .size(120.dp)
                    .background(Gold.copy(alpha = 0.1f), RoundedCornerShape(24.dp)),
                contentAlignment = Alignment.Center
            ) {
                Box(
                    modifier = Modifier
                        .size(56.dp)
                        .background(Gold.copy(alpha = 0.35f), CircleShape)
                )
            }

            Text(
                text = TITLES[step],
                style = MaterialTheme.typography.headlineMedium,
                color = GoldLt,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 16.dp)
            )
            Text(
                text = BODIES[step],
                color = Ink,
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 12.dp)
            )

            // Dot pagination — active dot is wider, per the design convention
            // used elsewhere in the app (see mobile-screen-inventory.md §2
            // Screen 3, "Dot pagination" row).
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.padding(vertical = 22.dp)
            ) {
                repeat(SLIDE_COUNT) { index ->
                    Box(
                        modifier = Modifier
                            .height(9.dp)
                            .width(if (index == step) 22.dp else 9.dp)
                            .background(
                                color = if (index == step) Gold else Gold.copy(alpha = 0.28f),
                                shape = RoundedCornerShape(100.dp)
                            )
                            .clickable { step = index }
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                if (step > 0) {
                    AuthSecondaryButton(
                        text = "Back",
                        onClick = { step -= 1 },
                        modifier = Modifier.weight(1f)
                    )
                }
                AuthPrimaryButton(
                    text = if (last) "Enter the Arena" else "Next",
                    onClick = { next() },
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }
}
