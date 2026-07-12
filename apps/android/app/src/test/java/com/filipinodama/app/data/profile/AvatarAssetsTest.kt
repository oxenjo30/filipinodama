package com.filipinodama.app.data.profile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Avatar / frame resolver tests — a Kotlin port of apps/web/src/lib/assets.ts
 * avatar()/frameArt(), verifying branch parity INCLUDING the "ambiguous ->
 * champion fallback" safety rule (assets.ts's key contribution: never build a
 * probably-broken URL for an unrecognized extensioned/slashed value).
 */
class AvatarAssetsTest {

    @Test
    fun `blank or null avatarUrl falls back to champion (every player must render an avatar)`() {
        assertTrue(resolveAvatarUrl(null).endsWith("/assets/avatars/champion.png"))
        assertTrue(resolveAvatarUrl("").endsWith("/assets/avatars/champion.png"))
    }

    @Test
    fun `a known named avatar key resolves to its fixed file`() {
        assertTrue(resolveAvatarUrl("sultan").endsWith("/assets/avatars/sultan.png"))
        assertTrue(resolveAvatarUrl("lakan").endsWith("/assets/avatars/lakan.png"))
    }

    @Test
    fun `a bare unknown key with no folder or extension resolves to avatars slash key dot png`() {
        // e.g. a starter avatar key like "katipunero" that isn't in the NAMED_AVATARS
        // fixed list still resolves via the bare-key branch (assets.ts's documented
        // contract: avatarUrl stores the bare key -> avatars/<key>.png).
        assertTrue(resolveAvatarUrl("katipunero").endsWith("/assets/avatars/katipunero.png"))
    }

    @Test
    fun `an absolute path is prefixed with the web origin, not double-prefixed`() {
        val url = resolveAvatarUrl("/assets/avatars/champion.png")
        assertTrue(url.endsWith("/assets/avatars/champion.png"))
        assertEquals(1, Regex("/assets/avatars/champion\\.png").findAll(url).count())
    }

    @Test
    fun `a full http URL passes straight through unmodified`() {
        val url = "https://cdn.example.com/u/1234.png"
        assertEquals(url, resolveAvatarUrl(url))
    }

    @Test
    fun `an assets-prefixed relative value resolves directly under the origin without doubling assets`() {
        val url = resolveAvatarUrl("assets/avatars/sovereign.png")
        assertTrue(url.endsWith("/assets/avatars/sovereign.png"))
        assertEquals(1, Regex("/assets/").findAll(url).count())
    }

    @Test
    fun `an avatars-prefixed relative value resolves without doubling the avatars folder`() {
        val url = resolveAvatarUrl("avatars/panday.png")
        assertTrue(url.endsWith("/assets/avatars/panday.png"))
        assertEquals(1, Regex("/avatars/").findAll(url).count())
    }

    @Test
    fun `an ambiguous extensioned value not under avatars falls back to champion rather than guessing`() {
        // e.g. a stray filename or a store-item id that carries an extension but
        // isn't namespaced under avatars/ — assets.ts explicitly refuses to guess.
        assertTrue(resolveAvatarUrl("av.rajah.png").endsWith("/assets/avatars/champion.png"))
    }

    @Test
    fun `an ambiguous value containing a slash but not a recognized prefix falls back to champion`() {
        assertTrue(resolveAvatarUrl("legacy/old-key").endsWith("/assets/avatars/champion.png"))
    }

    @Test
    fun `resolveFrameUrl returns null for a blank or null frameId (no overlay)`() {
        assertNull(resolveFrameUrl(null))
        assertNull(resolveFrameUrl(""))
    }

    @Test
    fun `resolveFrameUrl resolves a known frame key to its fixed file`() {
        assertTrue(resolveFrameUrl("laurel")!!.endsWith("/assets/frames/laurel.png"))
        assertTrue(resolveFrameUrl("jade-dragon")!!.endsWith("/assets/frames/jade-dragon.png"))
    }

    @Test
    fun `resolveFrameUrl does not double the frames folder for a frames-prefixed value`() {
        val url = resolveFrameUrl("frames/kalasag.png")!!
        assertTrue(url.endsWith("/assets/frames/kalasag.png"))
        assertEquals(1, Regex("/frames/").findAll(url).count())
    }

    @Test
    fun `resolveFrameUrl best-effort resolves an unknown frame item id (real equipped ids always map server-side)`() {
        val url = resolveFrameUrl("some-real-item-id")!!
        assertTrue(url.endsWith("/assets/frames/some-real-item-id"))
    }
}
