package com.filipinodama.app.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.filipinodama.app.R
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink2

/**
 * The UNIVERSAL sign-in prompt. Any gated action an anonymous user attempts
 * (claim a store item, host a room, claim a reward, play Ranked, join a guild)
 * must surface THIS guided modal — NOT a generic "not authenticated" error
 * (owner directive 2026-07-15: "instead of showing a generic error, prompt a
 * message that to claim this you need to sign in. Make this the universal
 * rule"). Detect the case with [isAuthError] on the failed request's error
 * code, then show this dialog with an [action] describing what they were doing.
 *
 * Royal theme: deep-purple gradient panel, gold hairline border + faint crest
 * glow, crown icon, Cinzel-style gold title, muted body, a gold-gradient
 * primary that routes to Login/Signup and a ghost "Not now" dismiss.
 *
 * @param action a short verb phrase completing "You need an account to ___"
 *               (e.g. "claim this item", "host a room", "claim your reward").
 */
@Composable
fun SignInRequiredDialog(
    action: String,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit
) {
    Dialog(onDismissRequest = onDismiss) {
        androidx.compose.foundation.layout.Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(22.dp))
                .background(Brush.verticalGradient(listOf(Color(0xFF241748), Color(0xFF160B28))))
                .border(1.dp, Color(0x4DE8B84B), RoundedCornerShape(22.dp))
        ) {
            // Faint crest glow bleeding from the top-right corner (matches the
            // profile identity card / invite-email header treatment).
            Image(
                painter = painterResource(id = R.drawable.logo_sun),
                contentDescription = null,
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .size(120.dp)
                    .alpha(0.10f)
            )
            Column(modifier = Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                androidx.compose.foundation.layout.Box(
                    modifier = Modifier
                        .size(54.dp)
                        .background(Color(0x1FE8B84B), CircleShape)
                        .border(1.dp, Color(0x4DE8B84B), CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Image(painter = painterResource(id = R.drawable.me_crown), contentDescription = null, modifier = Modifier.size(28.dp))
                }
                Text(
                    "Sign in required",
                    color = GoldLt,
                    style = MaterialTheme.typography.headlineSmall,
                    modifier = Modifier.padding(top = 14.dp)
                )
                Text(
                    "You need an account to $action. Sign in or create one — it's free — and your progress, rank and rewards stay with you.",
                    color = Ink2,
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 8.dp)
                )
                // Primary — gold gradient, routes to Login/Signup.
                androidx.compose.foundation.layout.Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 22.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .clickable(onClick = onConfirm)
                        .background(Brush.verticalGradient(listOf(Color(0xFFEFC25A), Color(0xFFC9971F))))
                        .padding(vertical = 14.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text("Sign In / Create Account", color = Color(0xFF3A2405), style = MaterialTheme.typography.titleMedium)
                }
                // Secondary — ghost dismiss.
                androidx.compose.foundation.layout.Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 10.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .clickable(onClick = onDismiss)
                        .padding(vertical = 12.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text("Not now", color = Ink2, style = MaterialTheme.typography.labelLarge)
                }
            }
        }
    }
}

/**
 * True when a failed request's error [code] means "you are not signed in" —
 * the server's requireAuth guard throws err.unauthorized() → HTTP 401 with code
 * "UNAUTHORIZED" (or "ACCOUNT_GONE" when the session's user no longer exists);
 * a missing/blank body is surfaced by apiErrorFrom as "HTTP_401". These are the
 * codes that must trigger [SignInRequiredDialog] instead of a generic error.
 *
 * NOT included: BAD_CREDENTIALS / BAD_REFRESH / OAUTH_* — those occur DURING a
 * sign-in attempt and are shown as real form errors, not a "please sign in"
 * prompt (the user is already trying to).
 */
fun isAuthError(code: String?): Boolean =
    code == "UNAUTHORIZED" || code == "ACCOUNT_GONE" || code == "HTTP_401"
