package com.filipinodama.app.ui.screens.game

import com.filipinodama.app.data.match.MatchStatus
import org.junit.Assert.*
import org.junit.Test

class MatchmakingScreenLifecycleOwnerTest {
    @Test fun `user exit leaves searching once and prevents disposal cleanup`() {
        val owner = MatchmakingScreenLifecycleOwner()
        assertEquals(MatchmakingExit(true, true, true), owner.requestUserExit(MatchStatus.SEARCHING))
        assertEquals(MatchmakingExit.None, owner.requestUserExit(MatchStatus.SEARCHING))
        assertFalse(owner.disposeIfOwned(MatchStatus.SEARCHING))
    }
    @Test fun `found reveal consumes back and playing passes through`() {
        assertEquals(MatchmakingBackAction.ConsumeFoundReveal, MatchmakingBackPolicy.forStatus(MatchStatus.FOUND))
        assertEquals(MatchmakingBackAction.PassThrough, MatchmakingBackPolicy.forStatus(MatchStatus.PLAYING))
    }
}
