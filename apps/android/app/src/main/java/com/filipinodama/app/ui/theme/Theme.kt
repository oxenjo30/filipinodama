package com.filipinodama.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

/**
 * Always the royal-dark theme, regardless of system light/dark setting or
 * device dynamic color support. FilipinoDama has no light theme — do not
 * add `isSystemInDarkTheme()` branching or `dynamicColor` here.
 */
private val FdDarkColorScheme = darkColorScheme(
    primary = Gold,
    onPrimary = ButtonGoldTextColor,
    primaryContainer = GoldDp,
    onPrimaryContainer = TextDefault,
    secondary = Purple,
    onSecondary = TextDefault,
    secondaryContainer = Panel2,
    onSecondaryContainer = Ink,
    tertiary = Blue,
    onTertiary = TextDefault,
    background = Bg,
    onBackground = TextDefault,
    surface = Panel,
    onSurface = TextDefault,
    surfaceVariant = Panel2,
    onSurfaceVariant = Ink,
    error = Red,
    onError = TextDefault,
    outline = GoldDp,
    outlineVariant = Ink2
)

@Composable
fun FilipinoDamaTheme(content: @Composable () -> Unit) {
    // Intentionally ignores isSystemInDarkTheme(): the app is dark-only.
    MaterialTheme(
        colorScheme = FdDarkColorScheme,
        typography = FdTypography,
        content = content
    )
}
