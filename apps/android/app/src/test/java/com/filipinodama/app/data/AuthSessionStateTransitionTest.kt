package com.filipinodama.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

class AuthSessionStateTransitionTest {

    @Test
    fun `establishing a session clears the previous account before refresh`() {
        val prior = AuthSessionState(
            user = user("old-user"),
            account = AccountState(email = "old@example.com"),
            checked = true
        )

        val established = establishAuthSession(prior, user("new-user"))

        assertEquals("new-user", established.user?.id)
        assertNull(established.account)
        assertEquals(true, established.checked)
        assertEquals(prior.generation + 1, established.generation)
    }

    @Test
    fun `late me success after a new login is ignored`() {
        val established = establishAuthSession(
            AuthSessionState(account = AccountState(email = "old@example.com")),
            user("new-user")
        )

        val refreshed = applyMeRefreshForSession(
            state = established,
            sessionKey = AuthSessionKey(userId = null, generation = 0),
            user = user("old-user"),
            account = AccountState(email = "old@example.com")
        )

        assertNull(refreshed.account)
        assertEquals("new-user", refreshed.user?.id)
    }

    @Test
    fun `late me failure after logout is ignored`() {
        val signedIn = establishAuthSession(AuthSessionState(), user("player"))
        val afterLogout = clearAuthSession(signedIn)

        val afterLateFailure = applyMeRefreshFailureForSession(
            state = afterLogout,
            sessionKey = authSessionKey(signedIn)
        )

        assertNull(afterLateFailure.user)
        assertEquals(afterLogout.generation, afterLateFailure.generation)
        assertEquals(true, afterLateFailure.checked)
    }

    @Test
    fun `same user re-login rejects old generation`() {
        val first = establishAuthSession(AuthSessionState(), user("player"))
        val second = establishAuthSession(first, user("player"))

        val stale = applyMeRefreshForSession(
            state = second,
            sessionKey = authSessionKey(first),
            user = user("player").copy(gold = 1),
            account = AccountState(email = "old@example.com")
        )

        assertEquals(second.generation, stale.generation)
        assertEquals(second.user, stale.user)
        assertNull(stale.account)
    }

    @Test
    fun `current refresh preserves generation`() {
        val current = establishAuthSession(AuthSessionState(), user("player"))

        val refreshed = applyMeRefreshForSession(
            state = current,
            sessionKey = authSessionKey(current),
            user = user("player").copy(gold = 500),
            account = AccountState(email = "player@example.com")
        )

        assertEquals(current.generation, refreshed.generation)
        assertEquals(500, refreshed.user?.gold)
        assertEquals("player@example.com", refreshed.account?.email)
    }

    @Test
    fun `valid cold start me response is accepted restores user and starts a generation boundary`() {
        val coldStart = AuthSessionState()
        val requestKey = authSessionKey(coldStart)

        val accepted = acceptsMeRefreshForSession(coldStart, requestKey)
        val restored = applyMeRefreshForSession(
            state = coldStart,
            sessionKey = requestKey,
            user = user("restored-player"),
            account = AccountState(email = "restored@example.com")
        )

        assertEquals(true, accepted)
        assertEquals("restored-player", restored.user?.id)
        assertEquals("restored@example.com", restored.account?.email)
        assertEquals(coldStart.generation + 1, restored.generation)
        assertFalse(isCurrentAuthSession(restored, requestKey))
    }

    @Test
    fun `old patch for different user is rejected`() {
        val current = establishAuthSession(AuthSessionState(), user("new-user"))

        val patched = applyUserPatchForSession(
            state = current,
            sessionKey = AuthSessionKey(userId = "old-user", generation = current.generation),
            patch = { it.copy(gold = 999) }
        )

        assertEquals(current, patched)
    }

    @Test
    fun `old patch for same user new generation is rejected`() {
        val first = establishAuthSession(AuthSessionState(), user("player"))
        val current = establishAuthSession(first, user("player"))

        val patched = applyUserPatchForSession(
            state = current,
            sessionKey = authSessionKey(first),
            patch = { it.copy(gold = 999) }
        )

        assertEquals(current, patched)
    }

    @Test
    fun `valid patch merges into latest current user`() {
        val current = establishAuthSession(
            AuthSessionState(),
            user("player").copy(gold = 100, diamonds = 30, displayName = "Latest")
        )

        val patched = applyUserPatchForSession(
            state = current,
            sessionKey = authSessionKey(current),
            patch = { it.copy(gold = 250) }
        )

        assertEquals(250, patched.user?.gold)
        assertEquals(30, patched.user?.diamonds)
        assertEquals("Latest", patched.user?.displayName)
    }

    @Test
    fun `logout increments generation and clears identity`() {
        val signedIn = establishAuthSession(AuthSessionState(), user("player"))

        val loggedOut = clearAuthSession(signedIn)

        assertNull(loggedOut.user)
        assertNull(loggedOut.account)
        assertEquals(signedIn.generation + 1, loggedOut.generation)
        assertEquals(true, loggedOut.checked)
    }

    @Test
    fun `account response rejects same user old generation`() {
        val first = establishAuthSession(AuthSessionState(), user("player"))
        val current = establishAuthSession(first, user("player"))

        val refreshed = applyAccountRefreshForSession(
            state = current,
            sessionKey = authSessionKey(first),
            account = AccountState(email = "old@example.com")
        )

        assertNull(refreshed.account)
        assertFalse(authSessionKey(refreshed) == authSessionKey(first))
    }

    private fun user(id: String) = AuthUser(
        id = id,
        username = id,
        displayName = id,
        tag = "#0001"
    )
}
