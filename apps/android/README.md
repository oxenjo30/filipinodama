# FilipinoDama — Native Android (Phase 1 scaffold)

Kotlin + Jetpack Compose native Android client. Separate Gradle toolchain —
zero impact on the pnpm/Node apps (`apps/web`, `apps/admin`, `apps/server`)
elsewhere in this repo.

Phase 1 scope: project scaffold, royal dark theme, 5-tab bottom navigation
shell with placeholder screens, and network/storage plumbing (API client,
secure cookie storage, socket stub). No game screens, no feature logic yet.

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

## Google Sign-In setup (owner action required)

Native Google Sign-In uses Android's **Credential Manager** (`androidx.credentials`
+ `com.google.android.libraries.identity.googleid`), which hands the app a
Google-signed ID token that `POST /api/auth/oauth/google/token` verifies
server-side (same `GOOGLE_CLIENT_ID` env var, same find-or-create-user logic
as the web's OAuth redirect flow — see `apps/server/src/auth/oauth.ts`).

**This does not work out of the box.** Until the console step below is done,
tapping "Continue with Google" fails at credential retrieval on-device (or is
disabled if `GOOGLE_SERVER_CLIENT_ID` is unset — see below), even though the
client and server code paths are fully wired.

### 1. Get the debug keystore's SHA-1 fingerprint

```sh
keytool -list -v -keystore %USERPROFILE%\.android\debug.keystore -alias androiddebugkey -storepass android
```

(macOS/Linux: `~/.android/debug.keystore` instead of `%USERPROFILE%\.android\debug.keystore`.)
Copy the `SHA1:` value from the output.

### 2. Register an Android OAuth client in Google Cloud Console

In the **same Google Cloud project as the existing web OAuth client**
(the one behind the server's `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`):

1. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Application type: **Android**.
3. Package name: `com.filipinodama.app`.
4. SHA-1 certificate fingerprint: the value from step 1 (debug). Add the
   **release** signing key's SHA-1 here too once a real release keystore
   exists (see "Release / AAB" above — release builds are unsigned today).
5. Save. (No client secret is issued for Android clients — Credential
   Manager authenticates via the signed APK + this registration instead.)

This Android client registration is what lets Credential Manager return a
real Google credential for this app's package/signature. It does **not**
replace the web client ID — the app authenticates *against* the existing web
client ID (next step), the Android registration just authorizes this app's
package+signature to participate.

### 3. Configure `GOOGLE_SERVER_CLIENT_ID`

`GetGoogleIdOption.serverClientId` (in `GoogleSignInHelper.kt`) must be set to
the **WEB** OAuth client ID — the same one already configured as the server's
`GOOGLE_CLIENT_ID` — NOT the Android client ID created in step 2. This is by
design: Google's ID token audience (`aud`) is the *server-verifying* client,
so it must match what `apps/server/src/config/env.ts`'s `GOOGLE_CLIENT_ID`
expects, or the server's audience check rejects the token (401
`OAUTH_AUDIENCE_MISMATCH`).

Client IDs are not secrets, but no project-specific value is hardcoded in
source control — supply it via a Gradle property or environment variable:

```properties
# apps/android/local.properties (gitignored) or a global gradle.properties
GOOGLE_SERVER_CLIENT_ID=xxxxxxxxxxxx.apps.googleusercontent.com
```

or

```sh
GOOGLE_SERVER_CLIENT_ID=xxxxxxxxxxxx.apps.googleusercontent.com ./gradlew assembleDebug
```

With it unset (the default), `BuildConfig.GOOGLE_SERVER_CLIENT_ID` is `""`
and `GoogleSignInHelper` returns an honest "Google sign-in is not configured
yet" failure instead of attempting a credential request.

### Unverified state

As of this change, steps 1–3 above have **not** been performed by an
operator with Google Cloud Console access — only the code paths (server
endpoint, Android UI, Credential Manager wiring) are built and tested. Once
the console registration exists and `GOOGLE_SERVER_CLIENT_ID` is supplied,
on-device credential retrieval should be manually verified on an emulator or
device with a Google account signed in.

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

## Known Phase 1 limitations (by design, not oversight)

- No game/feature screens — only the 5 tab placeholders + splash.
- `AuthApi` / `SocketClient` are defined but not called from any UI.
- Headline gold-gradient text fill (`headlineGoldBrush()` in `Color.kt`) is
  defined but not yet wired into `Typography` — headings currently render
  solid gold via Material3's `colorScheme.primary`.
- Release build is unsigned; no ProGuard/R8 rules beyond the default
  template.
- Launcher icon is a placeholder vector monogram, not final brand art.
