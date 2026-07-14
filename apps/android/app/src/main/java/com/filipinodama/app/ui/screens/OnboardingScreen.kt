package com.filipinodama.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.filipinodama.app.BuildConfig
import com.filipinodama.app.data.AuthRepository
import com.filipinodama.app.ui.theme.Bg
import com.filipinodama.app.ui.theme.Gold

/**
 * Onboarding carousel — mobile-screen-inventory.md `isOnboard` modal,
 * rebuilt 1:1 against handoffv3/FilipinoDama Mobile.dc.html lines 131-154
 * plus the slide data at mockup-split lines 4021-4025 (Tier-2 UI-fidelity
 * pass). The mockup's `onb` array carries REAL named slide content — not a
 * generic 3-dot placeholder as a prior pass assumed when it substituted the
 * web client's own 4-slide OnboardingFlow.tsx copy instead. The mockup is
 * the 1:1 source of truth: 3 slides, real illustration art (not an icon
 * placeholder), final-slide CTA "Start Playing" (not "Enter the Arena").
 *
 * dama_redesign_1.png (slide 1's art) was present in the handoff bundle
 * (handoffv3/uploads/) but had never been copied into
 * apps/web/public/assets — the same static host every other mockup image
 * already resolves from (StoreAssets.kt / AvatarAssets.kt precedent). Copied
 * it there so Coil can load it remotely like every other art asset; this is
 * restoring a real handoff-provided asset, not fabricating one.
 *
 * On completion (Skip or finishing slide 3) persists
 * SecureStore.KEY_ONBOARDED = true — the native equivalent of the web
 * client's localStorage "fdr.onboarded" flag — so a returning user is never
 * re-shown the tour after a process restart.
 */

private data class OnbSlide(val img: String)

// Owner-supplied full-bleed onboarding banners (play-store-assets/, normalised
// into apps/web/public/assets). Each banner already contains its own title and
// tagline baked into the art ("MASTER THE BOARD — Sharpen your strategy", etc.),
// so the slide carries ONLY the image: the layout below renders the banner
// full-width and does NOT draw any separate title/body text (that would double
// the wording). Replaces the earlier square art + app-rendered captions.
private val SLIDES = listOf(
    OnbSlide("onb-board.png"),
    OnbSlide("onb-ranks.png"),
    OnbSlide("onb-friends.png")
)
private const val SLIDE_COUNT = 3

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
    val slide = SLIDES[step]

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Bg)
    ) {
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(horizontal = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            // Full-bleed banner — the owner's art already contains the title and
            // tagline, so no separate Text is drawn. ContentScale.Fit letterboxes
            // on the brand background so no baked-in text is ever cropped,
            // regardless of the banner's native ratio.
            AsyncImage(
                model = "${BuildConfig.WEB_ORIGIN}/assets/${slide.img}",
                contentDescription = null,
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(20.dp))
            )
        }

        Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 34.dp).padding(bottom = 40.dp)) {
            Row(
                horizontalArrangement = Arrangement.Center,
                modifier = Modifier.fillMaxWidth().padding(bottom = 22.dp)
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                    repeat(SLIDE_COUNT) { index ->
                        Box(
                            modifier = Modifier
                                .height(8.dp)
                                .width(if (index == step) 22.dp else 8.dp)
                                .background(
                                    color = if (index == step) Gold else Color(0x47E8B84B),
                                    shape = RoundedCornerShape(100.dp)
                                )
                                .clickable { step = index }
                        )
                    }
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Text(
                    text = "Skip",
                    color = Color(0xFF8B7CAE),
                    style = MaterialTheme.typography.labelLarge,
                    modifier = Modifier.clickable { finish() }.padding(12.dp)
                )
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clickable { next() }
                        .background(androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Color(0xFFEFC25A), Color(0xFFC9971F))), RoundedCornerShape(15.dp))
                        .border(1.dp, Color(0x80E8B84B), RoundedCornerShape(15.dp))
                        .padding(vertical = 16.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = if (last) "Start Playing" else "Next",
                        color = Color(0xFF3A2405),
                        style = MaterialTheme.typography.titleMedium
                    )
                }
            }
        }
    }
}
