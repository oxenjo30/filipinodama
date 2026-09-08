package com.filipinodama.app.data.social

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Mark-read / mark-all / dismiss state-transition tests for the pure
 * reducer functions [flipRead]/[flipAllRead]/[dropNotif], mirroring
 * apps/web NotificationsMenu.tsx's optimistic-update logic exactly (flip
 * locally, recompute unreadCount, never go negative).
 */
class NotificationsRepositoryTest {

    private fun notif(id: String, readAt: String? = null) =
        NotificationDto(id = id, type = "friend_request", title = "t", body = null, data = null, readAt = readAt, createdAt = "2026-07-10T00:00:00.000Z")

    @Test
    fun `flipRead marks only the target notification and decrements unread once`() {
        val n1 = notif("n1")
        val n2 = notif("n2")
        val start = NotificationsResponse(
            notifications = listOf(n1, n2),
            groups = NotificationGroupsDto(today = listOf(n1, n2)),
            unreadCount = 2
        )

        val next = flipRead(start, "n1", now = "2026-07-10T01:00:00.000Z")

        assertNotNull(next.notifications.first { it.id == "n1" }.readAt)
        assertNull(next.notifications.first { it.id == "n2" }.readAt)
        assertEquals(1, next.unreadCount)
        // group copy stays in sync
        assertNotNull(next.groups.today.first { it.id == "n1" }.readAt)
    }

    @Test
    fun `flipRead on an already-read notification is a no-op`() {
        val n1 = notif("n1", readAt = "2026-07-09T00:00:00.000Z")
        val start = NotificationsResponse(notifications = listOf(n1), unreadCount = 0)

        val next = flipRead(start, "n1")

        assertEquals(start, next)
    }

    @Test
    fun `flipRead never lets unreadCount go negative`() {
        val n1 = notif("n1")
        // Deliberately inconsistent state (unreadCount already 0 despite an
        // unread row) to prove the coerceAtLeast(0) guard holds.
        val start = NotificationsResponse(notifications = listOf(n1), unreadCount = 0)

        val next = flipRead(start, "n1")

        assertEquals(0, next.unreadCount)
    }

    @Test
    fun `flipAllRead marks every notification and zeroes unreadCount`() {
        val n1 = notif("n1")
        val n2 = notif("n2", readAt = "2026-07-09T00:00:00.000Z")
        val start = NotificationsResponse(
            notifications = listOf(n1, n2),
            groups = NotificationGroupsDto(today = listOf(n1), yesterday = listOf(n2)),
            unreadCount = 1
        )

        val next = flipAllRead(start, now = "2026-07-10T02:00:00.000Z")

        assertTrue(next.notifications.all { it.readAt != null })
        assertEquals(0, next.unreadCount)
        // an already-read row keeps its original readAt (not overwritten)
        assertEquals("2026-07-09T00:00:00.000Z", next.notifications.first { it.id == "n2" }.readAt)
    }

    @Test
    fun `dropNotif removes the row and decrements unread only if it was unread`() {
        val n1 = notif("n1")
        val n2 = notif("n2", readAt = "2026-07-09T00:00:00.000Z")
        val start = NotificationsResponse(
            notifications = listOf(n1, n2),
            groups = NotificationGroupsDto(today = listOf(n1, n2)),
            unreadCount = 1
        )

        val afterUnreadDrop = dropNotif(start, "n1", wasRead = false)
        assertEquals(listOf("n2"), afterUnreadDrop.notifications.map { it.id })
        assertEquals(0, afterUnreadDrop.unreadCount)

        val afterReadDrop = dropNotif(start, "n2", wasRead = true)
        assertEquals(listOf("n1"), afterReadDrop.notifications.map { it.id })
        assertEquals(1, afterReadDrop.unreadCount) // unread count untouched — n2 was already read
    }

    @Test
    fun `notifIsPending true only for an unresolved friend request with a requestId`() {
        val dataWithRequest = kotlinx.serialization.json.Json.parseToJsonElement("""{"requestId":"r1","fromUserId":"u2"}""")
        val dataResolved = kotlinx.serialization.json.Json.parseToJsonElement("""{"requestId":"r1","status":"accepted"}""")

        val pending = NotificationDto(id = "n1", type = "friend_request", title = "t", body = null, data = dataWithRequest, readAt = null, createdAt = "x")
        val resolved = NotificationDto(id = "n2", type = "friend_request", title = "t", body = null, data = dataResolved, readAt = null, createdAt = "x")
        val nonFriend = NotificationDto(id = "n3", type = "achievement", title = "t", body = null, data = dataWithRequest, readAt = null, createdAt = "x")

        assertTrue(notifIsPending(pending))
        assertTrue(!notifIsPending(resolved))
        assertTrue(!notifIsPending(nonFriend))
    }

    @Test
    fun `resolved friend notifications are excluded from the active inbox`() {
        val resolved = NotificationDto(
            id = "resolved",
            type = "friend_request",
            title = "New friend request",
            body = null,
            data = kotlinx.serialization.json.Json.parseToJsonElement("""{"requestId":"r1","status":"accepted"}"""),
            readAt = "2026-07-11T00:00:00.000Z",
            createdAt = "2026-07-10T00:00:00.000Z"
        )
        val pending = resolved.copy(id = "pending", data = kotlinx.serialization.json.Json.parseToJsonElement("""{"requestId":"r2"}"""))
        assertTrue(!notifShouldShowInInbox(resolved))
        assertTrue(notifShouldShowInInbox(pending))
    }

    @Test
    fun `pending request reconciliation removes stale rows and unread count`() {
        val stale = NotificationDto(
            id = "stale",
            type = "friend_request",
            title = "New friend request",
            data = kotlinx.serialization.json.Json.parseToJsonElement("""{"requestId":"old-request"}"""),
            createdAt = "2026-08-11T00:00:00.000Z"
        )
        val pending = stale.copy(
            id = "pending",
            data = kotlinx.serialization.json.Json.parseToJsonElement("""{"requestId":"live-request"}""")
        )
        val other = NotificationDto(
            id = "other",
            type = "achievement",
            title = "Welcome",
            createdAt = "2026-08-11T00:00:00.000Z"
        )
        val response = NotificationsResponse(
            notifications = listOf(stale, pending, other),
            groups = NotificationGroupsDto(today = listOf(stale, pending, other)),
            unreadCount = 3
        )

        val filtered = filterResolvedFriendRequests(response, setOf("live-request"))

        assertEquals(listOf("pending", "other"), filtered.notifications.map { it.id })
        assertEquals(listOf("pending", "other"), filtered.groups.today.map { it.id })
        assertEquals(2, filtered.unreadCount)
    }
}
