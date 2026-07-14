package com.filipinodama.app.data.billing

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper

/**
 * Resolves the host [Activity] from a Compose [android.content.Context]
 * (`LocalContext.current` is usually an Activity directly under this app's
 * single-Activity navigation, but may be wrapped — e.g. by a ContextThemeWrapper
 * — so this unwraps defensively). Needed only for
 * [BillingClient.launchBillingFlow], which requires a real Activity, unlike
 * Credential Manager's Google sign-in flow which accepts a plain Context.
 * Returns null (never throws) when no Activity can be found, so callers can
 * show an honest "can't start purchase right now" state instead of crashing.
 */
fun Context.findActivity(): Activity? {
    var ctx = this
    while (ctx is ContextWrapper) {
        if (ctx is Activity) return ctx
        ctx = ctx.baseContext
    }
    return null
}
