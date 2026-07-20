package com.filipinodama.app.ui.screens.auth

import android.content.Context
import android.os.Build
import android.view.autofill.AutofillManager

/**
 * Ask the Android Autofill framework to finalize the current autofill session so
 * the OS shows its "Save password?" prompt (Google Password Manager / the user's
 * vault) after a SUCCESSFUL login or account creation.
 *
 * Why this is needed: the app fills credentials via Compose's [androidx.compose.ui.autofill]
 * `LocalAutofill` tree (see AuthComponents.AuthTextField), which reliably handles
 * AUTOFILL but does NOT, on its own, trigger the SAVE prompt. The save prompt is
 * driven by the autofill session being COMMITTED — normally when the autofilled
 * Activity/view context is finished. Our auth flow navigates away immediately on
 * success (LoginScreen/CreateAccountScreen call onLoginSuccess/onAccountCreated),
 * which tears down the composition before the framework decides to save. Calling
 * [AutofillManager.commit] explicitly on success tells the OS "the credential the
 * user just entered led to a successful sign-in — offer to save it."
 *
 * Safe/no-op cases: only runs on API 26+ (AutofillManager exists from O; app
 * minSdk is 26); a no-op if the device has no autofill service, if autofill is
 * disabled, or if there is no active session — commit() just returns. It never
 * exposes the credential (the values live in the OS autofill session, not here).
 */
fun commitAutofillOnAuthSuccess(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    runCatching {
        val afm = context.getSystemService(AutofillManager::class.java) ?: return
        if (afm.isEnabled) afm.commit()
    }
}
