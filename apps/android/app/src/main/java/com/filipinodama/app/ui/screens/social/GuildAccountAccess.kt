package com.filipinodama.app.ui.screens.social

import com.filipinodama.app.data.AuthUser
import com.filipinodama.app.ui.components.isAuthError

/** Guild mutations require a persistent account; guests can still browse. */
internal fun isRealGuildAccount(user: AuthUser?): Boolean = user != null && !user.isGuest
internal class GuildMembershipLoadGate {
    private var generation = 0L
    fun begin() = GuildMembershipLoadRequest(++generation)
    fun current() = GuildMembershipLoadRequest(generation)
    fun isCurrent(request: GuildMembershipLoadRequest) = request.generation == generation
}
internal data class GuildMembershipLoadRequest(val generation: Long)
internal enum class GuildPreviewJoinHandoff { RequireSignIn, SubmitJoin, Unavailable }
internal fun guildPreviewJoinHandoff(signedIn: Boolean, busy: Boolean, joined: Boolean, requested: Boolean, joinState: String) = when {
    busy || joined || requested || joinState in setOf("member", "in-other-guild", "invite-only", "requested") -> GuildPreviewJoinHandoff.Unavailable
    !signedIn || joinState == "guest" -> GuildPreviewJoinHandoff.RequireSignIn
    else -> GuildPreviewJoinHandoff.SubmitJoin
}
internal sealed interface GuildCreateFailureHandoff { data object RequireSignIn : GuildCreateFailureHandoff; data class ShowInline(val message: String) : GuildCreateFailureHandoff }
internal fun guildCreateFailureHandoff(code: String?, message: String): GuildCreateFailureHandoff =
    if (isAuthError(code) || code == "HTTP_403" || code == "FORBIDDEN") GuildCreateFailureHandoff.RequireSignIn else GuildCreateFailureHandoff.ShowInline(message)
