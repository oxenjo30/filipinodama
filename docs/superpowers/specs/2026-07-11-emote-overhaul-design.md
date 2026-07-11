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

- **`grantDefaults` (`auth/service.ts`)**: collect the free EMOTE item ids while
  looping `defaults`, then include `equippedEmotes: <free emote ids, capped at
  6>` in the final `user.update`. So every new user starts with a full reaction
  bar. (Order the free emotes by `sortOrder` and take the first 6 for the
  default loadout; they still OWN all free emotes for equipping others in
  Inventory.)
- **Backfill (one-off script + prod run)**: for existing non-bot users with
  `equippedEmotes = []` who OWN free emotes, set `equippedEmotes` to the same
  default set. Mirrors the earlier trophy-backfill pattern (idempotent, dry-run
  first, run against prod via the Railway public DB URL).

## 3. Shared `MatchChat` component

- **New `apps/web/src/features/play/MatchChat.tsx`** — the single in-match
  emote/chat surface. Renders:
  - a **reactions row** from the viewer's equipped emote glyphs (resolved via
    `cosmeticsStore.emoteGlyph`), falling back to a sensible default set if the
    loadout is somehow empty;
  - a **phrases row** from the shared `MATCH_PHRASES`;
  - the incoming-message display (recent emote/phrase bubbles).
- **Props (transport injected by caller):**
  `{ send: (p: { emote?: string; body?: string }) => void; messages: MatchChatMsg[]; disabled?: boolean }`.
  The component owns layout + the two rows; the caller owns the socket.
- Replaces the duplicated Quick-Chat markup in `OnlineMatchPage` and the
  `RoomChat` emote list in `PrivateRoomPage`. GamePage's stub is deleted (see §4).

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
  reactions + `MATCH_PHRASES`.
- **VS-AI** (`GamePage.tsx`): REMOVE the Quick-Chat panel + emote tray + the
  `sendChat` toast stub + local `GAME_EMOTES`. No emote bar in solo play.
- **Local pass-and-play**: no emote bar (same removal as VS-AI — it shares the
  GamePage surface).
- **Spectate**: no send (handled by the online-mode spectator gate above).

## Data flow

Equipped emote glyphs (`user.equippedEmotes` → `emoteGlyph`) + shared
`MATCH_PHRASES` → `MatchChat` rows → caller's `send({emote})` / `send({body})`
→ socket relay (`match.ts` for online; room channel for rooms) → both players'
message displays.

## Error handling / edge cases

- New users: full default reaction bar (bug fixed). Existing users: backfilled.
- Empty loadout (shouldn't happen post-fix): `MatchChat` falls back to a default
  glyph set so the bar is never empty.
- Muted players: server already blanks their text but allows emoji — unchanged.
- Spectators: input hidden, not silently dropped.
- 6-slot equip limit unchanged; phrases are a separate free list, not
  slot-limited.
- Anti-flood (8/4000ms) already covers both emoji + phrases.

## Testing

- **Server**: `pnpm --filter server typecheck`; existing match-chat tests still
  pass; a new/updated test asserts `grantDefaults` populates `equippedEmotes`
  with the free set (capped at 6).
- **Web**: `pnpm --filter web typecheck && lint && build`; manual — emote bar
  appears and sends in online + private rooms, is ABSENT in VS-AI / local /
  spectate; phrases deliver as text bubbles, emoji as emote bubbles.
- **Backfill**: dry-run shows the affected existing users before applying.

## Out of scope

- Emote art / animation (stays emoji glyphs).
- A dedicated loadout editor screen (equipping stays in Inventory).
- Reworking the DM/Guild `EmotePicker` (`features/shared/EmotePicker.tsx`).
- Bot emoting back in VS-AI (solo modes have no emote bar at all).
