plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose.compiler)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "com.filipinodama.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.filipinodama.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"

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
            // NOTE: release build is intentionally left UNSIGNED for Phase 1.
            // Owner must add a keystore + signingConfig before shipping a real release build.
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
    implementation(libs.billing.ktx)

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
