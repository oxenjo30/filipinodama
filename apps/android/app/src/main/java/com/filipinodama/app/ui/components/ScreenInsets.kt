package com.filipinodama.app.ui.components

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.windowInsetsPadding
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
 * Screen insets for a FORM — a screen root that owns text fields and therefore
 * has to survive the on-screen keyboard. Use this instead of [screenInsets],
 * and apply it BEFORE `.verticalScroll(...)`.
 *
 * Owner-reported (v53/v54): signing in with a saved password left the keyboard
 * covering the Sign in button, with no way to reach it — the login screen was
 * a dead end for anyone using a password manager.
 *
 * Two things went wrong, and both are easy to reproduce by hand:
 *
 * 1. CONSUMPTION ORDER. `screenInsets()` ends in navigationBarsPadding(), which
 *    CONSUMES the nav-bar inset. A later `.imePadding()` therefore pads by only
 *    what's left — and since the IME inset OVERLAPS the nav-bar inset, it
 *    under-pads by roughly the nav bar's height. The CTA ends up that far below
 *    the top of the keyboard: on screen, but untappable.
 *
 * 2. PLACEMENT. `.imePadding()` written AFTER `.verticalScroll(...)` pads the
 *    scrolling CONTENT rather than shrinking the scroll VIEWPORT, so the
 *    viewport still spans the full height, keyboard area included.
 *
 * `union` takes the max per edge, so the bottom is the keyboard height while
 * it's open and the nav-bar height when it isn't — one inset, applied once, so
 * there is nothing left to double-count or consume in the wrong order.
 */
@Composable
fun Modifier.screenInsetsWithIme(): Modifier =
    this.windowInsetsPadding(WindowInsets.systemBars.union(WindowInsets.ime))

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
