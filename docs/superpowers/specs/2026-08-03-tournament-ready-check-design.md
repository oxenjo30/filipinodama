# Tournament ready-check, auto-start and auto-advance (V1.5)

**Status:** approved 2026-08-03 (owner). Supersedes the "Deferred to V1.5" section of
`2026-07-10-tournaments-design.md` for the three items it names: the player-facing
"Play your match" handoff, auto-advance on match settlement, and lazy match creation.

---

## Problem

Tournaments ship today as an **admin-managed** subsystem. Players can browse, join and
leave (`apps/server/src/modules/tournaments.ts` — those are the only player routes), and
the bracket advances **only** when an admin clicks "Report ⟨player⟩ wins" in the admin
panel. The V1 spec's intent was that players find their opponent on the bracket, play a
normal match through some other surface (private room / friend challenge), and an admin
records the result by hand.

In practice this means:

- A player who has joined a running Cup has **no way to start their match** from the app.
- Nothing tells a player they are up, or who against.
- Every round requires a human operator, so a Cup cannot run unattended.

## Goal

A player in a running Cup sees their current match, presses **Ready**, and — once their
opponent does the same — is dropped straight onto the board. When the game finishes, the
bracket advances by itself. An admin never has to touch a normally-progressing Cup.

The existing admin Report control stays, unchanged, as the manual override.

---

## Owner decisions (2026-08-03)

| Question | Decision |
| --- | --- |
| One player readies, the other never shows | **Ready deadline → auto-forfeit.** The first Ready arms a per-tournament countdown; when it expires the absent player forfeits and the waiting player advances. |
| A tournament match ends in a draw | **Auto-replay.** The draw settles normally, the slot returns to `ready`, both players ready up again. |
| Stakes on a tournament match | **No ladder impact; normal per-win gold.** No schema migration, and tournament games inherit anti-cheat analysis. **Implementation note:** `Tournament.matchMode` (`MatchMode`, default `CASUAL`, admin-settable `CASUAL`/`RANKED`) already exists from the original tournaments migration and is read by nothing today — it was reserved for exactly this. Auto-start uses it. `CASUAL` delivers the chosen stakes exactly (no trophies, 25 gold/win, anti-cheat covered by `settleMatch`'s `RANKED\|CASUAL\|PRIVATE` filter); an admin who selects `RANKED` opts that Cup into trophy movement knowingly. |

---

## Architecture

### The flow

```
slot status flips to "ready"  (both competitors known — existing bracket logic)
        │
        ├─ both players' tournament page shows a "Your Match" card
        │
        ├─ player A presses Ready  ──►  redReadyAt set, readyDeadlineAt armed (+readyWindowSec)
        │                               no-show job scheduled at the deadline
        │
        ├─ player B presses Ready  ──►  blueReadyAt set
        │                               ▼
        │                         AUTO-START: create Match (PRIVATE), claim it onto the
        │                         slot, createLiveMatch(), push both players onto the board
        │
        ├─ ...normal match play (moves, chat, resign, draw offers, abandon-forfeit)...
        │
        └─ settleMatch()  ──►  onMatchEnd hook  ──►  AUTO-ADVANCE
                                                     win  → reportResult(winnerEntryId)
                                                     draw → reset slot, replay
```

### Why the DB and not Redis

Private rooms keep lobby state in Redis because a lobby is genuinely ephemeral — it dies
with its host. Ready-check state is not: it must survive a server restart mid-round, and
the no-show sweeper has to *query* for expired deadlines. So readiness lives in Postgres
on the row it describes.

Redis is still used for the *timer* (the existing at-most-once job queue) purely for
snappy firing; the DB row remains the source of truth and a sweeper is the backstop.

---

## Schema changes

```prisma
model Tournament {
  // ...existing fields...

  /// Seconds a player has to press Ready once their OPPONENT has readied, before
  /// forfeiting the slot. Armed by the first Ready on each slot; see
  /// TournamentMatch.readyDeadlineAt. Admin-editable while DRAFT like every other
  /// tournament setting. 600 (10 min) is the default.
  readyWindowSec Int @default(600)
}

model TournamentMatch {
  // ...existing fields...

  /// Ready-check (V1.5). Set when that side's player presses Ready. When BOTH are
  /// non-null the server auto-starts the match (creates a Match + claims matchId).
  /// Cleared on a draw replay so the slot can be readied again. There is no
  /// "un-ready" — Ready is a commitment (see "Why no un-ready" below).
  redReadyAt      DateTime?
  blueReadyAt     DateTime?

  /// Armed by the FIRST Ready on this slot (now + Tournament.readyWindowSec).
  /// Once armed it is never disarmed except by the match starting or a draw
  /// replay resetting the slot. At expiry, the side that readied wins by no-show
  /// forfeit. Indexed for the sweeper's range scan.
  readyDeadlineAt DateTime?

  @@index([readyDeadlineAt])
}
```

`matchId` (already present, `@unique`) is what the auto-start claims. Nothing else in the
schema changes.

**Migration:** additive only — three nullable columns, one defaulted int, one index. No
backfill needed; existing rows read as "nobody readied yet", which is correct.

### Why no un-ready

An un-ready that *disarmed* the deadline would let a player stall a bracket indefinitely
(ready, wait for the opponent to arrive, un-ready, repeat). An un-ready that left the
deadline armed creates a reachable dead end: both players un-ready, the deadline expires
with *nobody* ready, and there is no fair automatic winner. Making Ready a commitment
removes the whole branch. The UI reflects this: the button becomes a non-interactive
"Ready ✓ — waiting for opponent".

---

## Server components

### 1. `realtime/tournament-live.ts` (new)

Owns everything about a *live* tournament match. Split out from `tournaments-core.ts`
deliberately: that module owns money and bracket invariants and is already ~1250 lines;
this one owns socket handoff and match lifecycle and has no business touching gold.

Exports:

| Function | Purpose |
| --- | --- |
| `registerTournamentLive(io, socket)` | Wires the `tournament:ready` handler. Called from `realtime/index.ts` alongside `registerRooms`. |
| `markReady(io, tmId, userId)` | The guarded ready transition + auto-start. Exported for direct testing. |
| `handleTournamentNoShow(io, payload)` | Job handler for the deadline. |
| `sweepTournamentReadyChecks(io)` | Periodic backstop reconciler (both failure modes below). |
| `myTournamentMatch(tournamentId, userId)` | Builds the `myMatch` payload; reused by the REST route and by every broadcast. |

Registers an `onMatchEnd` hook at module load (same pattern as `rooms.ts:85`) for
auto-advance.

### 2. Ready → auto-start

`markReady` validation order (each an explicit error code, mirroring the existing
`err.*` conventions):

1. Slot exists and belongs to a `RUNNING` tournament — else `BAD_STATE`.
2. Slot `status === "ready"` — else `SLOT_NOT_READY` / `SLOT_DONE`.
3. `matchId == null` — else `ALREADY_STARTED` (the match is already live; the client
   should be resyncing into it, not readying).
4. The caller is the user behind `redEntryId` or `blueEntryId` — else `NOT_A_PARTICIPANT`.

Then, in one transaction:

- Set this side's `readyAt` (idempotent — pressing Ready twice is a no-op).
- If `readyDeadlineAt` is null, arm it to `now + readyWindowSec` and schedule a
  `tournament-noshow` job keyed `tmId`.
- If **both** sides are now ready, auto-start.

**Auto-start ordering (race-safe).** `matchId` is a FK, so the row must exist before it
can be claimed. Therefore:

1. `prisma.match.create({ mode: tournament.matchMode, redId, blueId, settings: DEFAULT_SETTINGS, moves: [] })`
2. `prisma.tournamentMatch.updateMany({ where: { id: tmId, matchId: null }, data: { matchId } })`
3. If `count === 0` we lost the race — **delete the Match row we just created** and return.
   The winner's match is the real one. Match rows are cheap and this race requires two
   simultaneous second-readies on the same slot.
4. `cancelJob("tournament-noshow", tmId)` and clear `readyDeadlineAt`.
5. `createLiveMatch(matchId, redUserId, blueUserId, tournament.matchMode, settings)` — **awaited**,
   for the same reason `rooms.ts:609` awaits it: not awaiting races the first
   `match:move` ahead of the Redis write and yields `no-such-match`.
6. Join both players' sockets to the match room via their `presence:<userId>` rooms, then
   emit `EV.tournamentStart {tournamentId, tmId, matchId, yourColor}` to each.

Colour assignment: `redEntryId`'s user plays red, `blueEntryId`'s plays blue. The bracket
already fixes those sides, so seeding decides colour — deterministic and explainable.

### 3. Auto-advance on settlement

The `onMatchEnd` hook receives a `matchId`:

1. `tournamentMatch.findUnique({ where: { matchId } })` — O(1) on the existing unique
   index. `null` ⇒ an ordinary match, no-op. **This is the hot path for every match in
   the game, so it must stay a single indexed lookup.**
2. Load the settled `Match` to read `winner` (`"red" | "blue" | "draw"`).
3. **Draw** → clear `matchId`, `redReadyAt`, `blueReadyAt`, `readyDeadlineAt`. The slot is
   `ready` again and both players must ready up for the replay. (`matchId` is `@unique`,
   so it *must* be cleared before a second match can be claimed; the drawn `Match` row
   itself stays in history.)
4. **Win** → map the winning colour to its `TournamentEntry` id and call the existing
   `reportResult(prisma, tournamentId, tmId, winnerEntryId, { matchId, reason, actorId })`.

`reportResult` is reused verbatim. Every bracket invariant — parent-slot filling, loser
elimination, double-elim drops to the losers bracket, grand-final reset, progressive Swiss
round generation — keeps working because none of it changes.

`actorId` is the string `"system"`. `AuditLog.actorId` is a plain `String` with no FK to
`User`, so a sentinel is safe and keeps auto-advances visible in the audit trail
alongside admin reports.

**Hook safety.** `runMatchEndHooks` is synchronous and swallows throws, so the hook fires
and forgets an async task. A crash between settlement and advance would strand the slot —
covered by the reconciler below.

### 4. Failure backstops

Both live in `sweepTournamentReadyChecks(io)`, called on a 60s interval from
`apps/server/src/index.ts` next to the existing `sweepAbandonedMatches` tick.

**(a) No-show forfeit.** Slots where `readyDeadlineAt < now`, `matchId == null`,
`status === "ready"`, and exactly one of `redReadyAt`/`blueReadyAt` is set → the side that
readied wins by `reportResult(..., reason: "no-show forfeit")`. This is also what the
`tournament-noshow` job handler does; the job makes it prompt, the sweep makes it certain
(the job queue is at-most-once by design — see `realtime/jobs.ts`).

The "neither side ready" case is unreachable: the deadline only exists because somebody
readied, and there is no un-ready.

**(b) Settled-but-unadvanced reconciliation.** Slots with `status !== "done"` whose linked
`Match.endedAt` is non-null → re-run the advance. Idempotent: `reportResult` throws
`SLOT_DONE` on an already-resolved slot, which the sweeper swallows. Same self-healing
philosophy as `recoverMissingSwissRounds`.

### 5. Player-facing API

`GET /api/tournaments/:id` gains `myMatch` — `null` unless the caller has a live slot:

```ts
myMatch: {
  tmId: string;
  round: number;
  bracket: "W" | "L" | "GF";
  roundLabel: string;              // "Round 2" | "Final" | "Losers Round 1" | ...
  opponent: { userId, username, tag, avatarUrl, frameId } | null;  // null = bye/TBD
  iAmReady: boolean;
  opponentReady: boolean;
  deadlineAt: string | null;       // ISO; drives the client countdown
  matchId: string | null;          // non-null ⇒ already live, client should resync in
  yourColor: "red" | "blue";
} | null
```

This makes the page correct on a cold load with no socket. The socket only makes it live.

New events in `packages/shared/src/events.ts`:

| Event | Direction | Payload |
| --- | --- | --- |
| `tournament:ready` | client → server | `{ tmId }` |
| `tournament:matchState` | server → both players (`presence:<uid>`) | the `myMatch` shape above |
| `tournament:start` | server → each player | `{ tournamentId, tmId, matchId, yourColor }` |

`tournament:ready` is rate-limited with the existing `allow(socket, ...)` helper. Guests
cannot join tournaments at all, so no extra guest gate is needed beyond the participant
check.

---

## Clients

### Web (`apps/web`)

- **`TournamentDetailPage`** gains a "Your Match" card above Entries, rendered when
  `myMatch != null`: round label, opponent avatar/name, both ready states, a live
  countdown once `deadlineAt` is set, and the Ready button.
- **`tournamentStore`** (new, thin — mirrors `roomStore`'s `EV.roomStart` handler):
  listens for `tournament:matchState` to refresh the card and `tournament:start` to hand
  the match to `onlineStore` and navigate to `/play/online`.
- If `myMatch.matchId` is already set on load (player refreshed mid-game), the card shows
  "Match in progress — Rejoin" and resyncs into it.

### Android (`apps/android`)

- **`TournamentDetailScreen`** gains the same card, following the existing screen's
  composable conventions.
- **`TournamentsRepository`** gains the socket listeners; on `tournament:start` it calls
  the same `MatchRepository` entry path `RoomRepository` uses for `EV.roomStart`, and
  `AppNavHost` navigates to `AppDestinations.onlineMatch("PRIVATE")`.

### Bracket rendering redesign (web + Android)

Owner request 2026-08-03, with a Liquipedia-style reference: the bracket should read like a
real esports bracket instead of the current flat round columns.

**Required elements**

1. **Named round headers** — a labeled bar above each column, not a bare "Round 3".
   Derived from bracket + position, never hardcoded per tournament:
   - Single-elim / winners: last round `Final`, last−1 `Semifinals`, last−2 `Quarterfinals`,
     earlier `Round N`. In `DOUBLE_ELIM` these are prefixed `Upper Bracket …` (and
     `UB Quarterfinals` where the short form reads better).
   - Losers: `Lower Bracket Round 1`, `… Quarterfinal`, `… Semifinal`, `Lower Bracket Final`
     by distance from the end of the L structure.
   - Grand final: `Grand Final`, and `Grand Final (reset)` for round 202.
2. **Two-row match cards** — one row per competitor: avatar, username, and a right-hand
   result marker. The winner's row is emphasized (brighter text, subtle win tint); the
   loser's row is dimmed. `TBD` for an unfilled feeder side, `BYE` for a bye.
   **No score column.** The reference shows best-of-N series scores; our slots are a
   single game (replayed only on a draw), so a score would be fabricated data. The winner
   row gets a check marker instead.

   **BYE vs TBD.** A bye is a slot that RESOLVED with one competitor — the server seeds
   those already `status:"done"` with a `winnerEntryId`. An empty side on a slot that is
   still `pending`/`ready` is *not* a bye; it is waiting on the match that feeds it and
   must read `TBD`. Test for the event (`done && one side null`), never for the shape
   (`one side null`), which is true of both.
3. **Connector lines** — each match elbows out to its parent: horizontal stub, vertical
   run to the parent's centre line, horizontal into the parent.
4. **Sections** — `DOUBLE_ELIM` renders Upper, Lower and Grand Final as separate labeled
   bands (as the reference does), reusing the same column renderer.
5. **Your own slot is highlighted** — a gold ring on the match card the signed-in player
   is in, tying the bracket to the "Your Match" card above it.

**Layout algorithm** (shared by both clients, so they agree visually)

Positions are computed, not left to CSS flow, because the losers bracket's round sizes do
not simply halve:

```
y(round 1, i)  = i * (CARD_H + GAP)
y(round r, i)  = midpoint of the y-centres of the matches in round r-1 that feed it, where
                 feeders are determined by the count ratio:
                   prevCount == 2 * thisCount  ->  feeders are 2i and 2i+1   (elimination halving)
                   prevCount == thisCount      ->  feeder is i               (L-bracket drop/consolidation)
```

That rule covers every structure `losersBracketStructure` can produce (counts either halve
or stay equal between adjacent rounds) as well as every winners bracket, so one function
serves all three sections.

- **Web:** absolutely-positioned cards inside a relatively-positioned section, with the
  connectors drawn as an SVG polyline layer underneath. Each section scrolls horizontally
  on narrow viewports; the page body never scrolls sideways.
- **Android:** the same computed positions in a horizontally scrollable Compose layout,
  connectors drawn with `Canvas`. Card sizing follows the existing screen's spacing tokens.

### Admin (`apps/admin`)

The bracket drawer's slot rows show ready state ("waiting on ⟨player⟩", "starts when both
ready", "live"). The Report buttons are unchanged and remain the override for any slot,
including one that is mid-match.

---

## Testing

**Server** (`apps/server/test/tournament-ready-check.test.ts`, vitest + the existing
`helpers.ts` harness):

- Ready guards: non-participant, slot not `ready`, tournament not `RUNNING`, slot already
  started.
- Ready is idempotent (pressing twice does not double-arm the deadline).
- First ready arms `readyDeadlineAt`; second ready creates exactly one `Match`, claims it,
  and clears the deadline.
- Concurrent second-readies create exactly one live match (the loser's `Match` row is
  deleted, `matchId` is the winner's).
- Settlement with a winner advances the slot and fills the parent slot.
- Settlement as a draw resets the slot to replayable (`matchId` null, both `readyAt` null).
- No-show sweep forfeits to the player who readied and advances the bracket.
- Reconciliation sweep advances a slot whose match settled while the hook was lost.
- Full-round integration: a 4-player single-elim Cup driven entirely by ready-checks and
  settlements reaches a champion with **zero** admin report calls.

**Android:** state-mapping unit tests in the existing `TournamentDisplayTest` style
(ready/waiting/countdown/live label selection).

**Verification before done:** server `pnpm test` + `tsc`, web `tsc` + build, Android
`compileDebugKotlin` + `testDebugUnitTest`.

---

## Boundaries

- **Damath is untouched.** Owner directive 2026-07-12: never expand Damath. No
  `damath-*` file changes.
- **No money-path changes.** `joinTournament`, `completeTournament`, `cancelTournament`
  and the ledger are not modified. Auto-advance calls the existing `reportResult`, which
  already owns the bracket invariants and writes no gold.
- **The DOUBLE_ELIM power-of-two start gate stays.** Unrelated to this work and still
  load-bearing.
- **Admin report stays.** This feature adds an automatic path; it does not remove the
  manual one.

## Out of scope (future)

- Spectating a tournament match by bracket slot.
- Auto-scheduling round start times (`startsAt` is still descriptive).
- Push notification when your slot goes `ready` (the card + countdown are in-app only).
- Best-of-N series per slot; every slot is a single game, replayed only on a draw.
