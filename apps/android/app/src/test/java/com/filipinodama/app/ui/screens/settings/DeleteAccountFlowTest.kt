package com.filipinodama.app.ui.screens.settings

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Delete-account state-flow tests — [DeleteAccountFlow], the pure
 * idle -> deleting -> deleted/error machine behind [DeleteAccountDialog].
 * Mirrors apps/web SettingsPage.tsx's `deleteReady` gate (typed "DELETE",
 * trimmed, case-insensitive) and confirmDelete()'s guard against a
 * double-submit while a delete is already in flight.
 */
class DeleteAccountFlowTest {

    // ---- isReady (the typed-DELETE confirmation gate) ----

    @Test
    fun `exact uppercase DELETE is ready`() {
        assertTrue(DeleteAccountFlow.isReady("DELETE"))
    }

    @Test
    fun `lowercase and mixed-case delete are ready — matches web's case-insensitive gate`() {
        assertTrue(DeleteAccountFlow.isReady("delete"))
        assertTrue(DeleteAccountFlow.isReady("DeLeTe"))
    }

    @Test
    fun `surrounding whitespace is trimmed before comparing`() {
        assertTrue(DeleteAccountFlow.isReady("  DELETE  "))
    }

    @Test
    fun `anything else is not ready — empty, partial, or wrong word`() {
        assertFalse(DeleteAccountFlow.isReady(""))
        assertFalse(DeleteAccountFlow.isReady("DELET"))
        assertFalse(DeleteAccountFlow.isReady("delete my account"))
        assertFalse(DeleteAccountFlow.isReady("CONFIRM"))
    }

    // ---- startDelete ----

    @Test
    fun `startDelete moves Idle to Deleting when the confirmation text is ready`() {
        val next = DeleteAccountFlow.startDelete("DELETE", DeleteAccountState.Idle)
        assertEquals(DeleteAccountState.Deleting, next)
    }

    @Test
    fun `startDelete is a no-op from Idle when the confirmation text is not ready`() {
        val next = DeleteAccountFlow.startDelete("nope", DeleteAccountState.Idle)
        assertEquals(DeleteAccountState.Idle, next)
    }

    @Test
    fun `startDelete cannot double-submit while already Deleting`() {
        val next = DeleteAccountFlow.startDelete("DELETE", DeleteAccountState.Deleting)
        assertEquals(DeleteAccountState.Deleting, next)
    }

    @Test
    fun `startDelete is a no-op once already Deleted`() {
        val next = DeleteAccountFlow.startDelete("DELETE", DeleteAccountState.Deleted)
        assertEquals(DeleteAccountState.Deleted, next)
    }

    @Test
    fun `startDelete allows a retry from a prior Error state`() {
        val next = DeleteAccountFlow.startDelete("DELETE", DeleteAccountState.Error("Couldn't reach the server."))
        assertEquals(DeleteAccountState.Deleting, next)
    }

    // ---- succeed / fail ----

    @Test
    fun `succeed moves Deleting to Deleted`() {
        val next = DeleteAccountFlow.succeed(DeleteAccountState.Deleting)
        assertEquals(DeleteAccountState.Deleted, next)
    }

    @Test
    fun `succeed is a no-op from any non-Deleting state`() {
        assertEquals(DeleteAccountState.Idle, DeleteAccountFlow.succeed(DeleteAccountState.Idle))
        assertEquals(DeleteAccountState.Deleted, DeleteAccountFlow.succeed(DeleteAccountState.Deleted))
    }

    @Test
    fun `fail moves Deleting to Error carrying the real server message`() {
        val next = DeleteAccountFlow.fail(DeleteAccountState.Deleting, "Something went wrong. Please try again.")
        assertEquals(DeleteAccountState.Error("Something went wrong. Please try again."), next)
    }

    @Test
    fun `fail is a no-op from any non-Deleting state`() {
        assertEquals(DeleteAccountState.Idle, DeleteAccountFlow.fail(DeleteAccountState.Idle, "x"))
        assertEquals(DeleteAccountState.Deleted, DeleteAccountFlow.fail(DeleteAccountState.Deleted, "x"))
    }

    // ---- full happy-path + error-then-retry sequences ----

    @Test
    fun `full happy path — idle to deleting to deleted`() {
        var state: DeleteAccountState = DeleteAccountState.Idle
        state = DeleteAccountFlow.startDelete("DELETE", state)
        assertEquals(DeleteAccountState.Deleting, state)
        state = DeleteAccountFlow.succeed(state)
        assertEquals(DeleteAccountState.Deleted, state)
    }

    @Test
    fun `error then retry sequence — idle to deleting to error to deleting to deleted`() {
        var state: DeleteAccountState = DeleteAccountState.Idle
        state = DeleteAccountFlow.startDelete("DELETE", state)
        state = DeleteAccountFlow.fail(state, "Network error")
        assertEquals(DeleteAccountState.Error("Network error"), state)

        state = DeleteAccountFlow.startDelete("DELETE", state)
        assertEquals(DeleteAccountState.Deleting, state)
        state = DeleteAccountFlow.succeed(state)
        assertEquals(DeleteAccountState.Deleted, state)
    }
}
