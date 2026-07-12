package com.filipinodama.app.data.system

/**
 * Pure reducer for the top offline strip (SYSTEM_STATES.md `isOffline`,
 * z-index 400 — "coexists above everything"). Kept separate from
 * [ConnectivityObserver] (which is Android-Context-bound and only
 * exercisable via instrumented/robolectric tests) so the actual show/hide
 * DECISION is unit-testable in plain JVM tests.
 *
 * Rule: show the banner as soon as connectivity is lost; hide it once
 * connectivity returns. No debounce/hysteresis is modeled here (the
 * acceptance criterion in SYSTEM_STATES.md is "appears within ~1s of losing
 * connectivity and clears on reconnect", which the raw connectivity signal
 * already satisfies) — this function is intentionally a 1:1 mirror of the
 * boolean, expressed as its own type so call sites read as intent
 * ("should the banner show") rather than a bare inverted boolean.
 */
fun offlineBannerVisible(isOnline: Boolean): Boolean = !isOnline
