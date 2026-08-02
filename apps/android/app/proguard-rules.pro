# R8 / ProGuard rules for the release build.
#
# WHY MINIFY IS ON NOW
#
# The release shipped with isMinifyEnabled = false, justified in build.gradle.kts
# as "enabling it needs keep rules for Retrofit / kotlinx.serialization /
# socket.io / Coil / Google credentials or the release crashes". That was never
# actually tested: this file was a 4-line placeholder with ZERO keep rules, so
# R8 had never been run against any rules at all.
#
# Checked dependency by dependency, most already ship their own consumer rules
# and need nothing from us:
#
#   retrofit               META-INF/proguard/retrofit2.pro                 ships
#   okhttp                 META-INF/proguard/okhttp3.pro                   ships
#   kotlinx.serialization  META-INF/proguard/kotlinx-serialization-*.pro   ships
#   androidx.credentials / googleid   proguard.txt inside each .aar        ships
#   coil                   none needed (Kotlin, no reflection)
#
# The genuine gaps are socket.io / engine.io (reflective event plumbing, plus a
# bundled org.json) and our own @Serializable classes, whose GENERATED
# serializer members are not covered by the library's rules.
#
# WHAT WAS ACTUALLY AT STAKE
#
# Not size. With minify off the shipped dex carried 438 readable first-party
# class descriptors — AuthRepository, ApiClient, SecureStore, GoogleSignInHelper
# — so anyone could pull the AAB, run jadx, and read the session handling and
# every endpoint in original form. Repackaging a modified client was a
# copy-paste job, which matters wherever the server trusts a client-reported
# value (see the /api/matches/local audit finding).
#
# And with no mapping file, production crash reports were un-symbolicated: a
# real crash in the wild could not be triaged at all.

# ── Kotlin metadata / reflection ─────────────────────────────────────────────
# Generic signatures and annotations that kotlinx.serialization and Retrofit
# both read at runtime to resolve types.
-keepattributes Signature, InnerClasses, EnclosingMethod
-keepattributes RuntimeVisibleAnnotations, RuntimeVisibleParameterAnnotations
-keepattributes AnnotationDefault

# ── socket.io / engine.io ────────────────────────────────────────────────────
# The client dispatches events reflectively and pulls in org.json. Without these
# R8 warns on optional missing deps and can strip transport internals — failing
# at RUNTIME rather than at build time, which is precisely the "release crashes"
# outcome that kept minify switched off.
-keep class io.socket.** { *; }
-keep interface io.socket.** { *; }
-dontwarn io.socket.**
-dontwarn org.json.**

# ── OkHttp / Okio ────────────────────────────────────────────────────────────
# Optional compile-time-only providers OkHttp references but does not require.
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# ── Our own @Serializable DTOs ───────────────────────────────────────────────
# The kotlinx.serialization plugin generates `Companion.serializer()` and a
# `$$serializer` for every @Serializable class. The library's shipped rules
# cover the LIBRARY; the generated members on OUR classes still have to survive,
# or every socket payload and API response fails to decode at runtime.
#
# SCOPED TO `data.**` ON PURPOSE. The first version of these rules matched
# `com.filipinodama.app.**` — the whole app — which is what the kotlinx docs
# show with a placeholder package. That kept ~590 first-party class names
# readable, i.e. R8 shrank the app but barely obfuscated it. Every @Serializable
# class in this project lives under `data/` (verified by grep), so narrowing the
# match lets the entire ui/ and navigation/ tree be renamed while the DTO
# machinery still survives.
-keepclassmembers class com.filipinodama.app.data.** {
    *** Companion;
    kotlinx.serialization.KSerializer serializer(...);
}
-keepclasseswithmembers class com.filipinodama.app.data.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.filipinodama.app.data.**$$serializer { *; }

# ── Retrofit interfaces ──────────────────────────────────────────────────────
# Retrofit implements these with a dynamic proxy and reads their annotations, so
# the interfaces must not be stripped (their names may still be obfuscated).
-keep,allowobfuscation interface com.filipinodama.app.data.**Api
-keep,allowobfuscation interface retrofit2.http.**

# ── Crash triage ─────────────────────────────────────────────────────────────
# Keep line numbers so stack traces stay resolvable through mapping.txt, but
# rename the source-file attribute so original file names are not shipped.
-keepattributes SourceFile, LineNumberTable
-renamesourcefileattribute SourceFile
