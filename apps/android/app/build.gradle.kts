import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose.compiler)
    alias(libs.plugins.kotlin.serialization)
}

// Release signing — credentials live in a gitignored keystore.properties (never
// committed). Absent on CI / a fresh clone, in which case the release build is
// left unsigned (a debug build is unaffected). See docs for the upload key.
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) keystorePropsFile.inputStream().use { load(it) }
}

android {
    namespace = "com.filipinodama.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.filipinodama.app"
        minSdk = 26
        targetSdk = 35
        // Play permanently reserves every uploaded versionCode (even deleted
        // ones), so each upload must bump it. 1 = uploaded then deleted; 2 =
        // first accepted internal-testing bundle; 3 = tablet width-cap build;
        // 4 = system-bar insets fix + new onboarding art; 5 = real 4xx error
        // messages + Match Detail scroll + Store Buy button + owner onboarding
        // banners + Profile overview logout; 6 = universal guild approval + Store
        // preview affordance; 7 = anonymous mode (no auto-guest; login gated to
        // rewards + Ranked; "Continue as guest" removed); 8 = smarter Hard AI +
        // offline vs-AI player cards (AI Opponent / Guest); 9 = loader always
        // fills to 100% before the board (no mid-jump); 10 = CRASH FIX — harden
        // EncryptedSharedPreferences init (was crashing launch on newer devices
        // e.g. Galaxy S25) + exclude the encrypted prefs from backup; 11 =
        // re-upload of the same crash fix (10 was already used on Play); 12 =
        // SPLASH loader now fills to 100% before Home (was jumping early) +
        // AI-difficulty/Mode-Select screens scroll (Start Match was unreachable)
        // + smaller AI cards + Login back button + Profile/Guild un-gated for
        // anonymous browsing + UNIVERSAL "Sign in required" modal replacing the
        // generic "not authenticated" error on gated actions (store/room/etc);
        // 13 = matchmaking now connects cross-platform (SocketClient polling+ws,
        // was websocket-only → mobile never authenticated → no human/AI match) +
        // tournament browsing un-gated (server attachUser; join still gated) +
        // store card redesigned (price on its own row above +/Buy, no more
        // cramped wrap) + AUDIO added (looping loading-screen music + board SFX:
        // move/capture/king/win/lose, gated by Sound/Music settings) + store
        // item preview now animates (bob + breathing glow) + joining a room now
        // prompts sign-in (realtime socket rejects anonymous); 14 = online Quick
        // Match now gated behind sign-in too (was letting a not-logged-in user
        // start a search that can never pair — the socket rejects anonymous, so
        // no human match AND no AI fallback; offline Play-vs-AI stays open) +
        // code/security-review hardening: bounded SFX audio thread pool + music
        // start/stop race fixed, plaintext-secure-store fallback now flagged +
        // kdoc corrected, RefreshAuthenticator startsWith + single-flight refresh,
        // cookie jar uses RFC-6265 Cookie.matches, Discover-Guilds join failure
        // surfaced instead of swallowed. (14 was built but NEVER uploaded — 15
        // supersedes it and contains everything in 14.) 15 = LATENCY: online
        // moves now apply OPTIMISTICALLY (your piece moves the instant you tap,
        // reconciled/rolled-back by the server's authoritative echo) so a laggy
        // connection no longer freezes the board waiting for the round-trip;
        // "Sending move…" hint while a move is in flight. (Pairs with a server-
        // side connectionStateRecovery change that deploys with the API.) 16 =
        // matchmaking no longer strands a player whose socket reconnected before
        // pairing (server resolves the CURRENT socket by userId + signals a
        // dropped player instead of silent-dropping — pairs with a server change)
        // + mobile no longer hangs on "Loading match…" for an abandoned/gone
        // match (exits on ENDED + an 8s resync timeout) + Home re-fetches the
        // active-match card on resume so a stale "Continue" card auto-clears +
        // Discover-Guilds join button now reads "Join" → "Request Sent ✓" with
        // real feedback (was silent); 17 = SESSION FIX — the app no longer logs
        // you out after close+reopen: the ~15-min access token expires while
        // closed and GET /api/auth/me returns 200 {user:null} (not 401) so the
        // 401-only refresh never fired and the 30-day refresh token went unused;
        // refreshMe() now proactively POSTs /api/auth/refresh + retries /me once
        // before concluding you're signed out.
        versionCode = 17
        versionName = "0.1.16"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // Google Sign-In (Credential Manager) server client ID — OPTIONAL local-dev
        // override only. Per the owner's shared-credentials directive (web and
        // mobile share API credentials, no mobile-specific keys/config), the app
        // resolves this from the SERVER at runtime via GET /api/auth/providers'
        // `googleClientId` field (see GoogleSignInHelper.resolveClientId) — the
        // same WEB OAuth client ID the server's GOOGLE_CLIENT_ID env var already
        // verifies token audience against. This BuildConfig field is used ONLY as
        // a fallback when the server value is unavailable (e.g. pointing a debug
        // build at a different client ID than whatever a shared dev server
        // currently returns); it is never required for normal operation. Supply
        // it via a Gradle property (gradle.properties, not checked in) or an
        // environment variable if you need the override:
        //   GOOGLE_SERVER_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
        // See apps/android/README.md for the Google Cloud Console app-registration
        // step (Android OAuth client + debug SHA-1) Google sign-in still depends on.
        val googleServerClientId = (project.findProperty("GOOGLE_SERVER_CLIENT_ID") as String?)
            ?: System.getenv("GOOGLE_SERVER_CLIENT_ID")
            ?: ""
        buildConfigField("String", "GOOGLE_SERVER_CLIENT_ID", "\"$googleServerClientId\"")
    }

    signingConfigs {
        // Only define the release signing config when the keystore.properties is
        // present (i.e. on the owner's machine). On CI / fresh clones it's absent
        // and the release build stays unsigned rather than failing the build.
        if (keystorePropsFile.exists()) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            // Emulator-to-host-localhost alias; see README for physical-device overrides.
            buildConfigField("String", "BASE_URL", "\"http://10.0.2.2:4000\"")
            // Web origin for shareable room links (rooms.get scoped to the real
            // web dev server so a debug-build share link is still openable).
            buildConfigField("String", "WEB_ORIGIN", "\"http://10.0.2.2:5173\"")
        }
        release {
            buildConfigField("String", "BASE_URL", "\"https://api.filipinodama.com\"")
            // Real production web origin (apps/web) — used to build cross-platform
            // room share links (https://filipinodama.com/rooms?code=X), matching
            // apps/web/src/features/rooms/PrivateRoomPage.tsx's window.location.origin.
            buildConfigField("String", "WEB_ORIGIN", "\"https://filipinodama.com\"")
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            // NOTE on the two Play upload warnings (both advisory-only, never
            // block an upload):
            //  1. "no deobfuscation file" — expected: R8/minify is OFF (enabling
            //     it needs keep rules for Retrofit / kotlinx.serialization /
            //     socket.io / Coil / Google credentials or the release crashes).
            //  2. "no native debug symbols" — the app's ONLY native lib is the
            //     prebuilt, already-stripped androidx.graphics.path .so (Compose
            //     path rendering). It carries no symbols to bundle, so
            //     ndk { debugSymbolLevel } has nothing to attach and the warning
            //     persists regardless — left off to keep this config minimal. If
            //     first-party native code is ever added, revisit debugSymbolLevel.
            // Sign with the upload key when keystore.properties is present.
            if (keystorePropsFile.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.material.icons.extended)
    implementation(libs.androidx.navigation.compose)
    debugImplementation(libs.androidx.ui.tooling)

    implementation(libs.androidx.security.crypto)

    implementation(libs.kotlinx.serialization.json)

    implementation(libs.retrofit.core)
    implementation(libs.okhttp.core)
    implementation(libs.okhttp.logging.interceptor)

    implementation(libs.socketio.client)

    implementation(libs.coil.compose)

    // Google Play Billing — real-money diamond top-up (dark behind
    // DIAMOND_TOPUP_ENABLED; see data/billing/BillingRepository.kt).
    implementation(libs.billing.ktx)

    // Sign-in with Google (Credential Manager) — native auth, mirrors the web's
    // Google OAuth. serverClientId is the WEB client ID (see GOOGLE_SERVER_CLIENT_ID
    // above); credentials-play-services-auth backs GetGoogleIdOption on-device.
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play.services.auth)
    implementation(libs.googleid)

    // Test-only — never shipped in the app APK. MockWebServer pre-approved
    // for exercising RefreshAuthenticator / AuthApi against a real (fake)
    // HTTP server rather than hand-rolled OkHttp mocks.
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.okhttp.mockwebserver)
}
