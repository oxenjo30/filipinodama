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

### 1. Server — one new public config key (allow-list **and** seed)

Two changes are BOTH required — the allow-list alone is not enough:

- **Allow-list:** add `ANDROID_LATEST_VERSION` to `PUBLIC_CONFIG_KEYS` in `apps/server/src/modules/admin-config.ts` (currently `["MAINTENANCE_BANNER", "MAINTENANCE_TEXT", "DAILY_LOGIN_ENABLED", "WATCH_LIVE_ENABLED"]`) so `/config/public` emits it.
- **Seed the row (mandatory):** add it to `CONFIG_SEED` in `apps/server/prisma/seed.ts`, e.g.
  `{ key: "ANDROID_LATEST_VERSION", value: "0", type: "int", label: "Android latest versionCode (integer, NOT the version name)" }`.
  This is **not optional**: the admin write path (`PATCH /admin/config/:key`) only *updates* existing rows and 404s `NO_CONFIG` on an unknown key — it cannot *create* one — and the admin UI (`apps/admin/src/pages/Settings.tsx`) only renders rows that already exist. So without the seed row the key never appears in the admin panel and can never be set: the feature would be permanently inert. (`CONFIG_SEED`'s upsert seeds `value` only on create, so re-seeding never clobbers a later admin edit.)
- **`type: "int"`** (not `"string"`): the server `validate()` gate enforces `/^-?\d+$/` for `int`, so an admin can't save garbage like `"v20"` / `"1.0.19"` (which would silently disable the nudge). It also means the value can't be blanked — use **`"0"` as the disabled sentinel** (real versionCodes are ≥1; `deriveUpdateAvailable("0", current)` is `0 > current` = false ⇒ no nudge).
- **Prod re-seed required:** after deploy, prod must be re-seeded so the row exists before an admin can edit it (same "needs prod re-seed" pattern as the season-trophy change). No new endpoint or table — reuses the existing config store + `/config/public`.

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
  - "Update now" → launch the Play intent (below), then set `updateDismissed = true`.
  - "Later" → `updateDismissed = true`.
  - **Cadence = once per PROCESS, not per resume.** `AppNavHost` is a long-lived composable; `ON_RESUME` re-runs `ConfigRepository.refresh()` but does NOT recreate the composition, so a plain `remember`-backed `updateDismissed` survives every foreground resume and only resets on a cold app start. That is the intended, non-naggy behavior: after "Later"/"Update now" the dialog stays gone until the next cold launch. **Do NOT reset `updateDismissed` in the `ON_RESUME` observer** (doing so would make it re-nag on every foreground return).
- **Play intent** (own helper, e.g. `openPlayStoreListing(context)`):
  - Try `Intent(ACTION_VIEW, "market://details?id=${context.packageName}")` with `FLAG_ACTIVITY_NEW_TASK`.
  - On `ActivityNotFoundException` (no Play app), fall back to `Intent(ACTION_VIEW, "https://play.google.com/store/apps/details?id=${context.packageName}")`.
  - **Wrap the https fallback in its own try/catch** too — a device with neither Play nor any browser throws `ActivityNotFoundException` on the fallback as well; catch it and no-op (don't crash the click handler).
  - Use `context.packageName` (not a hardcoded id). The app has a single `applicationId` with no debug `applicationIdSuffix`, so `packageName` resolves to the real Play id (`com.filipinodama.app`) in both debug and release.

## Edge-case guarantees (correct-by-construction; stated so nobody "fixes" them)

- **First launch / offline / pre-fetch:** `_updateAvailable` starts `false`, and `refresh()` returns early on a failed fetch leaving prior state — so before the first successful `/config/public` read (including fully offline), **no nudge shows**. Do not initialize the flow to `true`.
- **Guest vs signed-in:** identical. `/config/public` is unauthenticated and the check reads only `BuildConfig.VERSION_CODE` + public config — **do not add an auth gate**.
- **Disabled state:** `ANDROID_LATEST_VERSION = "0"` (the seed default) ⇒ `0 > current` is false ⇒ no nudge. That is how the feature ships "off" until an admin intentionally bumps it.

## Testing

- Unit-test `deriveUpdateAvailable` (JVM, no Android/network) across: `null` → false; `""` → false; `"abc"` → false; `"0"` → false (disabled sentinel); `"19"` vs current 20 → false (older/equal server value never nags); `"21"` vs 20 → true; whitespace `" 21 "` → true; equal `"20"` vs 20 → false. Place it in the Android unit-test source set (`app/src/test/...`) so the existing JVM test suite runs it.
- The dialog + intent are thin UI; verified by compile + manual reasoning (mirrors how the maintenance banner UI is treated).

## Scope boundaries

- Android-only. No web changes (browser auto-updates).
- No forced/hard update gate — soft nudge only.
- No Google in-app-update API (Play listing redirect only). In-app update can be a later fast-follow.
- No new server endpoint, table, or migration — reuses `/config/public` + the admin config store (the one server addition is a `CONFIG_SEED` row + the allow-list entry).
- Does not touch Damath, diamonds/monetization, credentials, or matchmaking.

## Rollout note

Because the app already re-reads config on every resume, flipping `ANDROID_LATEST_VERSION` in admin config takes effect on already-installed apps without a new release.

**Enter the Play `versionCode` (an integer), NOT the `versionName`.** They are deliberately off-by-one here (`versionCode = 20`, `versionName = "0.1.19"`), and the code/upload history is non-linear (e.g. code 14 was built but never uploaded), so read the exact `versionCode` off the Play Console release page. Consequences of getting it wrong:
- **Too high** (e.g. set to a code not yet downloadable) → every current install is nagged toward an update that isn't there. Soft/dismissible, so annoying not blocking — but wrong. Set it only AFTER that build is live on Play.
- **Typed the versionName digits** (e.g. `19` instead of `20`) → `19 > 20` is false → the nudge is silently *disabled*. No error; it just never fires.

The seeded row's `label` ("Android latest versionCode (integer, NOT the version name)") surfaces this hint right at the admin edit field. The too-low direction is self-limiting (strict `latest > current` ⇒ just no nag), so no guard is needed there.
