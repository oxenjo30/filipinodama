# In-App "Update Available" Nudge — Design

- **Date:** 2026-07-17
- **Status:** Approved
- **Scope:** Android app (`apps/android`) + one server config key. No web changes.

## Goal

When a newer Android build is live, show a dismissible "update available" prompt that sends the user to the app's Google Play listing. Non-blocking: the app stays fully usable.

## Decisions (locked)

- **Forcefulness:** Soft nudge only — dismissible dialog with "Later" / "Update now". No forced/hard gate.
- **Update target:** Google Play listing (`market://details?id=com.filipinodama.app`, with an `https://play.google.com/store/apps/details?id=…` fallback when the Play app is absent).
- **Re-nudge cadence:** Once per app session — if dismissed, don't show again until the next fresh launch/resume. No on-device persistence.

## Architecture

Piggyback on the existing config-polling system. The app already calls `ConfigRepository.refresh()` (fetches `GET /api/config/public`) on **app start and every foreground resume** (`AppNavHost` `DisposableEffect` on `ON_RESUME`), and derives state via pure, testable functions (the maintenance-mode pattern). The version check slots into the same flow.

### 1. Server — one new public config key

- Add `ANDROID_LATEST_VERSION` to `PUBLIC_CONFIG_KEYS` in `apps/server/src/modules/admin-config.ts` (currently `["MAINTENANCE_BANNER", "MAINTENANCE_TEXT", "DAILY_LOGIN_ENABLED", "WATCH_LIVE_ENABLED"]`).
- The value is an admin-editable string holding the latest Play **versionCode** as an integer, e.g. `"20"`. It flows through the existing admin config store and the existing `/config/public` response — **no new endpoint, no new table**.
- Absent/unset by default (admin sets it per release). Absent ⇒ no nudge.

### 2. Android — derive `updateAvailable` in `ConfigRepository`

- The device's own version is `BuildConfig.VERSION_CODE` — an `Int` Gradle auto-generates from `defaultConfig.versionCode` (no `buildConfigField` needed; already available).
- In `ConfigRepository.refresh()`, after the existing key reads, add:
  `_updateAvailable.value = deriveUpdateAvailable(cfg["ANDROID_LATEST_VERSION"], BuildConfig.VERSION_CODE)`
- Expose `val updateAvailable: StateFlow<Boolean>` (backing `_updateAvailable = MutableStateFlow(false)`).
- **Pure function** `deriveUpdateAvailable(latest: String?, current: Int): Boolean`:
  - `val latestCode = latest?.trim()?.toIntOrNull() ?: return false` — missing/non-numeric ⇒ `false`.
  - `return latestCode > current` — a strict integer comparison (versionCode is monotonic; avoids semver "1.10 < 1.9" traps).
  - Fail-safe: any doubt ⇒ `false` (never a false "please update").
- Same non-destructive refresh semantics as the rest of `refresh()`: a fetch failure returns early and leaves prior state as-is.

### 3. UI — `UpdateAvailableDialog`, shown from `AppNavHost`

- New composable `UpdateAvailableDialog(onUpdate, onDismiss)` — a Material3 `Dialog`: title "Update available", body copy, "Later" (dismiss) + "Update now" (primary).
- In `AppNavHost`: collect `ConfigRepository.updateAvailable`. Keep an in-memory `var updateDismissed by remember { mutableStateOf(false) }`. Show the dialog when `updateAvailable && !updateDismissed`.
  - This sits ABOVE the normal UI but is orthogonal to the maintenance takeover (maintenance is a full-screen `return` earlier; the update nudge only renders in the normal path). If maintenance is active, the maintenance screen wins — correct: don't nudge to update while blocked.
  - "Update now" → launch the Play intent (below), then set `updateDismissed = true` (so it doesn't re-show while they're in the Store; a fresh resume re-evaluates).
  - "Later" → `updateDismissed = true` for this session.
- **Play intent** (own helper, e.g. `openPlayStoreListing(context)`):
  - Try `Intent(ACTION_VIEW, "market://details?id=${context.packageName}")` with `FLAG_ACTIVITY_NEW_TASK`.
  - On `ActivityNotFoundException` (no Play app), fall back to `https://play.google.com/store/apps/details?id=${context.packageName}`.
  - Use `context.packageName` (not a hardcoded id) so debug/release both resolve correctly.

## Testing

- Unit-test `deriveUpdateAvailable` (JVM, no Android/network) across: `null` → false; `""` → false; `"abc"` → false; `"19"` vs current 20 → false (older/equal server value never nags); `"21"` vs 20 → true; whitespace `" 21 "` → true; equal `"20"` vs 20 → false.
- The dialog + intent are thin UI; verified by compile + manual reasoning (mirrors how the maintenance banner UI is treated).

## Scope boundaries

- Android-only. No web changes (browser auto-updates).
- No forced/hard update gate — soft nudge only.
- No Google in-app-update API (Play listing redirect only). In-app update can be a later fast-follow.
- No new server endpoint, table, or migration — reuses `/config/public` + the admin config store.
- Does not touch Damath, diamonds/monetization, credentials, or matchmaking.

## Rollout note

Because the app already re-reads config on every resume, flipping `ANDROID_LATEST_VERSION` in admin config takes effect on already-installed apps without a new release. Set it to the newest Play versionCode AFTER that build is live on Play (setting it higher than what's downloadable would nag users to update to something that isn't there yet).
