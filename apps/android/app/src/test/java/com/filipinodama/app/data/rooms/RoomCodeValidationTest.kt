package com.filipinodama.app.data.rooms

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * [normalizeRoomCode] / [isValidRoomCode] — the same normalization the server
 * applies (rooms.ts: `code.trim().toUpperCase()`) plus the client-side
 * length gate used to enable the Join button. ROOM_CODE_LENGTH (6) is
 * packages/shared/src/constants.ts's ROOM_CODE_LENGTH, mirrored verbatim.
 */
class RoomCodeValidationTest {

    @Test
    fun `normalizes lowercase and surrounding whitespace to uppercase trimmed`() {
        assertEquals("ABC123", normalizeRoomCode("  abc123  "))
        assertEquals("XYZ789", normalizeRoomCode("xyz789"))
    }

    @Test
    fun `a full 6-character code is valid`() {
        assertTrue(isValidRoomCode("ABC123"))
        assertTrue(isValidRoomCode("  abc123  ")) // normalized before length check
    }

    @Test
    fun `a partial code is invalid`() {
        assertFalse(isValidRoomCode("ABC"))
        assertFalse(isValidRoomCode(""))
    }

    @Test
    fun `a too-long code is invalid (never silently truncated by the validator itself)`() {
        assertFalse(isValidRoomCode("ABC1234"))
    }

    @Test
    fun `ROOM_CODE_LENGTH matches the shared constant value of 6`() {
        assertEquals(6, ROOM_CODE_LENGTH)
    }
}
