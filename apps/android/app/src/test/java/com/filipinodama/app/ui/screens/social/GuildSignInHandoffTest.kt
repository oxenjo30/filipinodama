package com.filipinodama.app.ui.screens.social

import org.junit.Assert.assertEquals
import org.junit.Test

class GuildSignInHandoffTest {
    @Test fun `guest join hands off to sign in`() {
        assertEquals(GuildPreviewJoinHandoff.RequireSignIn, guildPreviewJoinHandoff(false, false, false, false, "guest"))
    }
    @Test fun `authentication failure hands creation to sign in`() {
        assertEquals(GuildCreateFailureHandoff.RequireSignIn, guildCreateFailureHandoff("HTTP_401", "Sign in required"))
    }
}
