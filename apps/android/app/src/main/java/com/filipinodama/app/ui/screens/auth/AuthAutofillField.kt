package com.filipinodama.app.ui.screens.auth

import android.graphics.Color as AColor
import android.graphics.Typeface
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
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
import androidx.compose.runtime.rememberUpdatedState
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
 * The keyboard's bottom-right action key for a field.
 *  - [NEXT]: advance focus to the next field (e.g. email → password).
 *  - [DONE]: finish input — hide the soft keyboard, drop focus, and fire
 *    [AuthAutofillField]'s onImeAction (used to submit the form). This is the
 *    fix for "keyboard stays up after autofill + Enter": a bare EditText with
 *    no imeOptions/editor-action listener never dismisses the IME on Enter.
 */
enum class AuthImeAction { NEXT, DONE }

internal fun dispatchAuthFieldTextChange(currentModelValue: String, incomingValue: String, onValueChange: (String) -> Unit): Boolean {
    if (incomingValue == currentModelValue) return false
    onValueChange(incomingValue)
    return true
}

internal data class PasswordInputTypeUpdate(val shouldAssignInputType: Boolean, val selectionStart: Int, val selectionEnd: Int)
internal fun passwordInputTypeUpdate(currentType: Int, desiredType: Int, selectionStart: Int, selectionEnd: Int, textLength: Int) =
    PasswordInputTypeUpdate(currentType != desiredType, selectionStart.coerceIn(0, textLength), selectionEnd.coerceIn(0, textLength))

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
    // The keyboard action key. NEXT advances focus; DONE hides the keyboard,
    // drops focus, and calls [onImeAction]. Defaults to DONE so a lone field
    // still dismisses the IME on Enter instead of leaving it stuck up.
    imeAction: AuthImeAction = AuthImeAction.DONE,
    // Invoked when the DONE action fires (e.g. submit the login form). Only
    // meaningful when imeAction == DONE.
    onImeAction: () -> Unit = {},
) {
    var visible by remember { mutableStateOf(false) }
    val isPassword = kind == AuthFieldKind.PASSWORD || kind == AuthFieldKind.NEW_PASSWORD
    // AndroidView listeners live longer than a composition pass. Read current
    // callbacks/model values rather than capturing the first composition.
    val currentValue = rememberUpdatedState(value)
    val currentOnValueChange = rememberUpdatedState(onValueChange)
    // Keep the latest onImeAction without re-running the AndroidView factory (the
    // editor-action listener is installed once in factory but reads this holder).
    val imeActionState = androidx.compose.runtime.rememberUpdatedState(onImeAction)

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
                        // IME action key + handler. Without this a singleLine
                        // EditText leaves Enter as a no-op, so after autofill the
                        // soft keyboard never hides and covers the bottom nav.
                        // NEXT advances to the next field; DONE hides the keyboard,
                        // drops focus, and submits.
                        imeOptions = when (imeAction) {
                            AuthImeAction.NEXT -> EditorInfo.IME_ACTION_NEXT
                            AuthImeAction.DONE -> EditorInfo.IME_ACTION_DONE
                        }
                        setOnEditorActionListener { v, actionId, _ ->
                            when (actionId) {
                                EditorInfo.IME_ACTION_NEXT -> {
                                    // Move focus to the next focusable (password).
                                    val next = v.focusSearch(View.FOCUS_DOWN)
                                    if (next != null) next.requestFocus() else v.clearFocus()
                                    true
                                }
                                EditorInfo.IME_ACTION_DONE,
                                EditorInfo.IME_ACTION_GO -> {
                                    // Hide the soft keyboard + release focus, then submit.
                                    val imm = v.context
                                        .getSystemService(android.content.Context.INPUT_METHOD_SERVICE)
                                        as? InputMethodManager
                                    imm?.hideSoftInputFromWindow(v.windowToken, 0)
                                    v.clearFocus()
                                    imeActionState.value.invoke()
                                    true
                                }
                                else -> false
                            }
                        }
                        // Keep Compose state in sync (single source of truth = the
                        // caller's `value`); guard against loops by only firing when
                        // the text actually differs from the model.
                        addTextChangedListener(object : android.text.TextWatcher {
                            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                            override fun afterTextChanged(s: android.text.Editable?) {
                                val t = s?.toString() ?: ""
                                dispatchAuthFieldTextChange(currentValue.value, t, currentOnValueChange.value)
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
                        et.setSelection(value.length.coerceIn(0, et.text.length))
                    }
                    // Toggle password masking without losing autofill identity.
                    if (isPassword) {
                        val base = InputType.TYPE_CLASS_TEXT
                        val desiredType = if (visible) base or InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
                        else base or InputType.TYPE_TEXT_VARIATION_PASSWORD
                        // setInputType RESETS imeOptions to the default, which would
                        // silently undo the DONE action and bring the keyboard-stuck
                        // bug right back on the password field — re-apply it here.
                        val typeUpdate = passwordInputTypeUpdate(et.inputType, desiredType, et.selectionStart, et.selectionEnd, et.text.length)
                        if (typeUpdate.shouldAssignInputType) {
                            et.inputType = desiredType
                            et.imeOptions = when (imeAction) {
                                AuthImeAction.NEXT -> EditorInfo.IME_ACTION_NEXT
                                AuthImeAction.DONE -> EditorInfo.IME_ACTION_DONE
                            }
                            et.setSelection(typeUpdate.selectionStart, typeUpdate.selectionEnd)
                        }
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
