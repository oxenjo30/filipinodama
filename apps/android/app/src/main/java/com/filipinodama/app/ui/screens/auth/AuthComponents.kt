package com.filipinodama.app.ui.screens.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.filipinodama.app.ui.theme.ButtonGoldBottom
import com.filipinodama.app.ui.theme.ButtonGoldTextColor
import com.filipinodama.app.ui.theme.ButtonGoldTop
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Red
import com.filipinodama.app.ui.theme.TextDefault

/**
 * Shared visual building blocks for the auth shell screens (Login, Create
 * Account, Forgot Password), styled from the royal theme tokens in
 * ui/theme/Color.kt — no default Material colors. Touch targets are all
 * >=44dp per the design system's accessibility bar.
 */

@Composable
fun AuthLabel(text: String) {
    Text(
        text = text,
        color = Ink2,
        style = MaterialTheme.typography.labelLarge,
        modifier = Modifier.padding(bottom = 6.dp)
    )
}

@Composable
fun AuthTextField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    keyboardType: KeyboardType = KeyboardType.Text,
    isPassword: Boolean = false,
    enabled: Boolean = true
) {
    var visible by remember { mutableStateOf(false) }
    // Password fields MUST use the Password IME type and disable autocorrect +
    // auto-capitalization. With the plain Text keyboard the soft keyboard would
    // silently autocorrect / capitalize the first character of a typed password
    // (or an autofilled one), sending a DIFFERENT string than the user typed —
    // the cause of "same password works on web but fails on mobile" (web's
    // <input type=password> never autocorrects). Email likewise gets no
    // capitalization. Resolved IME type: Password for secrets, else the caller's.
    val effectiveKeyboardType = if (isPassword) KeyboardType.Password else keyboardType
    val keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
        keyboardType = effectiveKeyboardType,
        autoCorrect = false,
        capitalization = androidx.compose.ui.text.input.KeyboardCapitalization.None
    )
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        placeholder = { Text(placeholder, color = Ink2.copy(alpha = 0.7f)) },
        singleLine = true,
        enabled = enabled,
        keyboardOptions = keyboardOptions,
        visualTransformation = if (isPassword && !visible) PasswordVisualTransformation() else VisualTransformation.None,
        trailingIcon = if (isPassword) {
            {
                IconButton(onClick = { visible = !visible }, modifier = Modifier.size(44.dp)) {
                    Icon(
                        imageVector = if (visible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                        contentDescription = if (visible) "Hide password" else "Show password",
                        tint = Ink2
                    )
                }
            }
        } else null,
        colors = OutlinedTextFieldDefaults.colors(
            focusedTextColor = TextDefault,
            unfocusedTextColor = TextDefault,
            focusedBorderColor = Gold,
            unfocusedBorderColor = Gold.copy(alpha = 0.25f),
            focusedContainerColor = Color.Black.copy(alpha = 0.35f),
            unfocusedContainerColor = Color.Black.copy(alpha = 0.35f),
            cursorColor = Gold
        ),
        shape = RoundedCornerShape(11.dp),
        // OutlinedTextField's default min height already exceeds the 44dp
        // touch-target bar; no extra height constraint needed.
        modifier = modifier.fillMaxWidth()
    )
}

@Composable
fun AuthErrorRow(message: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier
            .fillMaxWidth()
            .background(Red.copy(alpha = 0.12f), RoundedCornerShape(9.dp))
            .padding(10.dp)
    ) {
        Icon(imageVector = Icons.Filled.Warning, contentDescription = null, tint = Color(0xFFFF9AA8))
        Text(text = message, color = Color(0xFFFF9AA8), style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
fun AuthPrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false
) {
    val interactionSource = remember { MutableInteractionSource() }
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(50.dp)
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                enabled = enabled && !loading,
                onClick = onClick
            )
            .background(
                brush = Brush.verticalGradient(listOf(ButtonGoldTop, ButtonGoldBottom)),
                shape = RoundedCornerShape(11.dp)
            )
            .then(if (!enabled || loading) Modifier.background(Color.Black.copy(alpha = 0.35f), RoundedCornerShape(11.dp)) else Modifier),
        contentAlignment = Alignment.Center
    ) {
        if (loading) {
            CircularProgressIndicator(modifier = Modifier.size(22.dp), color = ButtonGoldTextColor, strokeWidth = 2.dp)
        } else {
            Text(text = text, color = ButtonGoldTextColor, style = MaterialTheme.typography.titleMedium)
        }
    }
}

@Composable
fun AuthSecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(48.dp)
            .clickable(enabled = enabled, onClick = onClick)
            .border(1.dp, Gold.copy(alpha = 0.3f), RoundedCornerShape(11.dp)),
        contentAlignment = Alignment.Center
    ) {
        Text(text = text, color = Ink, style = MaterialTheme.typography.titleSmall)
    }
}

@Composable
fun AuthTextLink(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    Text(
        text = text,
        color = Gold,
        style = MaterialTheme.typography.bodySmall,
        modifier = modifier
            .clickable(enabled = enabled, onClick = onClick)
            .padding(8.dp)
    )
}

/** Back-chevron header used by Create Account / Forgot Password (§ back convention). */
@Composable
fun AuthBackButton(onClick: () -> Unit) {
    IconButton(onClick = onClick, modifier = Modifier.size(44.dp)) {
        Icon(
            imageVector = Icons.Filled.ChevronLeft,
            contentDescription = "Back to sign in",
            tint = GoldLt
        )
    }
}

/**
 * "or" divider — mockup lines 198-204: a bare "OR" label (not "or continue
 * with" — that's the WEB's own AuthPage.tsx copy, which the mockup's Sign-in
 * screen, the 1:1 source of truth here, does not use).
 */
@Composable
fun AuthOrDivider() {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 20.dp)
    ) {
        Box(
            modifier = Modifier
                .weight(1f)
                .height(1.dp)
                .background(Gold.copy(alpha = 0.16f))
        )
        Text(text = "or", color = Color(0xFF6F628F), style = MaterialTheme.typography.labelMedium)
        Box(
            modifier = Modifier
                .weight(1f)
                .height(1.dp)
                .background(Gold.copy(alpha = 0.16f))
        )
    }
}

/**
 * "Continue with Google" button — mirrors AuthPage.tsx's Google button
 * exactly: bordered pill, gold "G" glyph + label, disabled (45% opacity,
 * not-allowed) when Google sign-in isn't configured server-side
 * (providers.google == false). A tap while disabled surfaces the same
 * "Google sign-in is not configured yet." message the web shows, rather
 * than doing nothing silently.
 */
@Composable
fun AuthGoogleButton(
    enabled: Boolean,
    onClick: () -> Unit,
    onDisabledClick: () -> Unit,
    modifier: Modifier = Modifier,
    loading: Boolean = false
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(50.dp)
            .clickable(enabled = !loading, onClick = { if (enabled) onClick() else onDisabledClick() })
            .background(Color.Black.copy(alpha = 0.3f), RoundedCornerShape(11.dp))
            .border(1.dp, Gold.copy(alpha = 0.22f), RoundedCornerShape(11.dp))
            .then(if (!enabled) Modifier.background(Color.Black.copy(alpha = 0.15f), RoundedCornerShape(11.dp)) else Modifier),
        contentAlignment = Alignment.Center
    ) {
        if (loading) {
            CircularProgressIndicator(modifier = Modifier.size(20.dp), color = GoldLt, strokeWidth = 2.dp)
        } else {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                Text(
                    text = "G",
                    color = Gold.copy(alpha = if (enabled) 1f else 0.45f),
                    style = MaterialTheme.typography.titleMedium
                )
                Text(
                    text = "Continue with Google",
                    color = Color(0xFFEFE7FB).copy(alpha = if (enabled) 1f else 0.45f),
                    style = MaterialTheme.typography.titleSmall
                )
            }
        }
    }
}
