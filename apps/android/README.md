# FilipinoDama — Native Android

Kotlin + Jetpack Compose native Android client. Separate Gradle toolchain —
zero impact on the pnpm/Node apps (`apps/web`, `apps/admin`, `apps/server`)
elsewhere in this repo.

Phase 1 scope: project scaffold, royal dark theme, 5-tab bottom navigation
shell with placeholder screens, and network/storage plumbing (API client,
secure cookie storage, socket stub). Phases 2-7 build out auth, gameplay,
economy, profile/social, and — this phase — Settings, legal pages, delete
account, and system states (maintenance/offline/error). Damath stays
web-only and is never added here (owner directive).

## Build

From `apps/android/`:

```sh
./gradlew assembleDebug
```

Output APK: `app/build/outputs/apk/debug/app-debug.apk`

Always pass `--no-daemon` in CI or scripted contexts to avoid orphaned
Gradle daemons:

```sh
./gradlew assembleDebug --no-daemon
```

## Run on an emulator or device

**Option A — Android Studio**: File → Open, point at `apps/android`, let it
sync, then Run on an emulator or connected device.

**Option B — command line**, with an emulator running or a device attached
(USB debugging enabled):

```sh
./gradlew installDebug
```

## Release / AAB

```sh
./gradlew bundleRelease
```

This produces an **unsigned** AAB at
`app/build/outputs/bundle/release/app-release.aab`. Release builds are
intentionally left unsigned and unminified (`isMinifyEnabled = false`) in
Phase 1 — the owner must add a keystore + Gradle `signingConfig` before a
real Play Store release build, and ProGuard/R8 tuning is deferred to a
later phase.

## Backend URL configuration

Both build types read `BuildConfig.BASE_URL`:

| Build type | `BASE_URL` | Notes |
|---|---|---|
| debug | `http://10.0.2.2:4000` | `10.0.2.2` is the Android emulator's alias for the host machine's `localhost` — points at a locally-running `apps/server` on port 4000. |
| release | `https://api.filipinodama.com` | Production API. |

**Physical device on the same LAN**: `10.0.2.2` only works inside the
emulator. To hit a local dev server from a real phone/tablet, override
`BASE_URL` for a one-off debug build — either edit the `debug` buildType's
`buildConfigField` in `app/build.gradle.kts` to your machine's LAN IP (e.g.
`http://192.168.1.23:4000`), or add a Gradle property override. Revert
before committing; this value is not meant to be a permanent per-developer
setting in Phase 1.

## Fonts

Self-hosted OFL 1.1 fonts (Cinzel, Inter, JetBrains Mono) live in
`app/src/main/res/font/`. See `NOTICE.md` for license/source details and a
note on why JetBrains Mono is OFL here (not Apache-2.0 as originally
assumed — Google Fonts relicensed it upstream).

## Project layout

```
apps/android/
├── app/
│   ├── build.gradle.kts
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── java/com/filipinodama/app/
│       │   ├── MainActivity.kt
│       │   ├── navigation/      # AppNavHost, BottomTabBar, route constants
│       │   ├── ui/
│       │   │   ├── theme/       # Color.kt, Type.kt, Theme.kt
│       │   │   └── screens/     # 5 tab placeholders + Splash
│       │   └── data/            # ApiEnvelope, SecureStore, PersistentCookieJar,
│       │                        # ApiClient, AuthApi, SocketClient
│       └── res/
│           ├── font/            # self-hosted variable fonts
│           ├── drawable/        # placeholder adaptive-icon vectors
│           └── mipmap-anydpi-v26/
├── gradle/
│   ├── libs.versions.toml       # version catalog
│   └── wrapper/
├── build.gradle.kts             # root, plugin declarations only
├── settings.gradle.kts
├── gradle.properties
├── NOTICE.md                    # font licenses
└── README.md                    # this file
```

## Push notifications (future work)

Phase 7 adds push-READINESS only — no live push. What's already in place:

- A `NotificationChannel` (`match_and_social`) is created idempotently on
  every app start (`PushNotifications.ensureChannel`, called from
  `MainActivity.onCreate`).
- The Android 13+ (API 33+) runtime `POST_NOTIFICATIONS` permission is
  requested from the Settings screen's "Push Notifications" toggle
  (declared in `AndroidManifest.xml`; requested via
  `ActivityResultContracts.RequestPermission()` in `SettingsScreen.kt`).
- `PushNotifications.onPushTokenReady(token: String)` is a documented,
  intentionally empty stub — the hand-off point for a future FCM device
  token, once Firebase is added.

To actually enable push later, the owner needs to:

1. Create a Firebase project and add an Android app to it (package
   `com.filipinodama.app`), then download `google-services.json` into
   `apps/android/app/`.
2. Add the Firebase BoM + `firebase-messaging-ktx` to
   `app/build.gradle.kts` and the Google Services Gradle plugin to the root
   `build.gradle.kts` — NOT done in this phase, by design (no Firebase
   dependency was added without the owner's project/config in hand).
3. Implement a `FirebaseMessagingService` that posts into the existing
   `PushNotifications.CHANNEL_ID` channel, and call
   `PushNotifications.onPushTokenReady(token)` from
   `onNewToken`/`FirebaseMessaging.getInstance().token`.
4. Add a server-side endpoint to receive + store the device token per user
   (none exists yet — `apps/server` has no push-token table/route), and a
   send path (e.g. via Firebase Admin SDK) for match invites, friend
   requests, guild activity, and support replies — the same events the
   in-app Notifications screen already surfaces.
5. Re-verify the `POST_NOTIFICATIONS` request flow still gates correctly
   once real notifications are posted (today nothing is posted, so the
   permission simply unlocks the OS-level toggle with no functional effect
   yet).

## Known Phase 1 limitations (by design, not oversight)

- No game/feature screens — only the 5 tab placeholders + splash.
- `AuthApi` / `SocketClient` are defined but not called from any UI.
- Headline gold-gradient text fill (`headlineGoldBrush()` in `Color.kt`) is
  defined but not yet wired into `Typography` — headings currently render
  solid gold via Material3's `colorScheme.primary`.
- Release build is unsigned; no ProGuard/R8 rules beyond the default
  template.
- Launcher icon is a placeholder vector monogram, not final brand art.
