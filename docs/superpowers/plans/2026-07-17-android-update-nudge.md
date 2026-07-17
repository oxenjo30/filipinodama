# Android In-App Update Nudge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a soft, dismissible "update available" prompt on Android when a newer Play build exists, sending the user to the Play Store listing.

**Architecture:** Piggyback on the existing `/api/config/public` poll (runs on app start + every resume via `ConfigRepository.refresh()`). Server adds one seeded, allow-listed config key `ANDROID_LATEST_VERSION` (an int). Android derives `updateAvailable: StateFlow<Boolean>` from that vs `BuildConfig.VERSION_CODE` through a pure fail-safe function, and `AppNavHost` shows a dialog whose "Update now" opens the Play listing.

**Tech Stack:** Kotlin, Jetpack Compose (Material3), Retrofit; Fastify + Prisma (server); JUnit4 (Android JVM unit tests).

**Spec:** `docs/superpowers/specs/2026-07-17-android-update-nudge-design.md` (approved + review-corrected).

## Global Constraints

- **The config key MUST be both seeded AND allow-listed.** The admin PATCH endpoint only *updates* existing rows (404s `NO_CONFIG` on unknown keys) and the admin UI only renders existing rows — so an un-seeded key can never be set and the feature would be permanently inert. Seed it in `CONFIG_SEED` (`apps/server/prisma/seed.ts`) AND add it to `PUBLIC_CONFIG_KEYS` (`apps/server/src/modules/admin-config.ts`).
- **Config type is `"int"`, seed value `"0"`.** Server `validate()` enforces `/^-?\d+$/` for `int` (rejects `"v20"` garbage); `"0"` is the disabled sentinel (real versionCodes ≥1, so `0 > current` = false ⇒ no nudge). Never seed `""` (fails the int validator).
- **Cadence = once per PROCESS.** `updateDismissed` is a plain `remember` in the long-lived `AppNavHost`; it survives resume and resets only on cold start. Do NOT reset it in the `ON_RESUME` observer.
- **Fail-safe client.** `deriveUpdateAvailable` returns `false` for null/blank/non-numeric/`"0"`/older/equal server values — never a false "please update."
- **Value entered is the Play `versionCode` (int), not the `versionName`** — they're off-by-one (`versionCode=20`, `versionName="0.1.19"`). The seeded row's `label` must say so.
- **Android-only.** No web changes. Does not touch Damath, diamonds/monetization, credentials, or matchmaking.
- **Build gates:** server `pnpm --filter server typecheck`; Android `./gradlew :app:testDebugUnitTest` (the derive test) + `./gradlew compileDebugKotlin`.

---

### Task 1: Server — seed + allow-list `ANDROID_LATEST_VERSION`

**Files:**
- Modify: `apps/server/prisma/seed.ts` (CONFIG_SEED array, ~line 159-166)
- Modify: `apps/server/src/modules/admin-config.ts` (PUBLIC_CONFIG_KEYS, line 43)

**Interfaces:**
- Produces: a `Config` row `ANDROID_LATEST_VERSION` (`type: "int"`, default `"0"`) that (a) appears in the admin config panel for editing and (b) is emitted by `GET /api/config/public`.
- Consumes: nothing.

- [ ] **Step 1: Add the seed row.** In `apps/server/prisma/seed.ts`, append to the `CONFIG_SEED` array (keep the existing field shape — every row has `key/value/type/category/label`):

```ts
const CONFIG_SEED = [
  { key: "MAINTENANCE_BANNER", value: "false", type: "bool", category: "flag", label: "Maintenance banner" },
  { key: "MAINTENANCE_TEXT", value: "", type: "string", category: "flag", label: "Maintenance banner text" },
  { key: "DAILY_LOGIN_ENABLED", value: "true", type: "bool", category: "flag", label: "Daily login bonus enabled" },
  // Owner directive 2026-07-12: Watch Live PAGE hidden by default (safe-off).
  // Spectate flows/links stay live regardless — this only gates the page + nav.
  { key: "WATCH_LIVE_ENABLED", value: "false", type: "bool", category: "flag", label: "Watch Live page enabled" },
  // Android "update available" nudge. Value = the LATEST Play versionCode as an
  // integer (NOT the versionName — they're off-by-one). "0" = disabled (no
  // versionCode is < 1, so 0 > current is always false ⇒ no nudge). type "int"
  // so the admin can't save non-numeric garbage. Re-seeding never clobbers a
  // live admin edit (the upsert update-branch omits `value`).
  { key: "ANDROID_LATEST_VERSION", value: "0", type: "int", category: "flag", label: "Android latest versionCode (integer, NOT the version name)" },
];
```

- [ ] **Step 2: Allow-list it for the public endpoint.** In `apps/server/src/modules/admin-config.ts` line 43:

```ts
const PUBLIC_CONFIG_KEYS = ["MAINTENANCE_BANNER", "MAINTENANCE_TEXT", "DAILY_LOGIN_ENABLED", "WATCH_LIVE_ENABLED", "ANDROID_LATEST_VERSION"] as const;
```

- [ ] **Step 3: Typecheck.** Run: `pnpm --filter server typecheck`. Expected: PASS (no output errors).
- [ ] **Step 4: Commit.**

```bash
git add apps/server/prisma/seed.ts apps/server/src/modules/admin-config.ts
git commit -m "feat(server): seed + expose ANDROID_LATEST_VERSION public config for the update nudge"
```

> **Reviewer note (not a code step):** prod must be re-seeded after deploy so the row exists before an admin can edit it (same "needs prod re-seed" pattern as season trophies). Flag this in the task report; it's an ops action, not code.

---

### Task 2: Android — `deriveUpdateAvailable` pure function + `updateAvailable` StateFlow

**Files:**
- Modify: `apps/android/app/src/main/java/com/filipinodama/app/data/config/ConfigRepository.kt`
- Test: `apps/android/app/src/test/java/com/filipinodama/app/data/config/UpdateAvailableTest.kt` (create)

**Interfaces:**
- Consumes: `cfg["ANDROID_LATEST_VERSION"]` (the raw config map already read in `refresh()`), `BuildConfig.VERSION_CODE` (Int, auto-generated — `buildConfig = true` is on).
- Produces:
  - `fun deriveUpdateAvailable(latest: String?, current: Int): Boolean` (pure, top-level, testable — mirrors `deriveWatchLiveEnabled` at line 99).
  - `val updateAvailable: StateFlow<Boolean>` on `ConfigRepository` (backing `_updateAvailable = MutableStateFlow(false)`).

- [ ] **Step 1: Write the failing test.** Create `apps/android/app/src/test/java/com/filipinodama/app/data/config/UpdateAvailableTest.kt` (mirrors `MaintenanceGateTest.kt`'s style):

```kotlin
package com.filipinodama.app.data.config

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Update-nudge state — pure [deriveUpdateAvailable]. Compares the server's
 * ANDROID_LATEST_VERSION (a Play versionCode int, from GET /api/config/public)
 * against the device's own BuildConfig.VERSION_CODE. Fail-safe: any missing,
 * blank, non-numeric, "0", older, or equal server value ⇒ false (never a false
 * "please update"); only a strictly-greater server value ⇒ true.
 */
class UpdateAvailableTest {

    @Test fun `strictly newer server versionCode yields true`() {
        assertEquals(true, deriveUpdateAvailable("21", 20))
    }

    @Test fun `equal or older server versionCode never nags`() {
        assertEquals(false, deriveUpdateAvailable("20", 20))
        assertEquals(false, deriveUpdateAvailable("19", 20))
    }

    @Test fun `disabled sentinel zero yields false`() {
        assertEquals(false, deriveUpdateAvailable("0", 20))
    }

    @Test fun `missing blank or non-numeric is fail-safe false`() {
        assertEquals(false, deriveUpdateAvailable(null, 20))
        assertEquals(false, deriveUpdateAvailable("", 20))
        assertEquals(false, deriveUpdateAvailable("   ", 20))
        assertEquals(false, deriveUpdateAvailable("v20", 20))
        assertEquals(false, deriveUpdateAvailable("1.0.19", 20))
    }

    @Test fun `surrounding whitespace is trimmed before parsing`() {
        assertEquals(true, deriveUpdateAvailable("  21  ", 20))
    }
}
```

- [ ] **Step 2: Run the test to verify it fails.** Run: `cd apps/android && ./gradlew :app:testDebugUnitTest --tests "com.filipinodama.app.data.config.UpdateAvailableTest"`. Expected: FAIL / compile error — `deriveUpdateAvailable` unresolved.

- [ ] **Step 3: Implement the pure function.** In `ConfigRepository.kt`, add a top-level function next to `deriveWatchLiveEnabled` (near line 99):

```kotlin
/**
 * True only when the server advertises a strictly-newer Play versionCode than
 * this build. Fail-safe: null / blank / non-numeric / "0" / older / equal ⇒
 * false (never a false "please update"). Integer comparison because versionCode
 * is monotonic — avoids semver "1.10 < 1.9" traps.
 */
fun deriveUpdateAvailable(latest: String?, current: Int): Boolean {
    val latestCode = latest?.trim()?.toIntOrNull() ?: return false
    return latestCode > current
}
```

- [ ] **Step 4: Add the StateFlow + wire it into refresh().** In `ConfigRepository.kt`:
  - After the `_watchLiveEnabled` declaration (~line 43-44), add:

```kotlin
    // "update available" nudge — true when the server's ANDROID_LATEST_VERSION
    // versionCode is strictly greater than this build's BuildConfig.VERSION_CODE.
    private val _updateAvailable = MutableStateFlow(false)
    val updateAvailable: StateFlow<Boolean> = _updateAvailable.asStateFlow()
```

  - Inside `refresh()`, after the existing `cfg[...]` reads (after line 63), add:

```kotlin
        _updateAvailable.value = deriveUpdateAvailable(
            cfg["ANDROID_LATEST_VERSION"],
            com.filipinodama.app.BuildConfig.VERSION_CODE
        )
```

  (The existing early-return-on-fetch-failure at the top of `refresh()` already gives the "offline / first launch ⇒ stays false" guarantee — no change needed there.)

- [ ] **Step 5: Run the test to verify it passes.** Run: `cd apps/android && ./gradlew :app:testDebugUnitTest --tests "com.filipinodama.app.data.config.UpdateAvailableTest"`. Expected: PASS (6 tests).

- [ ] **Step 6: Commit.**

```bash
git add apps/android/app/src/main/java/com/filipinodama/app/data/config/ConfigRepository.kt apps/android/app/src/test/java/com/filipinodama/app/data/config/UpdateAvailableTest.kt
git commit -m "feat(android): derive updateAvailable from ANDROID_LATEST_VERSION vs BuildConfig.VERSION_CODE"
```

---

### Task 3: Android — `UpdateAvailableDialog` + Play-listing intent helper

**Files:**
- Create: `apps/android/app/src/main/java/com/filipinodama/app/ui/components/UpdateAvailableDialog.kt`

**Interfaces:**
- Consumes: nothing (self-contained UI + intent).
- Produces:
  - `@Composable fun UpdateAvailableDialog(onUpdate: () -> Unit, onDismiss: () -> Unit)` — Material3 `Dialog`.
  - `fun openPlayStoreListing(context: android.content.Context)` — market:// with https fallback, both guarded.

- [ ] **Step 1: Write the file.** Create `apps/android/app/src/main/java/com/filipinodama/app/ui/components/UpdateAvailableDialog.kt`:

```kotlin
package com.filipinodama.app.ui.components

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel

/**
 * Soft, dismissible "update available" prompt. Non-blocking — "Later" keeps the
 * user on the current build. "Update now" opens the app's Play listing.
 */
@Composable
fun UpdateAvailableDialog(onUpdate: () -> Unit, onDismiss: () -> Unit) {
    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(Panel, RoundedCornerShape(20.dp))
                .padding(24.dp)
        ) {
            Text("✨ Update available", color = GoldLt, style = MaterialTheme.typography.titleMedium)
            Text(
                "A newer version of FilipinoDama is ready. Update for the latest features and fixes.",
                color = Ink,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = 8.dp, bottom = 20.dp)
            )
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                Text(
                    "Later",
                    color = Ink2,
                    style = MaterialTheme.typography.labelLarge,
                    modifier = Modifier.clickable { onDismiss() }.padding(horizontal = 16.dp, vertical = 10.dp)
                )
                Text(
                    "Update now",
                    color = Color(0xFF2A1607),
                    style = MaterialTheme.typography.labelLarge,
                    modifier = Modifier
                        .clickable { onUpdate() }
                        .background(Gold, RoundedCornerShape(10.dp))
                        .padding(horizontal = 18.dp, vertical = 10.dp)
                )
            }
        }
    }
}

/**
 * Open the app's Google Play listing. Tries the Play app (market://) first, then
 * falls back to the web listing. Both are guarded: a device with neither Play nor
 * a browser must not crash the click handler. packageName resolves to the real
 * Play id (com.filipinodama.app) in debug and release (single applicationId, no
 * debug suffix).
 */
fun openPlayStoreListing(context: Context) {
    val id = context.packageName
    val market = Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$id"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
        context.startActivity(market)
    } catch (_: ActivityNotFoundException) {
        val web = Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$id"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            context.startActivity(web)
        } catch (_: ActivityNotFoundException) {
            // No Play app AND no browser — nothing we can open; don't crash.
        }
    }
}
```

- [ ] **Step 2: Compile.** Run: `cd apps/android && ./gradlew compileDebugKotlin`. Expected: BUILD SUCCESSFUL.
- [ ] **Step 3: Commit.**

```bash
git add apps/android/app/src/main/java/com/filipinodama/app/ui/components/UpdateAvailableDialog.kt
git commit -m "feat(android): UpdateAvailableDialog + guarded Play-listing intent helper"
```

---

### Task 4: Android — show the dialog from `AppNavHost` (once per process)

**Files:**
- Modify: `apps/android/app/src/main/java/com/filipinodama/app/navigation/AppNavHost.kt`

**Interfaces:**
- Consumes: `ConfigRepository.updateAvailable` (Task 2), `UpdateAvailableDialog` + `openPlayStoreListing` (Task 3), the existing `context` val (line 214), `LocalContext`.
- Produces: nothing.

**Context:** Maintenance mode is a full-screen `return` at ~line 261 BEFORE the normal `Column` (line 264). Placing the dialog inside that normal `Column` means it never renders during maintenance (correct — don't nudge while blocked). `context` and `scope` already exist (~line 214-215). The `updateDismissed` flag is a plain `remember` in this long-lived composable, so it survives resume and only resets on cold start — the intended once-per-process cadence. Do NOT reset it in the `ON_RESUME` `DisposableEffect` (~line 220-228).

- [ ] **Step 1: Collect the flow + dismissed flag.** After `val updateAvailable`... is available (add near the other `by ...collectAsState()` reads, e.g. after line 213 `val maintenance by ...`):

```kotlin
    val updateAvailable by ConfigRepository.updateAvailable.collectAsState()
    var updateDismissed by remember { mutableStateOf(false) }
```

(`mutableStateOf`, `remember`, `getValue`, `setValue`, `collectAsState` are already imported in this file.)

- [ ] **Step 2: Render the dialog in the normal path.** Inside the normal-path `Column` (the one opened at line 264, after `OfflineBanner`/`SanctionBanner`/`Scaffold`), add the dialog as the LAST child of that `Column` (so it overlays the Scaffold content). Just before the `Column`'s closing brace:

```kotlin
        if (updateAvailable && !updateDismissed) {
            UpdateAvailableDialog(
                onUpdate = {
                    openPlayStoreListing(context)
                    updateDismissed = true
                },
                onDismiss = { updateDismissed = true }
            )
        }
```

- [ ] **Step 3: Add imports.** Add:

```kotlin
import com.filipinodama.app.ui.components.UpdateAvailableDialog
import com.filipinodama.app.ui.components.openPlayStoreListing
```

- [ ] **Step 4: Compile.** Run: `cd apps/android && ./gradlew compileDebugKotlin`. Expected: BUILD SUCCESSFUL.
- [ ] **Step 5: Full unit-test gate.** Run: `cd apps/android && ./gradlew :app:testDebugUnitTest`. Expected: PASS (incl. the new `UpdateAvailableTest`, no regressions).
- [ ] **Step 6: Commit.**

```bash
git add apps/android/app/src/main/java/com/filipinodama/app/navigation/AppNavHost.kt
git commit -m "feat(android): show UpdateAvailableDialog when a newer version is advertised (once per process)"
```

---

## Notes for the controller

- Tasks are ordered by dependency: T2 needs nothing from T1 at compile time (they're independent files), but T4 depends on T2 (the flow) and T3 (the dialog). T1 (server) is fully independent. A safe serial order is T1 → T2 → T3 → T4; T1 and T2/T3 could interleave but serial is simplest.
- No `versionCode` bump is needed for THIS change to ship in code — but the whole point of the feature is that a FUTURE build sets `ANDROID_LATEST_VERSION` to its code. The nudge itself is dormant (`"0"`) until an admin sets it.
