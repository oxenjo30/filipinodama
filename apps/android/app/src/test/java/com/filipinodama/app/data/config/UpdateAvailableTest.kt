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
