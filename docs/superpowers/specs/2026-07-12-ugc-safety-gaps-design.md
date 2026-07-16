# UGC Safety Gaps — Block, Profanity Filter, Guild Report — Design

**Date:** 2026-07-12
**Status:** Approved (pending spec review)

## Summary

Close the three Google Play user-generated-content (UGC) safety gaps identified
in the Android 13+ compliance audit, across server + web + Android:

1. **Block a user** — remove-friend + hide behavior (new `Block` model).
2. **Profanity filter** — English + Filipino + regional word-list in
   `@dama/shared`; **names rejected** at submission, **chat masked** and
   delivered.
3. **Guild-chat in-context report** — extend the existing report pipeline with a
   `"guild"` context and wire an in-message Report affordance.

All enforcement is server-side (source of truth); clients mirror for UX. Every
change is additive; no existing feature is removed.

## Gap 1 — Block a user

### Data model (new, requires migration)
```
model Block {
  id         String   @id @default(cuid())
  blockerId  String
  blocker    User     @relation("blocker", fields: [blockerId], references: [id], onDelete: Cascade)
  blockedId  String
  blocked    User     @relation("blocked", fields: [blockedId], references: [id], onDelete: Cascade)
  createdAt  DateTime @default(now())
  @@unique([blockerId, blockedId])
  @@index([blockedId])
}
```
Directional (blocker → blocked). Add the two back-relations to `User`.

### Server routes — new `apps/server/src/modules/blocks.ts`
- **`POST /api/blocks { userId }`** (`requireAuth`, guest-blocked like reports):
  in one transaction — create the `Block` (idempotent via the unique key: a
  duplicate is a no-op, not a 409), delete any `Friendship` between the pair
  (sorted `aId/bId` key like `friends.ts:64`), and delete any pending
  `FriendRequest` in either direction. Reject self-block, bot, deleted.
- **`DELETE /api/blocks/:userId`** — remove the block (idempotent).
- **`GET /api/blocks`** — the caller's blocked list (id + public user fields),
  for the Settings management screen.
- Register the module in the server's route wiring (mirror how `reportRoutes` is
  registered).

### Enforcement (server)
- **DM** (`dm.ts` `assertFriends`): also throw if a `Block` exists in **either**
  direction between the two (blocked users are, by definition, not friends after
  a block, but a block placed while a request was pending must still hard-stop
  DM open/send). New error `BLOCKED`.
- **Friend request** (`friends.ts createFriendRequest`): reject if either side
  has blocked the other (`BLOCKED`).
- **Guild chat history + live relay** (`guild-chat-service.loadGuildHistory` and
  the live `postGuildMessage` fan-out): filter OUT messages authored by a user
  the **viewer** has blocked. History filter is per-request (needs the viewer
  id); live relay: the client also drops incoming messages from blocked authors
  (the server relay is room-wide, so the viewer-side filter is the reliable
  layer — apply BOTH: server omits from history, client omits from live).
- **Match chat:** match chat is emote/phrase-only, low risk; blocked-author
  filtering applies client-side on the incoming feed for consistency (no server
  change needed there beyond what already exists).

### Clients
- **Android:** `BlockRepository` + API (`POST/DELETE/GET /api/blocks`); a
  **Block / Unblock** action next to Report on `PublicProfileScreen` and in the
  DM screen header; a **Blocked Users** list in Settings (view + unblock).
- **Web:** `blockUser`/`unblockUser` calls; Block/Unblock beside the Report
  button on `PublicProfilePage`; a blocked-list section (Settings or the profile
  menu). Web guild/DM views filter blocked authors on the incoming feed.

## Gap 2 — Profanity filter (English + Filipino + regional)

### Shared module — new `packages/shared/src/profanity.ts`
- A curated word-list, grouped and commented by language for easy extension:
  - **English** — strong profanity + slurs.
  - **Tagalog/Filipino** — e.g. putangina/tangina, gago/gaga, ulol, pakyu,
    leche, punyeta, hindot, pokpok, tarantado, kupal, hinayupak, and common
    vulgar anatomy terms — with spelling/leetspeak variants (p*tangina, tngna).
  - **Cebuano/Bisaya** — e.g. yawa, pisti, bilat, buang, and common strong terms.
  - **Ilocano / Hiligaynon** — the most common strong terms.
  - **Curated & strong only:** deliberately EXCLUDE genuinely ambiguous /
    context-dependent words to avoid false positives (per the "curated strong
    list" decision).
- **Normalization** before matching: lowercase; map leetspeak `@→a 0→o 1→i
  3→e 4→a 5→s $→s 7→t`; collapse 3+ repeated letters (`fuuuck`→`fuck`); strip
  separators between letters used to evade (`f.u.c.k`, `f u c k`) for the
  match pass only (not for the returned/stored text).
- **Matching:** WHOLE-WORD against the normalized text (word boundaries) so
  `assassin`, `Scunthorpe`, `class`, `analysis` never trip.
- **Exports:**
  - `containsProfanity(text: string): boolean`
  - `maskProfanity(text: string): string` — replaces each matched word with
    `****` (or same-length asterisks) in the ORIGINAL text, preserving
    non-profane content and spacing.

### Enforcement — behavior split (approved)
**Names REJECTED** (permanent/public) — validation throws a friendly
`INAPPROPRIATE_LANGUAGE` 400 ("That name contains inappropriate language.
Please choose another."):
- Username — `register()` (`service.ts`) and OAuth `uniqueUsername()`
  (`oauth.ts`): after the existing format/uniqueness checks, reject if
  `containsProfanity(username)`. (For OAuth auto-derived usernames, if the
  derived base is profane, fall through to the numeric-suffix path / a neutral
  default rather than erroring the whole sign-in — OAuth must not hard-fail on a
  profane provider name; documented in the plan.)
- Display name + bio — `updateProfileSchema` handler (`users.ts`): reject if
  `containsProfanity(displayName)` or `containsProfanity(bio)`.
- Guild name + tag — `createGuildSchema`/`updateGuildSchema` handlers
  (`guilds.ts:112,240`): reject if profane.

**Chat MASKED and delivered** (transient) — run `maskProfanity(body)` before
persist/relay:
- DM send (`dm.ts` POST): mask `body` before creating the `Message`.
- Guild chat send (`guild-chat-service.postGuildMessage`): mask `body` before
  persist + fan-out.
(Match chat is a fixed emote/phrase set — nothing to filter.)

Where to call it: for names, do the check in the route handler (not only the zod
schema) so the error code is a clean domain error, consistent with existing
`USERNAME_TAKEN`/`NAME_TAKEN` handling. Schemas keep their length/format rules.

## Gap 3 — Guild-chat in-context report

Guild messages are persisted `Message` rows in a `Channel` of type `GUILD`
(`schema.prisma:349`; verified), with an `id` + `authorId` — reportable exactly
like DMs.

### Server — `reports.ts`
- Add `"guild"` to the `context` enum: `z.enum(["dm", "profile", "guild"])`.
- Require `messageId` for `guild` too (extend the refine).
- Verification branch mirroring the DM branch: find the message; assert
  `msg.channel.type === "GUILD"`; assert `msg.authorId === accusedId`; assert the
  **reporter is a member of that guild** (look up `GuildMember` for the reporter
  against the channel's guild via `channel.refId`); set `excerpt` +
  `channelId`. Preserve the existing atomic advisory-lock rate limit unchanged.

### Clients
- **Android:** long-press / overflow **Report** on a guild-chat message (in the
  guild hall chat) → opens the existing `ReportPlayerDialog` with
  `context="guild"` + `messageId` + `accusedId` (the message author).
- **Web:** same in-context Report on a guild chat message.

## Data flow

Client action → server route (auth + guest guard) → Prisma. Blocks and profanity
are enforced server-side (authoritative); clients mirror block-filtering on
incoming feeds and show masked text as received. Reports flow through the
existing rate-limited pipeline with the new `guild` context.

## Error handling / edge cases

- Block: idempotent create/delete; self/bot/deleted rejected; blocking removes
  friendship + pending requests atomically; DM/friend-request hard-stop on a
  block in either direction.
- Profanity: whole-word + leetspeak avoids Scunthorpe/assassin false positives;
  OAuth never hard-fails on a profane provider-derived name (falls back);
  masking preserves message delivery (non-punitive).
- Guild report: rejects a message not in a guild the reporter belongs to, or not
  authored by the accused; rate limit unchanged; guests blocked.
- A user viewing history after blocking someone: blocked author's past guild
  messages are omitted from the fetched history.

## Testing

- **Server (vitest):**
  - Block: create removes friendship + pending requests; duplicate is a no-op;
    DM open/send throws `BLOCKED` when blocked either direction; friend-request
    rejected when blocked; `GET /api/blocks` lists them.
  - Profanity: `containsProfanity` true for representative English + Tagalog +
    Cebuano words + leetspeak variants; FALSE for Scunthorpe/assassin/class/
    analysis (false-positive guard); `maskProfanity` masks the word and keeps
    the rest; name routes reject; chat routes deliver masked.
  - Guild report: a valid guild-message report succeeds; wrong-guild / wrong-
    author / non-member rejected.
- **Web:** `pnpm --filter web typecheck && lint && build`; manual — Block/Unblock
  on a profile; blocked author's messages hidden; guild-chat Report opens.
- **Android:** `pnpm`-equivalent Gradle build / Kotlin compile (typecheck via
  build); manual — Block/Unblock + blocked list + guild Report dialog.
- **Migration:** `Block` model migration created; server tests run against it.

## Out of scope

- Admin-editable (DB-backed) blocklist — deferred; the list is a shared code
  module for now.
- Full mutual-invisibility blocking (matchmaking/leaderboard/roster hiding) — not
  chosen; block is remove-friend + chat/DM hide.
- Filtering match chat (fixed emote/phrase set — nothing to filter).
- Retroactively masking already-stored chat messages (only new messages are
  masked going forward).
