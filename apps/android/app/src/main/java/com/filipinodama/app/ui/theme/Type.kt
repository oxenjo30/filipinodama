@file:OptIn(ExperimentalTextApi::class)

package com.filipinodama.app.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.filipinodama.app.R

/**
 * Font families per DESIGN_SYSTEM.md:
 *   Cinzel          -> display / headings / logo / VS
 *   Inter           -> UI, body, buttons, labels
 *   JetBrains Mono  -> numbers, stats, counters, codes, timers
 *
 * Each family ships as a single self-hosted variable font (see NOTICE.md).
 * Individual weights are requested via FontVariation.Settings on the wght
 * axis; on Android versions/renderers that don't honor variable-font axes,
 * the font falls back to its default static instance (acceptable Phase 1
 * simplification — text stays legible, only exact weight may not match on
 * very old OS versions).
 */

private fun cinzelWeight(weight: FontWeight) = Font(
    resId = R.font.cinzel_variable,
    weight = weight,
    variationSettings = FontVariation.Settings(FontVariation.weight(weight.weight))
)

private fun interWeight(weight: FontWeight) = Font(
    resId = R.font.inter_variable,
    weight = weight,
    variationSettings = FontVariation.Settings(FontVariation.weight(weight.weight))
)

private fun jetBrainsMonoWeight(weight: FontWeight) = Font(
    resId = R.font.jetbrainsmono_variable,
    weight = weight,
    variationSettings = FontVariation.Settings(FontVariation.weight(weight.weight))
)

/**
 * Alfa Slab One — display face for the Play screen's primary CTA only.
 *
 * A heavy slab serif, chosen over an arcade sans so the button still lives in
 * Cinzel's classical world while surviving a white-fill / black-outline
 * treatment that a high-contrast serif cannot: Cinzel's thin strokes fill in
 * under a stroke of any weight.
 *
 * One static weight, so no variation axis. Deliberately NOT wired into
 * [Typography] — Cinzel stays the app's display face everywhere else.
 *
 * SIL Open Font License 1.1 — see docs/licenses/AlfaSlabOne-OFL.txt.
 */
val AlfaSlabFontFamily = FontFamily(Font(resId = R.font.alfa_slab_one))

val CinzelFontFamily = FontFamily(
    cinzelWeight(FontWeight.Medium),
    cinzelWeight(FontWeight.SemiBold),
    cinzelWeight(FontWeight.Bold),
    cinzelWeight(FontWeight.ExtraBold),
    cinzelWeight(FontWeight.Black)
)

val InterFontFamily = FontFamily(
    interWeight(FontWeight.Normal),
    interWeight(FontWeight.Medium),
    interWeight(FontWeight.SemiBold),
    interWeight(FontWeight.Bold),
    interWeight(FontWeight.ExtraBold)
)

val JetBrainsMonoFontFamily = FontFamily(
    jetBrainsMonoWeight(FontWeight.Medium),
    jetBrainsMonoWeight(FontWeight.SemiBold),
    jetBrainsMonoWeight(FontWeight.Bold)
)

/** Compose Material3 type scale: Cinzel for display/headline, Inter for body/label. */
val FdTypography = Typography(
    displayLarge = TextStyle(fontFamily = CinzelFontFamily, fontWeight = FontWeight.Black, fontSize = 57.sp),
    displayMedium = TextStyle(fontFamily = CinzelFontFamily, fontWeight = FontWeight.ExtraBold, fontSize = 45.sp),
    displaySmall = TextStyle(fontFamily = CinzelFontFamily, fontWeight = FontWeight.ExtraBold, fontSize = 36.sp),
    headlineLarge = TextStyle(fontFamily = CinzelFontFamily, fontWeight = FontWeight.Bold, fontSize = 32.sp),
    headlineMedium = TextStyle(fontFamily = CinzelFontFamily, fontWeight = FontWeight.Bold, fontSize = 28.sp),
    headlineSmall = TextStyle(fontFamily = CinzelFontFamily, fontWeight = FontWeight.SemiBold, fontSize = 24.sp),
    titleLarge = TextStyle(fontFamily = CinzelFontFamily, fontWeight = FontWeight.SemiBold, fontSize = 22.sp),
    titleMedium = TextStyle(fontFamily = InterFontFamily, fontWeight = FontWeight.SemiBold, fontSize = 16.sp),
    titleSmall = TextStyle(fontFamily = InterFontFamily, fontWeight = FontWeight.SemiBold, fontSize = 14.sp),
    bodyLarge = TextStyle(fontFamily = InterFontFamily, fontWeight = FontWeight.Normal, fontSize = 16.sp),
    bodyMedium = TextStyle(fontFamily = InterFontFamily, fontWeight = FontWeight.Normal, fontSize = 14.sp),
    bodySmall = TextStyle(fontFamily = InterFontFamily, fontWeight = FontWeight.Normal, fontSize = 12.sp),
    labelLarge = TextStyle(fontFamily = InterFontFamily, fontWeight = FontWeight.Bold, fontSize = 13.sp),
    labelMedium = TextStyle(fontFamily = InterFontFamily, fontWeight = FontWeight.Bold, fontSize = 12.sp),
    labelSmall = TextStyle(fontFamily = InterFontFamily, fontWeight = FontWeight.Medium, fontSize = 11.sp)
)

/**
 * Mono text styles for numbers/stats/counters/timers/room codes, matching
 * `.pill` (700 14px JetBrains Mono) from DESIGN_SYSTEM.md. Material3's
 * Typography has no dedicated mono slot, so these live outside the scale.
 */
object FdMonoStyles {
    val Pill = TextStyle(fontFamily = JetBrainsMonoFontFamily, fontWeight = FontWeight.Bold, fontSize = 14.sp)
    val StatSmall = TextStyle(fontFamily = JetBrainsMonoFontFamily, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
    val Timer = TextStyle(fontFamily = JetBrainsMonoFontFamily, fontWeight = FontWeight.Bold, fontSize = 20.sp)
}
