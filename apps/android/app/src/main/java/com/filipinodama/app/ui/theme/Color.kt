package com.filipinodama.app.ui.theme

import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

/**
 * Design tokens lifted verbatim from `handoffv3/handoff/DESIGN_SYSTEM.md`.
 * Do not invent new colors here — every token below must trace back to that
 * spec. If a new color is needed, add it to DESIGN_SYSTEM.md first.
 */

// ---- Gold family ----
val Gold = Color(0xFFE8B84B)
val GoldLt = Color(0xFFF5D783)
val GoldDp = Color(0xFFC99A2E)
val GoldHi = Color(0xFFF7E2A0) // headline gradient top
val GoldLo = Color(0xFFD5A63A) // headline gradient bottom

// ---- Players ----
val Red = Color(0xFFA0303A) // Red / crimson player
val Blue = Color(0xFF2E6BC6) // Blue / royal player
val Green = Color(0xFF2F8F5B) // success / online
val Purple = Color(0xFF4A2D7A) // accent

// ---- Ink / text ----
val Ink = Color(0xFFC9B8E0) // body text on dark
val Ink2 = Color(0xFF9A86BD) // muted / secondary
val TextDefault = Color(0xFFEFE7FB) // default foreground

// ---- Surfaces ----
val Bg = Color(0xFF160B28) // app background base
val Bg2 = Color(0xFF120922) // deepest
val FrameBg = Color(0xE61E1134) // rgba(30,17,52,.9) -> ~90% alpha (0xE6) over #1E1134
val Panel = Color(0xFF1E1134)
val Panel2 = Color(0xFF231239)

// ---- Bottom tab bar ----
val TabActiveGold = Color(0xFFF0CF72)
val TabInactiveViolet = Color(0xFF6F5F92)

// ---- Rank tier accents ----
val RankWood = Color(0xFF8A6A43)
val RankBronze = Color(0xFFC67B3E)
val RankSilver = Color(0xFFC9D2DF)
val RankGold = Color(0xFFE8B84B)
val RankPlatinum = Color(0xFF4FD0C0)
val RankGrandmaster = Color(0xFFB98CFF)

// ---- Button gradient pairs (top -> bottom, per DESIGN_SYSTEM.md `.btn-*`) ----
// Gold button uses a dark ink text color, all others use TextDefault.
// Mockup red-button gradient (d93b52 → a51e35). Was a darker/desaturated
// A83744→6E1B24; corrected to the mockup value (MATCH-2, systemic — fixes every
// GameButtonVariant.RED across the app).
val ButtonRedTop = Color(0xFFD93B52)
val ButtonRedBottom = Color(0xFFA51E35)
val ButtonPurpleTop = Color(0xFF3D2A6B)
val ButtonPurpleBottom = Color(0xFF241640)
val ButtonBlueTop = Color(0xFF2F5DA8)
val ButtonBlueBottom = Color(0xFF1A356B)
val ButtonGreenTop = Color(0xFF2F8F5B)
val ButtonGreenBottom = Color(0xFF175236)
val ButtonGoldTop = Color(0xFFF0CF72)
val ButtonGoldBottom = Color(0xFFC99A2E)
val ButtonGoldTextColor = Color(0xFF3A2405)

/**
 * Vertical gradient brushes for the five `.btn-*` variants. No buttons are
 * built in Phase 1 — these are defined now so future phases have a single
 * source of truth to consume instead of re-deriving from hex values.
 */
fun buttonRedBrush(): Brush = Brush.verticalGradient(listOf(ButtonRedTop, ButtonRedBottom))
fun buttonPurpleBrush(): Brush = Brush.verticalGradient(listOf(ButtonPurpleTop, ButtonPurpleBottom))
fun buttonBlueBrush(): Brush = Brush.verticalGradient(listOf(ButtonBlueTop, ButtonBlueBottom))
fun buttonGreenBrush(): Brush = Brush.verticalGradient(listOf(ButtonGreenTop, ButtonGreenBottom))
fun buttonGoldBrush(): Brush = Brush.verticalGradient(listOf(ButtonGoldTop, ButtonGoldBottom))

/**
 * Headline gold gradient text fill (`#f7e2a0` -> `#d5a63a`), matching the
 * web version's `linear-gradient(180deg,#f7e2a0,#d5a63a)` text-clip effect.
 * Follow-up (not done in Phase 1): wire this into Typography via
 * Text(style = ..., brush = headlineGoldBrush()) once headline composables
 * exist; for now Type.kt uses solid GoldLt for simplicity.
 */
fun headlineGoldBrush(): Brush = Brush.verticalGradient(colors = listOf(GoldHi, GoldLo))
