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
Directional (blocker → blocked). **BLOCKER FIX: Prisma requires the opposite
sides on `User` explicitly** (every relation in this schema does — cf.
`friendshipsA`/`friendshipsB`, `sentReqs`/`recvReqs`). Add these two array fields
to the `User` model or the migration will not generate:
```
  blocksMade     Block[] @relation("blocker")
  blocksReceived Block[] @relation("blocked")
```
`@@index([blockedId])` is sufficient — `blockerId`-only lookups (`GET /api/blocks`)
are served by the leading column of the `@@unique([blockerId, blockedId])`.

### Server routes — new `apps/server/src/modules/blocks.ts`
- **`POST /api/blocks { userId }`** (`requireAuth`, guest-blocked like reports):
  Reject self-block, bot, deleted first. Then in one `$transaction`:
  - **Create the block via `upsert`** (`where: { blockerId_blockedId }`,
    `update: {}`, `create: {...}`) — idempotent, no P2002 500 on a double-tap.
    (This mirrors the `Friendship` upsert at `friends.ts:180-184`; do NOT use a
    bare `create()`, which 500s on a duplicate.)
  - **`deleteMany`** (NOT `delete`) the `Friendship` for the sorted pair
    (`aId < bId`, cf. `friends.ts:63-64`) — `deleteMany` returns `count:0` when
    there's no friendship (the common case: most blocked users were never
    friends), whereas `delete` throws `P2025`.
  - **`deleteMany`** any pending `FriendRequest` in either direction.
  - Deleting the `Friendship` automatically stops presence updates between the
    pair — presence derives friend ids live from the table at broadcast time
    (`realtime/presence.ts`), so no extra cleanup is needed.
- **`DELETE /api/blocks/:userId`** — `deleteMany` the block (idempotent).
- **`GET /api/blocks`** — the caller's blocked list (id + public user fields),
  for the Settings management screen.
- Register the module in the server's route wiring (mirror how `reportRoutes` is
  registered in `apps/server/src/index.ts`).

### Enforcement (server)
- **Friend request** (`friends.ts createFriendRequest`): reject if either side
  has blocked the other (`BLOCKED`). This is the PRIMARY hard-stop — a block
  deletes the friendship, so re-friending is the only way back to DM access, and
  this closes it.
- **DM** (`dm.ts` `assertFriends`): also throw `BLOCKED` if a `Block` exists in
  either direction. NOTE (corrected reasoning): since a block deletes the
  `Friendship` in the same transaction, `assertFriends` already throws
  `NOT_FRIENDS` after a block — so this check is mostly a **clearer error
  message** ("you blocked this player" vs. generic "friends only"), not a new
  reachable hole. Include it for the message + defense-in-depth, but don't rely
  on it as the sole gate (the friend-request + friendship-deletion above are).
- **Guild chat history** (`guild-chat-service.loadGuildHistory`): **its signature
  changes** from `loadGuildHistory(guildId, limit=50)` to accept the viewer id
  (`loadGuildHistory(guildId, viewerId, limit=50)`); update the ONE call site
  (`guilds.ts:284`) to pass `me`. **Filter BEFORE the limit** (either add
  `authorId: { notIn: blockedIds }` to the Prisma `where`, or overfetch and
  truncate) — filtering after `take:50` under-fills the page when a blocked user
  posted recently. `blockedIds` = the viewer's `blocksMade` ids.
- **Live guild-chat relay** (`guilds.ts:304` → room-wide `emit`): the socket
  broadcast is room-wide with no per-viewer filter, so a blocked author's live
  message DOES reach the blocker's socket; the **client drops it** on receipt.
  This is a KNOWN RESIDUAL EXPOSURE (a modified client could still read it) —
  acceptable for a harassment-mitigation UX control (the blocker doesn't see it),
  documented here rather than hidden. Server-side per-viewer live filtering would
  require per-recipient emits (larger change) — deferred.
- **Match chat:** emote/phrase-only, low risk; blocked-author filtering applies
  client-side on the incoming feed for consistency (no server change).
- **Directionality (stated plainly):** DM + friend-request checks are BOTH
  directions (neither can DM/request the other). Guild/match chat hiding is
  ONE direction (the blocker stops seeing the blocked user; the blocked user
  still sees the blocker's guild messages). Full mutual invisibility is out of
  scope (see Out of scope) — this is an intentional scope boundary, noted so
  it isn't mistaken for a bug.

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
  3→e 4→a 5→s $→s 7→t`; collapse 3+ repeated letters (`fuuuck`→`fuck`).
  **FALSE-POSITIVE FIX:** do NOT globally strip all separators (spaces/dots)
  before matching — that would collapse innocent multi-word text into a match
  (e.g. "class sizes" → "classsizes", or spaced letters across real word
  boundaries forming a slur). Instead: tokenize on whitespace, then within each
  TOKEN only, strip intra-word punctuation used to evade (`f.u.c.k`, `f*ck`) —
  bounded to a single token, never across spaces. Match the word-list against
  each normalized token.
- **Matching:** WHOLE-TOKEN / word-boundary match against the normalized tokens
  so `assassin`, `Scunthorpe`, `class`, `analysis`, `bass` never trip.
  **Honesty note:** a curated list is never exhaustive — this reduces obvious
  abuse, it is not complete moderation. Report + block remain the backstop.
- **Exports:**
  - `containsProfanity(text: string): boolean`
  - `maskProfanity(text: string): string` — replaces each matched word with
    `****` (or same-length asterisks) in the ORIGINAL text, preserving
    non-profane content and spacing.

### Enforcement — behavior split (approved)
**Names REJECTED** (permanent/public) — validation throws a friendly
`INAPPROPRIATE_LANGUAGE` 400 ("That name contains inappropriate language.
Please choose another."):
- Username — `register()` (`service.ts`): after the format/uniqueness checks,
  reject if `containsProfanity(username)` (`INAPPROPRIATE_LANGUAGE`).
- OAuth `uniqueUsername(base)` (`oauth.ts:180`): this DERIVES a username from the
  provider name and must NEVER hard-fail sign-in. Fix in place: if the cleaned
  `clean` base is profane, replace it with the neutral `"player"` base BEFORE the
  uniqueness loop (the function already falls back to `player${timestamp}` at the
  end) — so a user named e.g. a slur on their Google account still signs in, just
  with a neutral generated handle. Also mask/neutralize the derived `displayName`
  if the provider `profile.name` is profane (OAuth sets `displayName` from the
  provider name at `oauth.ts` create) — reject would break sign-in, so mask it
  or fall back to the username.
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
The `context` type is a string union in BOTH clients — updating the server enum
alone breaks their typecheck. Update all three:
- **Shared/server:** the zod enum (above).
- **Web:** `ReportPlayerModal.tsx:61` `context: "dm" | "profile"` → add `"guild"`;
  `noteRequired` stays `context === "profile"` (guild uses messageId, not note).
  Then add an in-context **Report** on a guild chat message (web guild hall)
  that opens `ReportPlayerModal` with `context="guild"`, `messageId`, `accusedId`.
- **Android:** `ReportApi.kt:22` comment `// "dm" | "profile"` → include `guild`;
  add long-press / overflow **Report** on a guild-chat message (guild hall chat)
  opening the existing `ReportPlayerDialog` with `context="guild"` + `messageId`
  + `accusedId` (the message author).

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
  - Block idempotency: a double `POST /api/blocks` for the same pair does NOT
    500 (upsert no-ops); blocking a non-friend does NOT throw P2025 (deleteMany);
    unblock twice is a no-op.
  - Profanity: `containsProfanity` true for representative English + Tagalog +
    Cebuano words + leetspeak variants (`sh1t`, `p*tangina`, `f.u.c.k`); FALSE
    for Scunthorpe/assassin/class/analysis/bass AND for innocent multi-word text
    like "class sizes" / "pass the ball" (the tokenization false-positive guard);
    `maskProfanity` masks the word and keeps the rest; name routes reject; chat
    routes deliver masked. OAuth `uniqueUsername` with a profane base returns a
    neutral handle (no throw, sign-in succeeds).
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
