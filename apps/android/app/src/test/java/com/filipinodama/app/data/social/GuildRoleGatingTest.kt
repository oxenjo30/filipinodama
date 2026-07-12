package com.filipinodama.app.data.social

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Guild role-gating tests, mirroring apps/web GuildsPage.tsx's ROLE_RANK +
 * canManage/isLeader derivations and apps/server/src/modules/guilds.ts's
 * requireGuildRole() rank comparison exactly.
 */
class GuildRoleGatingTest {

    @Test
    fun `role rank ordering matches the server exactly`() {
        assertEquals(1, GUILD_ROLE_RANK["MEMBER"])
        assertEquals(2, GUILD_ROLE_RANK["OFFICER"])
        assertEquals(3, GUILD_ROLE_RANK["LEADER"])
    }

    @Test
    fun `leader is at least officer and at least member`() {
        assertTrue(guildRoleAtLeast("LEADER", "OFFICER"))
        assertTrue(guildRoleAtLeast("LEADER", "MEMBER"))
        assertTrue(guildRoleAtLeast("LEADER", "LEADER"))
    }

    @Test
    fun `officer is at least officer but not leader`() {
        assertTrue(guildRoleAtLeast("OFFICER", "OFFICER"))
        assertFalse(guildRoleAtLeast("OFFICER", "LEADER"))
    }

    @Test
    fun `member is not at least officer`() {
        assertFalse(guildRoleAtLeast("MEMBER", "OFFICER"))
        assertTrue(guildRoleAtLeast("MEMBER", "MEMBER"))
    }

    @Test
    fun `null role (not a member) is never at least anything`() {
        assertFalse(guildRoleAtLeast(null, "MEMBER"))
    }

    @Test
    fun `unknown role string is never at least anything`() {
        assertFalse(guildRoleAtLeast("BOGUS", "MEMBER"))
    }

    @Test
    fun `manageable member check mirrors the server strictly-higher-rank rule`() {
        // A member can manage a target only if: canManage (OFFICER+) AND
        // strictly higher rank than the target — matches guilds.ts's
        // DELETE /:id/members/:uid guard (`ROLE_RANK[myMember.role] < ROLE_RANK.OFFICER`
        // -> forbidden; `ROLE_RANK[target.role] >= ROLE_RANK[myMember.role]` -> forbidden).
        fun manageable(myRole: String, targetRole: String) =
            guildRoleAtLeast(myRole, "OFFICER") && (GUILD_ROLE_RANK[myRole] ?: 0) > (GUILD_ROLE_RANK[targetRole] ?: 0)

        assertTrue(manageable("LEADER", "OFFICER"))
        assertTrue(manageable("LEADER", "MEMBER"))
        assertTrue(manageable("OFFICER", "MEMBER"))
        assertFalse(manageable("OFFICER", "OFFICER")) // equal rank, not strictly higher
        assertFalse(manageable("OFFICER", "LEADER"))
        assertFalse(manageable("MEMBER", "MEMBER")) // below OFFICER threshold
    }
}
