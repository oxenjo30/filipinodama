package com.filipinodama.app.data.match

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Collections
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class MatchmakingQueueOperationTest {
    private val casualEither = MmJoinRequest("casual", "either")

    @Test
    fun `failed initial dispatch permits retry without waiting for a leave ack`() {
        val operation = MatchmakingQueueOperation()
        assertEquals(listOf(QueueOperationCommand.Join(casualEither)), operation.begin(casualEither))
        operation.onJoinDispatchFailed()
        assertEquals(MatchStatus.IDLE, operation.status)
        assertEquals(listOf(QueueOperationCommand.Join(casualEither)), operation.begin(casualEither))
    }

    @Test
    fun `dispatch failure cannot clear a found match`() {
        val operation = MatchmakingQueueOperation()
        operation.begin(casualEither)
        operation.onFound()
        operation.onJoinDispatchFailed()
        assertEquals(MatchStatus.FOUND, operation.status)
    }

    @Test
    fun `cancel begin replace then old ack emits only latest desired join once`() {
        val operation = MatchmakingQueueOperation()
        assertEquals(listOf(QueueOperationCommand.Join(casualEither)), operation.begin(casualEither))
        val leave = operation.cancel().single() as QueueOperationCommand.Leave
        assertEquals(emptyList<QueueOperationCommand>(), operation.begin(MmJoinRequest("ranked", "either")))
        assertEquals(emptyList<QueueOperationCommand>(), operation.replace(MmJoinRequest("ranked", "blue")))

        assertEquals(listOf(QueueOperationCommand.Join(MmJoinRequest("ranked", "blue"))), operation.onLeaveAcknowledged(leave.token))
        assertEquals(emptyList<QueueOperationCommand>(), operation.onLeaveAcknowledged(leave.token))
        assertEquals(MatchStatus.SEARCHING, operation.status)
    }

    @Test
    fun `watchdog leave survives UI reset and a later begin waits behind its barrier`() {
        val operation = MatchmakingQueueOperation()
        operation.begin(casualEither)
        val leave = operation.watchdogFailure().single() as QueueOperationCommand.Leave
        operation.onUiReset()
        assertEquals(emptyList<QueueOperationCommand>(), operation.begin(MmJoinRequest("casual", "red")))
        assertEquals(listOf(QueueOperationCommand.Join(MmJoinRequest("casual", "red"))), operation.onLeaveAcknowledged(leave.token))
    }

    @Test
    fun `barrier timeout then late ack cannot duplicate or cancel replacement`() {
        val operation = MatchmakingQueueOperation()
        operation.begin(casualEither)
        val leave = operation.replace(MmJoinRequest("casual", "blue")).single() as QueueOperationCommand.Leave
        assertEquals(listOf(QueueOperationCommand.Join(MmJoinRequest("casual", "blue"))), operation.onBarrierTimeout(leave.token))
        assertEquals(emptyList<QueueOperationCommand>(), operation.onLeaveAcknowledged(leave.token))
        assertEquals(MatchStatus.SEARCHING, operation.status)
    }

    @Test
    fun `unidentified late ACK is consumed before a newer barrier can be released`() {
        val operation = MatchmakingQueueOperation()
        operation.begin(casualEither)
        val old = operation.replace(MmJoinRequest("casual", "blue")).single() as QueueOperationCommand.Leave
        operation.onBarrierTimeout(old.token)
        val newer = operation.replace(MmJoinRequest("casual", "red")).single() as QueueOperationCommand.Leave

        assertEquals(emptyList<QueueOperationCommand>(), operation.onUnidentifiedLeaveAcknowledgement(newer.token))
        assertEquals(listOf(QueueOperationCommand.Join(MmJoinRequest("casual", "red"))), operation.onBarrierTimeout(newer.token))
    }

    @Test
    fun `ordinary begin joins immediately and ordinary replacement ACK dispatches once`() {
        val operation = MatchmakingQueueOperation()
        assertEquals(listOf(QueueOperationCommand.Join(casualEither)), operation.begin(casualEither))
        val leave = operation.replace(MmJoinRequest("casual", "red")).single() as QueueOperationCommand.Leave
        assertTrue(leave.token > 0)
        assertEquals(listOf(QueueOperationCommand.Join(MmJoinRequest("casual", "red"))), operation.onLeaveAcknowledged(leave.token))
    }

    @Test
    fun `UI reset releases accepted found state so the next begin can join`() {
        val operation = MatchmakingQueueOperation()
        operation.begin(casualEither)
        operation.onFound()
        operation.onUiReset()

        assertEquals(listOf(QueueOperationCommand.Join(MmJoinRequest("ranked", "either"))), operation.begin(MmJoinRequest("ranked", "either")))
    }

    @Test
    fun `hard reset releases accepted match so a new account can join`() {
        val operation = MatchmakingQueueOperation()
        operation.begin(casualEither)
        operation.onFound()

        operation.hardReset()

        assertEquals(MatchStatus.IDLE, operation.status)
        assertEquals(listOf(QueueOperationCommand.Join(MmJoinRequest("ranked", "either"))), operation.begin(MmJoinRequest("ranked", "either")))
    }

    @Test
    fun `hard reset drops barrier and deferred request so late signals cannot join it`() {
        val operation = MatchmakingQueueOperation()
        operation.begin(casualEither)
        val leave = operation.replace(MmJoinRequest("casual", "blue")).single() as QueueOperationCommand.Leave
        assertEquals(emptyList<QueueOperationCommand>(), operation.begin(MmJoinRequest("ranked", "red")))

        operation.hardReset()

        assertEquals(emptyList<QueueOperationCommand>(), operation.onLeaveAcknowledged(leave.token))
        assertEquals(emptyList<QueueOperationCommand>(), operation.onBarrierTimeout(leave.token))
        assertEquals(listOf(QueueOperationCommand.Join(MmJoinRequest("ranked", "either"))), operation.begin(MmJoinRequest("ranked", "either")))
    }

    @Test
    fun `hard reset never reuses an old barrier token for a new account`() {
        val operation = MatchmakingQueueOperation()
        operation.begin(casualEither)
        val oldLeave = operation.replace(MmJoinRequest("casual", "blue")).single() as QueueOperationCommand.Leave

        operation.hardReset()
        assertEquals(listOf(QueueOperationCommand.Join(MmJoinRequest("ranked", "either"))), operation.begin(MmJoinRequest("ranked", "either")))
        val newLeave = operation.replace(MmJoinRequest("ranked", "red")).single() as QueueOperationCommand.Leave
        assertTrue(newLeave.token != oldLeave.token)

        assertEquals(emptyList<QueueOperationCommand>(), operation.onBarrierTimeout(oldLeave.token))
        assertEquals(emptyList<QueueOperationCommand>(), operation.onLeaveAcknowledged(oldLeave.token))
        assertEquals(listOf(QueueOperationCommand.Join(MmJoinRequest("ranked", "red"))), operation.onLeaveAcknowledged(newLeave.token))
        assertEquals(emptyList<QueueOperationCommand>(), operation.onLeaveAcknowledged(newLeave.token))
    }

    @Test
    fun `hard reset invalidates pending watchdog and retry generations`() {
        val generations = QueueTimerGenerations()
        val watchdog = generations.nextJoinAck()
        val retry = generations.nextSearchRetry()

        generations.invalidateAll()

        assertTrue(!generations.isJoinAckCurrent(watchdog))
        assertTrue(!generations.isSearchRetryCurrent(retry))
    }

    @Test
    fun `queue transition lock linearizes found reset begin and ACK timeout without duplicate joins`() {
        val lock = QueueTransitionLock()
        val operation = MatchmakingQueueOperation()
        val commands = Collections.synchronizedList(mutableListOf<QueueOperationCommand>())
        val foundEntered = CountDownLatch(1)
        val releaseFound = CountDownLatch(1)
        val foundThread = Thread {
            lock.run {
                operation.onFound()
                foundEntered.countDown()
                assertTrue(releaseFound.await(2, TimeUnit.SECONDS))
            }
        }
        val resetBeginThread = Thread {
            assertTrue(foundEntered.await(2, TimeUnit.SECONDS))
            lock.run {
                operation.onUiReset()
                commands += operation.begin(MmJoinRequest("ranked", "either"))
            }
        }

        foundThread.start()
        resetBeginThread.start()
        assertTrue(foundEntered.await(2, TimeUnit.SECONDS))
        releaseFound.countDown()
        foundThread.join(2_000)
        resetBeginThread.join(2_000)
        assertEquals(listOf(QueueOperationCommand.Join(MmJoinRequest("ranked", "either"))), commands)

        commands.clear()
        operation.onUiReset()
        commands += operation.begin(casualEither)
        val leave = operation.replace(MmJoinRequest("casual", "blue")).single() as QueueOperationCommand.Leave
        commands.clear()
        val startRace = CountDownLatch(1)
        val ackThread = Thread {
            assertTrue(startRace.await(2, TimeUnit.SECONDS))
            lock.run { commands += operation.onLeaveAcknowledged(leave.token) }
        }
        val timeoutThread = Thread {
            assertTrue(startRace.await(2, TimeUnit.SECONDS))
            lock.run { commands += operation.onBarrierTimeout(leave.token) }
        }
        ackThread.start()
        timeoutThread.start()
        startRace.countDown()
        ackThread.join(2_000)
        timeoutThread.join(2_000)

        assertEquals(listOf(QueueOperationCommand.Join(MmJoinRequest("casual", "blue"))), commands)
        assertEquals(MatchStatus.SEARCHING, operation.status)
    }
}
