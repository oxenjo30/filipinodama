package com.filipinodama.app.ui.screens.system

/**
 * Sanction banner — DEFERRED, DOCUMENTED HONESTLY (not built as a fake
 * always-hidden component). This file exists so the deferral is explicit and
 * findable, per the "honest handling of anything without a server source"
 * boundary.
 *
 * mobile-screen-inventory.md lists a "Sanction banner" as global overlay
 * layer #6 (`{{ sanctionShow }}` in the prototype) — a top-dropping
 * admin-issued warning/ban banner. Investigated whether Android has a real
 * signal to drive it from:
 *
 *   1. GET /api/auth/me -> `publicUser()` (apps/server/src/auth/service.ts,
 *      lines 11-37) returns id, email, emailVerified, isGuest, username,
 *      displayName, tag, bio, avatarUrl, countryCode, trophies, gold,
 *      diamonds, rankTier, equipped*, wins/losses/draws/streak, adminRole.
 *      NO bannedUntil, NO mute field, NO sanction field of any kind.
 *      `MeResponse`/`AuthUser` in AuthApi.kt mirror this 1:1 (verified — the
 *      Android DTO has no ban/mute fields either, matching the server).
 *
 *   2. What the server actually does with `User.bannedUntil` instead:
 *      auth/service.ts `login()` (line 152) throws 403 "BANNED" BEFORE a
 *      session is issued; `rotateSession()` (line 195) throws the same 403
 *      on refresh if a ban was applied mid-session, and mass-deletes that
 *      user's sessions so no cookie can silently keep working. guards.ts's
 *      `requireAuth` preHandler (line 54) also 403s any authenticated
 *      request from a banned user. NET EFFECT: a banned user can never
 *      reach an authenticated state — they are rejected at the door, not
 *      let in and shown a banner about it.
 *
 *   3. apps/web has NO sanction-banner implementation either (grepped
 *      apps/web/src for "sanction"/"Sanction"/"BANNED"/"bannedUntil" —
 *      zero matches outside legal-policy copy). The web client's ONLY
 *      surfacing of a ban is the login form displaying the server's 403
 *      "This account is suspended" error message — a plain auth-failure
 *      toast, not a dedicated banner component.
 *
 * CONCLUSION: there is no server payload this Android build (or the real
 * production web client it must match) can read to render a persistent
 * "you are sanctioned" banner for a signed-in user, because sanctioned users
 * are never signed in. The correct, honest behavior — matching both the
 * server's actual design and the web client's actual behavior — is:
 *   - LoginScreen already surfaces the server's 403 "BANNED" error message
 *     via the same generic AuthResult.Failure(message) path every other
 *     login error uses (see AuthRepository.login -> throwableToAuthFailure);
 *     no separate work was needed there, and none was added, to avoid
 *     inventing a second error-handling path for one specific error code.
 *   - No in-app persistent sanction banner is built, because building one
 *     would require either (a) fabricating fields the server does not send,
 *     or (b) polling a nonexistent endpoint. Both are excluded by this
 *     project's "no fabricated data / honest gaps" rule.
 *
 * If a future server change adds mute/timeout support for signed-in users
 * (as opposed to today's all-or-nothing ban-at-login model), this file is
 * where the composable would go — read `AuthUser`'s new field(s), and this
 * kdoc's investigation trail explains exactly what changed and why.
 */
object SanctionBannerDeferral {
    /** True — kept as a named, greppable marker rather than deleting this
     * investigation trail once the feature is revisited. */
    const val DEFERRED_NO_SERVER_SIGNAL: Boolean = true
}
