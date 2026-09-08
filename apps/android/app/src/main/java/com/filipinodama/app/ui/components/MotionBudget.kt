package com.filipinodama.app.ui.components

import android.app.ActivityManager
import android.content.Context
import android.os.PowerManager
import android.provider.Settings
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner

/**
 * How much ambient motion this device should be asked to run.
 *
 * The Play screen animates continuously for as long as a player sits on it, so
 * it has to be a good citizen: honour battery saver, honour the accessibility
 * "remove animations" setting, and back off on low-RAM hardware.
 */
enum class MotionBudget {
    /** Everything on. */
    FULL,

    /** Half-speed clock, fewer particles. Battery saver and low-RAM devices. */
    REDUCED,

    /**
     * A single static frame. Note this still *draws* — the light is part of the
     * scene, so switching it off must freeze it, not delete it.
     */
    OFF
}

/**
 * Pure resolution so the policy can be unit-tested without a device.
 *
 * [animatorScale] is `Settings.Global.ANIMATOR_DURATION_SCALE`; the platform
 * reports `0f` when the user has turned animations off (Developer options, or
 * Accessibility → Remove animations), which is the strongest possible signal
 * and therefore wins over every other input.
 */
fun resolveMotionBudget(
    powerSaveMode: Boolean,
    animatorScale: Float,
    lowRamDevice: Boolean
): MotionBudget = when {
    animatorScale == 0f -> MotionBudget.OFF
    powerSaveMode || lowRamDevice -> MotionBudget.REDUCED
    else -> MotionBudget.FULL
}

/**
 * Reads the live device state and re-reads it on every resume, so toggling
 * battery saver or "remove animations" in the notification shade takes effect
 * the moment the player comes back rather than at next cold start.
 */
@Composable
fun rememberMotionBudget(): MotionBudget {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var budget by remember { mutableStateOf(readMotionBudget(context)) }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) budget = readMotionBudget(context)
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    return budget
}

private fun readMotionBudget(context: Context): MotionBudget {
    val power = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
    val activity = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
    val scale = Settings.Global.getFloat(
        context.contentResolver,
        Settings.Global.ANIMATOR_DURATION_SCALE,
        1f
    )
    return resolveMotionBudget(
        powerSaveMode = power?.isPowerSaveMode == true,
        animatorScale = scale,
        lowRamDevice = activity?.isLowRamDevice == true
    )
}
