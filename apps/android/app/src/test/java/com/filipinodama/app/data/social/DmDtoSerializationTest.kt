package com.filipinodama.app.data.social

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Serialization tests for the DM wire DTOs, using REAL JSON fixtures shaped
 * exactly like apps/server/src/modules/dm.ts's responses (verified against
 * that module's GET /dm, GET /dm/:userId, POST /dm/:userId handlers) and the
 * live socket payload emitted alongside EV.chatMessage / kind:"dm".
 */
class DmDtoSerializationTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    @Test
    fun `decodes a conversations list response`() {
        val raw = """
            {"conversations":[
              {"channelId":"c1","user":{"id":"u2","displayName":"Ermitanyo","tag":"#0002","avatarUrl":null},
               "lastMessage":"gg!","lastAt":"2026-07-10T10:00:00.000Z","unread":2},
              {"channelId":"c2","user":{"id":"u3","displayName":"Datu Rico","tag":"#0003","avatarUrl":"http://x/a.png"},
               "lastMessage":null,"lastAt":null,"unread":0}
            ]}
        """.trimIndent()

        val res = json.decodeFromString(DmConversationsResponse.serializer(), raw)

        assertEquals(2, res.conversations.size)
        assertEquals("Ermitanyo", res.conversations[0].user.displayName)
        assertEquals(2, res.conversations[0].unread)
        assertNull(res.conversations[1].lastMessage)
    }

    @Test
    fun `decodes a thread response with messages`() {
        val raw = """
            {"channelId":"c1","user":{"id":"u2","displayName":"Ermitanyo","tag":"#0002","avatarUrl":null},
             "messages":[
               {"id":"m1","channelId":"c1","body":"hey","createdAt":"2026-07-10T09:00:00.000Z",
                "author":{"id":"u1","displayName":"Me","avatarUrl":null}},
               {"id":"m2","channelId":"c1","body":"gg!","createdAt":"2026-07-10T10:00:00.000Z",
                "author":{"id":"u2","displayName":"Ermitanyo","avatarUrl":null}}
             ]}
        """.trimIndent()

        val res = json.decodeFromString(DmThreadResponse.serializer(), raw)

        assertEquals("c1", res.channelId)
        assertEquals(2, res.messages.size)
        assertEquals("gg!", res.messages[1].body)
        assertEquals("u2", res.messages[1].author.id)
    }

    @Test
    fun `decodes a live chat message event with kind dm`() {
        val raw = """
            {"channelId":"c1","message":{"id":"m3","channelId":"c1","body":"nice game","createdAt":"2026-07-10T11:00:00.000Z",
             "author":{"id":"u2","displayName":"Ermitanyo","avatarUrl":null}},"kind":"dm","from":"u2"}
        """.trimIndent()

        val evt = json.decodeFromString(DmChatMessageEvent.serializer(), raw)

        assertEquals("dm", evt.kind)
        assertEquals("c1", evt.channelId)
        assertEquals("nice game", evt.message?.body)
    }

    @Test
    fun `ignores a non-dm kind event shape without crashing`() {
        val raw = """{"channelId":"c9","message":null,"kind":"guild","from":"u9"}"""
        val evt = json.decodeFromString(DmChatMessageEvent.serializer(), raw)
        assertTrue(evt.kind != "dm")
        assertNull(evt.message)
    }

    @Test
    fun `decodes an unread total response`() {
        val res = json.decodeFromString(DmUnreadTotalResponse.serializer(), """{"total":7}""")
        assertEquals(7, res.total)
    }
}
