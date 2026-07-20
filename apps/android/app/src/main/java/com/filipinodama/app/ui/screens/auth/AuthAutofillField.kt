package com.filipinodama.app.ui.screens.auth

import android.graphics.Color as AColor
import android.graphics.Typeface
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.TextDefault

/** Which autofill identity a [AuthAutofillField] advertises. */
enum class AuthFieldKind { LOGIN_ID, EMAIL, PASSWORD, NEW_PASSWORD }

/**
 * An auth credential field backed by a real Android [EditText] (via AndroidView)
 * so the PLATFORM autofill service (Google Password Manager / Samsung Pass /
 * Chrome / 1Password) handles both FILL and — crucially — the "Save password?"
 * prompt. The Compose-only `LocalAutofill` tree (see AuthComponents.AuthTextField)
 * reliably FILLS but never triggers SAVE on this Compose version, because it never
 * feeds the platform autofill session the entered values; a native view does.
 *
 * The royal styling (dark inset box + gold border + password eye) is drawn in
 * Compose AROUND the EditText; the EditText itself is transparent-background,
 * cream-text, single-line, with `setAutofillHints(...)` + the right InputType.
 * Used ONLY on the auth screens' email/password fields — everything else keeps
 * the Compose `AuthTextField`, so blast radius is limited to login/signup.
 */
@Composable
fun AuthAutofillField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    kind: AuthFieldKind,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    var visible by remember { mutableStateOf(false) }
    val isPassword = kind == AuthFieldKind.PASSWORD || kind == AuthFieldKind.NEW_PASSWORD

    val hints: Array<String> = when (kind) {
        // Login identifier: advertise BOTH so the manager offers the saved id
        // whether it was stored as a username or an email.
        AuthFieldKind.LOGIN_ID -> arrayOf(View.AUTOFILL_HINT_USERNAME, View.AUTOFILL_HINT_EMAIL_ADDRESS)
        AuthFieldKind.EMAIL -> arrayOf(View.AUTOFILL_HINT_EMAIL_ADDRESS)
        AuthFieldKind.PASSWORD -> arrayOf(View.AUTOFILL_HINT_PASSWORD)
        // "newPassword" (Android P+ constant) prompts SAVE of a fresh credential.
        AuthFieldKind.NEW_PASSWORD -> arrayOf("newPassword", View.AUTOFILL_HINT_PASSWORD)
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .background(Color.Black.copy(alpha = 0.35f), RoundedCornerShape(11.dp))
            .border(1.dp, Gold.copy(alpha = 0.25f), RoundedCornerShape(11.dp))
            .padding(horizontal = 14.dp, vertical = 2.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            AndroidView(
                modifier = Modifier.weight(1f),
                factory = { ctx ->
                    EditText(ctx).apply {
                        background = null
                        setPadding(0, 28, 0, 28)
                        isSingleLine = true
                        gravity = Gravity.CENTER_VERTICAL
                        textSize = 15f
                        setTextColor(TextDefault.toArgb())
                        setHintTextColor(Ink2.copy(alpha = 0.7f).toArgb())
                        highlightColor = Gold.copy(alpha = 0.4f).toArgb()
                        typeface = Typeface.DEFAULT
                        importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_YES
                        setAutofillHints(*hints)
                        inputType = when {
                            isPassword -> InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
                            kind == AuthFieldKind.EMAIL || kind == AuthFieldKind.LOGIN_ID ->
                                InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
                            else -> InputType.TYPE_CLASS_TEXT
                        }
                        // Keep Compose state in sync (single source of truth = the
                        // caller's `value`); guard against loops by only firing when
                        // the text actually differs from the model.
                        addTextChangedListener(object : android.text.TextWatcher {
                            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                            override fun afterTextChanged(s: android.text.Editable?) {
                                val t = s?.toString() ?: ""
                                if (t != value) onValueChange(t)
                            }
                        })
                        layoutParams = ViewGroup.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.WRAP_CONTENT,
                        )
                    }
                },
                update = { et ->
                    et.isEnabled = enabled
                    et.hint = placeholder
                    // Only overwrite the view's text when the model changed OUTSIDE
                    // the view (e.g. autofill set it, or a reset) — never on every
                    // recompose, to preserve the cursor position while typing.
                    if (et.text.toString() != value) {
                        et.setText(value)
                        et.setSelection(value.length)
                    }
                    // Toggle password masking without losing autofill identity.
                    if (isPassword) {
                        val base = InputType.TYPE_CLASS_TEXT
                        et.inputType = if (visible) base or InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
                        else base or InputType.TYPE_TEXT_VARIATION_PASSWORD
                        et.setSelection(et.text.length)
                    }
                },
            )
            if (isPassword) {
                IconButton(onClick = { visible = !visible }, modifier = Modifier.size(44.dp)) {
                    Icon(
                        imageVector = if (visible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                        contentDescription = if (visible) "Hide password" else "Show password",
                        tint = Ink2,
                    )
                }
            }
        }
    }
}
