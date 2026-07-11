# Emote Overhaul — Design

**Date:** 2026-07-11
**Status:** Approved (pending spec review)

## Summary

Make in-match emotes feel rich instead of thin, and consistent across the
multiplayer game modes. Four changes: (1) expand the emote catalog with a
generous FREE starter set of emoji reactions plus a set of quick-chat text
phrases; (2) fix the signup bug so new users start with a full default emote
loadout (and backfill existing users); (3) extract ONE shared in-match
`MatchChat` component (emoji-reactions row + quick-chat-phrases row) used by all
multiplayer modes, removing today's duplicated Quick-Chat markup; (4) show the
emote bar only in modes with a real human recipient — online casual, online
ranked, and private rooms — and remove the dead/stub emote UI from VS-AI, local
pass-and-play, and spectate.

## Current state (verified)

- **Catalog is 3 emotes total** (`apps/server/prisma/seed.ts`): `emote-resolve`
  (💪, free), `victory` (👑, 1500 gold), `focused` (🎯, 2000 gold). Emotes are
  emoji GLYPHS stored in the item's `previewKey` as `"emote:<glyph>"`
  (`cosmeticsStore.emoteGlyph()`, `cosmeticsStore.ts:95-99`) — there is NO emote
  art in the repo.
- **New users get ZERO equipped emotes** — a real bug. `grantDefaults`
  (`apps/server/src/auth/service.ts:55-90`) flags free EMOTE inventory rows as
  `equipped: true` but its final `user.update` only writes
  `equippedBoard`/`equippedSkin`/`avatarUrl` — it **never populates
  `user.equippedEmotes`** (the column defaults to `[]`). Equip limit is 6
  (`users.ts:188`, `EMOTE_LIMIT`).
- **In-match chat is duplicated + inconsistent:**
  - VS-AI/local (`GamePage.tsx:539-581`): Quick-Chat panel + emote tray, but
    `sendChat` is a toast stub (`GamePage.tsx:150-155`) — no socket, fake "Sent:".
  - Online (`OnlineMatchPage.tsx:549-629`): Quick-Chat + emote tray, REAL — emits
    `EV.matchChat` via `onlineStore.ts:406-424`.
  - Private room lobby (`PrivateRoomPage.tsx`): its own `RoomChat` with a
    hardcoded 4-phrase list (`EMOTES = ["👋 Hi!","😄 GG","🔥 Let's go","🤝 Good luck"]`).
  - Spectators: the Quick-Chat panel still renders in `OnlineMatchPage` but the
    server drops their sends (`match.ts:585` `colorOf` check) — a dead input.
- **Socket relay already supports both paths** (`match.ts:579-599`): `emote`
  (clamped 8 chars) and `body` text (clamped 200, blanked for muted players),
  anti-flood 8/4000ms. So quick-chat PHRASES ride the existing `body` path and
  emoji ride the `emote` path — no new socket event needed.
- **`publicUser()` omits `equippedEmotes`** (`auth/service.ts:11-36`) — the
  session user shape backing login/me lacks the field, so the client never sees
  the loadout (see §2, blocker).
- **OAuth signups never call `grantDefaults`** (`oauth.ts:135-163`) — Google/FB
  users get zero free cosmetics (see §2, blocker).
- **A 4th duplicate emote list** lives in `DamathRoomPage.tsx:20` (same hardcoded
  4 phrases), a real human-vs-human mode — in scope (see §4).
- **No `match-chat` tests exist** anywhere in the repo (verified) — so there are
  no existing tests to "keep passing"; new coverage is additive (see Testing).

## 1. Expanded catalog (emoji + phrases)

### Free starter emoji reactions (seed, `priceGold: 0`)
Add ~10–12 free EMOTE store items so new users own a rich set. Each is a store
item of `type: "EMOTE"`, `previewKey: "emote:<glyph>"`, `priceGold: 0`. Proposed
glyphs (final list in the plan): 👋 😄 😮 😢 👍 🔥 😎 🤝 🫡 😅 🙌 👏. The existing
`emote-resolve` (💪) stays. Give each a stable `id` (e.g. `emote-wave`,
`emote-laugh`, …) and `sortOrder` in the free range.

### Quick-chat phrases (NOT store items — a shared constant)
Phrases are short canned text, not owned cosmetics. Define ONE shared list in
`packages/shared` (e.g. `MATCH_PHRASES`), ~6–8 entries: "Good game!", "Nice
move!", "Let's go!", "Well played", "Good luck", "Oops", "Close one",
"Rematch?". These are free for everyone, sent over the `body` path.

### Paid / premium (unchanged + optional)
Keep `victory` (👑) and `focused` (🎯) as paid cosmetics. Optionally add 1–2
premium flair emotes as upsell (plan decides; not required).

## 2. Default emote loadout (fix the bug + backfill)

Four coordinated changes (the review found the first two are REQUIRED or the
feature silently fails):

- **BLOCKER — add `equippedEmotes` to `publicUser()` (`auth/service.ts:11-36`).**
  This shape backs login/register/guest/refresh/`GET /api/auth/me`, but it
  currently OMITS `equippedEmotes` (only `publicProfile()` in `users.ts` has it).
  So `me.equippedEmotes` is `undefined` all session and the match bar keeps
  falling back to the hardcoded set even after the DB is fixed. Add
  `equippedEmotes: u.equippedEmotes` to the returned object. (The client `Me`
  type in `apps/web/src/lib/api.ts` already declares the field.)
- **BLOCKER — call `grantDefaults` on OAuth signup (`oauth.ts:135-163`).**
  `findOrCreateOAuthUser` branch 3 (`prisma.user.create`, lines 151-162) never
  calls `grantDefaults`, so Google/Facebook signups get NO free board/skin/
  avatar/emotes at all (pre-existing bug). Add `await grantDefaults(prisma,
  user.id)` after the create in that branch ONLY (branches 1 and 2 return an
  existing user — don't re-grant). Import `grantDefaults` (currently unexported
  — export it from `service.ts`).
- **`grantDefaults` (`auth/service.ts:55-90`)**: while looping `defaults`,
  collect free EMOTE item ids. The query at `service.ts:56-58` has **no
  `orderBy`** — add `orderBy: { sortOrder: "asc" }` so ordering is deterministic.
  Then include `equippedEmotes: <free emote ids, capped at 6>` in the final
  `user.update`. Users still OWN all free emotes (inventory rows); the 6-cap is
  only the DEFAULT equipped loadout, consistent with the `EMOTE_LIMIT` of 6 at
  `users.ts:188`.
- **Backfill (one-off script + prod run)** — must grant OWNERSHIP, not just
  equip. Mirror the free-avatar backfill in `seed.ts:157-178`:
  - For each existing non-bot, non-deleted user: **upsert an `InventoryItem`**
    for every free EMOTE they don't own (so store cards show OWNED, not
    "Claim"), AND
  - if their `equippedEmotes` is EMPTY (`[]`), set it to the default 6.
    **Any NON-empty `equippedEmotes` — even a single paid emote — is left
    untouched** (never clobber an intentional loadout).
  - Idempotent, dry-run first, run against prod via the Railway public DB URL
    (same pattern as the trophy/soft-delete scripts).

## 3. Shared `MatchChat` component

- **New `apps/web/src/features/play/MatchChat.tsx`** — the single in-match
  emote/chat surface. A NEW component (do NOT reuse `features/shared/EmotePicker.tsx`
  — that's a draft-insert popover for DM/Guild composers, a different
  interaction from an immediate-send reaction row). Renders:
  - a **reactions row** showing **ALL free emotes the viewer OWNS** — not just
    the 6 equipped — so the in-match bar is genuinely rich (per decision). Source
    the owned free-emote glyphs from the cosmetics catalog (`byId` +
    `emoteGlyph`) filtered to owned+free, plus any equipped paid emotes. Falls
    back to a default glyph set only if that list is somehow empty.
  - a **phrases row** from the shared `MATCH_PHRASES`;
  - **the free-text input** (200-char box) is KEPT for online matches (it exists
    today at `OnlineMatchPage.tsx:615-628`); it is optional per caller (rooms may
    omit it) via a prop;
  - the incoming-message display (recent bubbles).
- **Define a normalized `MatchChatMsg` type** (in the component or a shared
  spot): `{ from: string; color?: "red"|"blue"|null; emote?: string|null; body?: string|null; at: number }`.
  The online store's `ChatMsg` already has separate `emote`/`body`
  (`onlineStore.ts`); the room store's `RoomChatMsg` is `body`-only
  (`roomStore.ts`). **Each caller maps its own message list to `MatchChatMsg[]`**
  before passing it in — the online adapter preserves the emoji-bubble
  treatment; the room adapter passes everything as `body` (emoji-as-text, matching
  the room channel's existing behavior).
- **Props (transport injected by caller):**
  `{ send: (p: { emote?: string; body?: string }) => void; messages: MatchChatMsg[]; showTextInput?: boolean; disabled?: boolean }`.
  The component owns layout + rows; the caller owns the socket/adapter.
- Replaces the duplicated Quick-Chat markup in `OnlineMatchPage`, the `RoomChat`
  emote list in `PrivateRoomPage`, AND the identical one in `DamathRoomPage`
  (see §4). GamePage's stub is deleted (see §4).

## 4. Per-mode presence (multiplayer only)

- **Online casual / ranked** (`OnlineMatchPage.tsx`): render `MatchChat`; `send`
  → `onlineStore` `EV.matchChat` (already wired). **Gate it off for
  spectators** (`myColor === null`) so the dead input is gone.
- **Private rooms** (`PrivateRoomPage.tsx`): render `MatchChat` in the room
  chat; `send` → the room's existing `sendChat(text)` (`"room:chat"`). NOTE the
  room channel is TEXT-ONLY (one string), unlike the online relay's separate
  `emote`/`body` fields. So the room caller's `send` adapter maps BOTH an emoji
  pick and a phrase pick to a single `sendChat(<glyph-or-phrase>)` string — this
  matches the room's current behavior (its `onEmote` already calls
  `sendChat(em)`). Replace the hardcoded 4-phrase `EMOTES` list with the shared
  reactions + `MATCH_PHRASES`. **Room mute caveat:** the room relay
  (`rooms.ts:325-339`) drops the WHOLE payload for a muted user (unlike the match
  relay which only blanks text) — so a muted room player's emoji are dropped.
  This is existing behavior; we do NOT change it here (documented, not a bug this
  spec introduces).
- **Damath rooms** (`DamathRoomPage.tsx`): the Damath variant room has the SAME
  hardcoded 4-phrase `EMOTES` duplicate (`DamathRoomPage.tsx:20`) and is a real
  routed human-vs-human mode (`/damath/room`). Apply the SAME shared `MatchChat`
  treatment as private rooms.
- **VS-AI** (`GamePage.tsx`): REMOVE the Quick-Chat panel + emote tray + the
  `sendChat` toast stub + local `GAME_EMOTES`. No emote bar in solo play.
- **Local pass-and-play**: no emote bar (same removal as VS-AI — it shares the
  GamePage surface).
- **Spectate**: no send (handled by the online-mode spectator gate above).

## "Thin" resolution (explicit)

The in-match reactions row shows **ALL free emotes the viewer owns** (~13), not
only the 6 equipped — so the bar is genuinely rich. The 6-slot equip limit still
governs the loadout concept elsewhere (Inventory/profile) but does NOT cap the
in-match bar. Plus the phrases row adds a second dimension. This is the concrete
fix for "so thin."

**Store display:** the ~13 free emotes appear in the Store's Emotes tab as
OWNED cards (not "Claim"), exactly like the 6 free avatars already sit among the
paid avatars (`seed.ts:32-37` precedent) — `grantDefaults`/backfill pre-own them.
The Emotes tab will skew free-heavy (~13 free : 2 paid); acceptable, matches the
avatars precedent. No store code change needed.

## Data flow

Owned free emote glyphs (+ equipped paid) via cosmetics catalog → `emoteGlyph` +
shared `MATCH_PHRASES` → `MatchChat` rows → caller's `send({emote})` /
`send({body})` (online) or `sendChat(text)` (rooms) → relay → each caller maps
the incoming feed to `MatchChatMsg[]` → message display.

## Error handling / edge cases

- New users (email + OAuth): full default reaction bar + ownership. Existing
  users: backfilled (ownership + empty-loadout equip).
- Empty loadout (shouldn't happen post-fix): `MatchChat` falls back to a default
  glyph set so the bar is never empty.
- Muted players: online relay blanks text but allows emoji; ROOM relay drops the
  whole payload (existing behavior, documented — §4).
- Spectators: input hidden (online-mode gate), not silently dropped.
- Backfill: NEVER clobbers a non-empty `equippedEmotes` (even one paid emote).
- Anti-flood (8/4000ms) covers both emoji + phrases; a throttled send is a silent
  server no-op — the client shows no cooldown UI (acceptable; not adding one).

## Testing

- **Server**: `pnpm --filter server typecheck`. There are NO existing match-chat
  tests, so no regression suite to lean on — add a focused test that
  `grantDefaults` populates `equippedEmotes` with the free set (capped at 6) and
  grants EMOTE inventory rows. (Server has a vitest suite — follow its pattern.)
- **Web**: `pnpm --filter web typecheck && lint && build`; manual — emote bar
  appears and sends in online + private + Damath rooms, is ABSENT in VS-AI /
  local / spectate; phrases deliver as text bubbles, emoji as emote bubbles; the
  in-match reactions row shows all owned free emotes (not just 6).
- **Backfill**: dry-run shows affected existing users + which get ownership vs
  equip, before applying.

## Out of scope

- Emote art / animation (stays emoji glyphs).
- A dedicated loadout editor screen (equipping stays in Inventory).
- Reworking the DM/Guild `EmotePicker` (`features/shared/EmotePicker.tsx`).
- Bot emoting back in VS-AI (solo modes have no emote bar at all).
