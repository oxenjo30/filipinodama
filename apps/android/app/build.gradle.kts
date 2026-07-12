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

    // Test-only — never shipped in the app APK. MockWebServer pre-approved
    // for exercising RefreshAuthenticator / AuthApi against a real (fake)
    // HTTP server rather than hand-rolled OkHttp mocks.
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.okhttp.mockwebserver)
}
