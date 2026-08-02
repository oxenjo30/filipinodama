package com.filipinodama.app.data.profile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
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

    /**
     * SECURITY CONTRACT — do NOT "fix" this test by making resolveAvatarUrl pass
     * absolute URLs through again.
     *
     * This test previously asserted `a full http URL passes straight through
     * unmodified`. That contract was deliberately REMOVED when the host
     * allowlist landed (AvatarAssets.ALLOWED_ASSET_HOSTS): `avatarUrl` is a
     * server-stored, OTHER-USER-controlled field, so an unrestricted passthrough
     * meant any player could set it to `https://attacker/x.png` and make every
     * device that renders their profile or match card fetch that host — a
     * tracking beacon and IP-harvesting vector aimed at anyone who views them.
     *
     * The test was left asserting the old behaviour and so failed on main. It is
     * rewritten here to pin the allowlist instead, because a red test that
     * describes a superseded security contract invites exactly the wrong fix.
     */
    @Test
    fun `an absolute URL on an untrusted host falls back to champion, never passed through`() {
        val hostile = "https://cdn.example.com/u/1234.png"
        val resolved = resolveAvatarUrl(hostile)

        assertNotEquals("an untrusted host must not be fetched", hostile, resolved)
        assertTrue(resolved.endsWith("/assets/avatars/champion.png"))
    }

    @Test
    fun `an absolute URL on a trusted OAuth provider host is preserved`() {
        // Google/Facebook profile pictures are stored as avatarUrl on OAuth
        // signup (server oauth.ts `avatar: info.picture`), so these MUST survive
        // the allowlist or every OAuth user renders as the champion fallback.
        val google = "https://lh3.googleusercontent.com/a/ACg8ocK-abc123=s96-c"
        assertEquals(google, resolveAvatarUrl(google))
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
