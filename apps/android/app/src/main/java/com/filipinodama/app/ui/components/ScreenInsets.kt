package com.filipinodama.app.ui.components

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * System-inset helpers for PUSHED (non-tab) screens.
 *
 * WHY THIS EXISTS: AppNavHost zeroes the Scaffold's window insets for every
 * pushed route (so a screen can draw its own header/back-button flush to the top
 * if it wants). The consequence is that EACH pushed screen must add its own
 * status-bar (top) and nav/gesture-bar (bottom) padding — and historically almost
 * none did, so headers tucked under the notch and primary CTAs (Leave, Place
 * Order, Claim, Delete Account…) jammed against the Android gesture bar. That's
 * the "looks like a compressed web app" symptom. This file is the single
 * convention that fixes it everywhere; see docs/ops/android-mobile-layout-audit.md.
 *
 * Use ONE of these per screen root:
 *  - [screenInsets]        — for a plain Column/Box screen root: pads BOTH the
 *                            status bar (top) and the nav bar (bottom).
 *  - [screenInsetsTopOnly] — when the bottom is a LazyColumn (use
 *                            [screenContentPadding] on the list instead, so it
 *                            stays scrollable all the way down).
 *  - [screenContentPadding]— a LazyColumn `contentPadding` that reserves the
 *                            nav-bar height at the bottom (+ optional extra), so
 *                            the last row clears the gesture bar without clipping
 *                            the scroll region.
 *
 * These are additive to whatever padding the screen already applies.
 */

/** Pad a screen root by both the status bar (top) and nav/gesture bar (bottom). */
fun Modifier.screenInsets(): Modifier = this.statusBarsPadding().navigationBarsPadding()

/** Status-bar (top) padding only — pair with [screenContentPadding] on a LazyColumn. */
fun Modifier.screenInsetsTopOnly(): Modifier = this.statusBarsPadding()

/** Nav/gesture-bar (bottom) padding only — for a screen whose top is already handled. */
fun Modifier.screenInsetsBottomOnly(): Modifier = this.navigationBarsPadding()

/**
 * `contentPadding` for a LazyColumn that reserves the real nav/gesture-bar height
 * at the bottom (so the last item clears it) plus [extraBottom] breathing room,
 * with [top] above the first item. Keeps the list scrollable to the very bottom
 * on every device (3-button nav, gesture nav, tall cutouts).
 */
@Composable
fun screenContentPadding(
    top: Dp = 0.dp,
    horizontal: Dp = 0.dp,
    extraBottom: Dp = 16.dp,
): PaddingValues {
    val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    return PaddingValues(
        start = horizontal,
        end = horizontal,
        top = top,
        bottom = navBottom + extraBottom,
    )
}
