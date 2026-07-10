# Tournaments Subsystem — Design

**Date:** 2026-07-10
**Status:** Design — implementation-ready pending user sign-off → plan.
**Context:** FilipinoDama Royal. The admin console's "Tournaments" nav item is a Phase-2 stub
today (`apps/admin/src/App.tsx:42,189` → `<Phase2 title="Tournaments" note="Needs a Tournament
model." />`). This is a **new, from-scratch subsystem** spanning schema, admin API, admin page,
and player-facing UI. It is the largest of the three remaining admin pages, so scope is split
into a **shippable, admin-managed V1** and an explicit **V1.5/V2 backlog**.

> **North star (V1: admin-managed):** a tournament match **IS** a `Match` row played through the
> normal existing match flow (`apps/server/src/realtime/match.ts`) — no second game engine, no
> second settlement path, no second chat. A `TournamentMatch` join row links the tournament
> bracket slot to a real `Match`. In V1 the **admin reports each match result and advances the
> bracket** (`POST /admin/tournaments/:id/matches/:tmId/report`) — the bracket does **not**
> auto-advance off match settlement, and there is **no new socket handoff**. This makes the
> entire V1 flow server-testable via `app.inject()` with zero dependency on socket/live-match
> behavior. Auto-advance-on-settlement and the player-facing "Play your match" socket handoff are
> **deferred to V1.5** (see below). Entry fees, refunds, and prizes move **GOLD only**, through
> `applyLedger` (`apps/server/src/economy/ledger.ts:51`), audited and idempotent.

---

## Goal

Let an ECONOMY admin create, schedule, and run **single-elimination gold-buy-in tournaments**,
seed the bracket, and **report each match result** to advance it; let players **join** (paying
`entryFeeGold` via the ledger) and **play their tournament match** through the normal existing
match flow; and pay **gold prizes** to the champion and runner-up at completion — every mutation
audited, every gold movement idempotent, no real money. The fancy player-facing bracket UI and
the auto-advance-on-settlement socket hook ship in V1.5 (see Scope).

Match the approved `secTournaments` design in `handoffv2/FilipinoDama Admin.dc.html`
(lines 701–766): a 4-stat header (Live now / Upcoming / Players registered / Gold prize pool),
a "+ New tournament" create/edit form (name, format, bracket-size cap, entry-fee currency+amount,
prize-pool currency+amount, min-trophies, starts), and a tournaments table
(Tournament · Status · Format · Entry · Prize pool · Players · Starts · Actions[Edit/Cancel]).

---

## Scope

**Scope decision: ship admin-managed V1.** V1 ships the full REAL backend — models + migration,
gold entry-fee/prize/refund flows via the ledger (audited, idempotent), bracket seeding, and
admin-reported advance — plus the admin API and admin page (list + create + a **simple**
bracket/slot resolve view). Players **join** (pay `entryFeeGold` via the ledger) and **play**
their tournament matches through the **existing** match flow. What's deferred to V1.5 is
specifically the automation and the player-facing polish layered on top: auto-advance off match
settlement, the fancy player-facing bracket rendering UI, and the live-match "Play your match"
socket handoff. In V1, **the admin drives the bracket** — the admin reports/records each match
result and advances the bracket via a report-result endpoint. This makes the whole V1 flow
server-testable end-to-end (no untested socket handoff in the critical path) and removes the
crux risk of getting the lazy-match-creation + `matchResync` handoff right on the first try.

### In (V1 — ship now, admin-managed)

- **One format: single-elimination bracket.** (Justification below.)
- **Gold-only** entry fees and prizes. The mockup's currency dropdowns are **forced to Gold**
  (the Diamonds option is **removed/disabled by the implementer** — real-money & diamond top-up
  are disabled for legal compliance; see MEMORY `gold-only-economy`). Prize pool is expressed in
  gold.
- **Data model + migration**: `Tournament`, `TournamentEntry`, `TournamentMatch` + the two enums,
  one additive Prisma migration (see "Data model" below).
- **Gold ledger flows**: entry-fee charge on join, refund on cancel/leave, prize payout on
  complete — all via `applyLedger`/`applyLedgerTx`, audited, idempotent (see "Economy / ledger
  flows" below).
- **Bracket seeding** on Start (byes, standard seed pairing, the full slot tree created up
  front) — a pure, unit-testable function.
- **Admin-reported advance**: the admin reports each match's winner via
  `POST /admin/tournaments/:id/matches/:tmId/report`, which resolves the slot and fills the
  parent slot — **this is the only way the bracket advances in V1** (see "Report result +
  advance" under "Bracket lifecycle" below).
- **Admin API**: create, open, start, report-result, complete, cancel — all `requireAdmin
  ("ECONOMY")`, all audited.
- **Admin page**: tournaments list + create/edit form + a **simple** bracket/slot view (rounds,
  entrants, resolved winner, a "Report result" control per unresolved slot). No fancy rendering —
  a plain rounds-as-columns layout is sufficient for V1.
- **Player lifecycle**: browse open tournaments; **join** (pays `entryFeeGold` atomically via
  ledger, with trophy-gate + capacity + dedupe checks); leave while `OPEN` (refund). Players
  **play** their tournament matches through the **existing, normal match flow** exactly as any
  other match — there is no new tournament-specific match-launch UI or socket path in V1 (see
  "Deferred to V1.5: lazy match creation + live handoff" below). The admin is responsible for
  recording who won each tournament match.

### Deferred to V1.5 (the automation + player-facing polish)

- **Auto-advance on `Match` settlement.** A `settleMatch` post-settlement hook that resolves a
  `TournamentMatch` slot automatically when its linked `Match` settles, so the admin doesn't have
  to manually report results for matches that were actually played in-app. V1 does not have this
  hook — **the admin always reports the result**, even for matches that were played through the
  normal match flow. This is the single biggest scope cut: it removes the need to wire a new
  "lazy-create + hand off into the live match" path before shipping.
- **The player-facing Cups list + interactive bracket rendering UI** (`apps/web/src/features/
  tournaments/`). V1 players can join and see a joined/eliminated status, but the rich
  round-by-round bracket visualization with "your path highlighted" is a V1.5 web feature.
- **The live-match "Play your match" socket handoff** — lazily creating a `Match` from a bracket
  slot and routing the player straight into the live match screen via `matchResync`. Deferred
  along with auto-advance since neither is load-bearing for V1 (players can already start/join
  matches through the existing match flow independent of the bracket). See "Deferred to V1.5:
  lazy match creation + live handoff" under "Bracket lifecycle" below for the exact mechanism
  reserved for V1.5.
- **Double-elimination, Swiss, round-robin.** The mockup's format dropdown lists all four; V1
  ships **Single elimination only** and the other options are shown **disabled** with a "V2"
  hint. `Tournament.format` is an enum with all four values reserved so no migration is needed
  to add them later, but only `SINGLE_ELIM` is accepted by the create/start endpoints in V1.
- **Auto-scheduling / auto-start** (a cron that opens registration and starts at `startsAt`).
  V1 is **admin-triggered** (admin clicks Open / Start). `startsAt` is descriptive in V1.
- **Auto-matchmaking of tournament matches** (server auto-creating & auto-launching every
  round's matches, byes, walkovers on a timer) and **auto-forfeit for abandoned tournament
  matches**. V1 has neither: if a tournament match never completes, the admin uses `/report` to
  set the winner manually (see "Abandoned-before-start tournament matches" below).
- **Live bracket push** over sockets. V1 bracket view **polls** (same as every other admin/web
  page today). A `tournament:*` socket channel is V1.5+.
- **Third-place match, seeding by trophies into a fixed bracket, re-buy / late registration,
  spectator brackets, guild tournaments.** All V2.

---

## Why single-elimination for V1 (design justification)

- **Correctness is trivial to reason about.** N registered players (padded to the next power of
  two with byes) → `N-1` matches total → `log2(N)` rounds → one champion. Each match has exactly
  one winner advancing to a deterministic parent slot. There is no lower bracket, no tiebreak
  math, no standings table — the entire tournament state is a binary tree of slots. This makes
  the advance logic a pure function and the prize payout a simple `placement` sort.
- **It maps 1:1 onto the existing Match model.** A bracket slot's game is a normal 1v1 `Match`
  in an existing `MatchMode`; the winner is already computed authoritatively by `settleMatch`.
  Double-elim needs loser routing; Swiss/RR need pairing algorithms and points — all net-new
  logic and net-new UI. Single-elim reuses everything.
- **It's the format the approved mockup defaults to** (`tfFormat` default `'Single elimination'`,
  html:1925) and the one the player "Cups" screen implies. Shipping it first delivers the visible
  product; the other three are additive later.

**Bracket sizing rule (V1).** On **Start**, let `n` = `min(registered entries, maxPlayers)` — the
`registeredCount` capacity guard (see "Capacity" under "Economy / ledger flows") should already
make `entries.length ≤ maxPlayers` an invariant, but Start clamps to `n` defensively rather than
trusting it blindly. Reject `n < 2`. The bracket size `B` = the smallest power of two `≥ n`
(capped at `maxPlayers`, itself a power of two ∈ {2,4,8,16,32,64,128,256}). The top `B - n` seeds
receive a **bye** in round 1 (auto-advanced, no match). Seeding is **by registration order** in V1
(deterministic, explained in-UI as "seeded by join order"); trophy-seeding is V2.

---

## Data model — 3 new models + 2 enums (one additive migration)

Additive only — no existing column changes (rule 4). New models: `Tournament`,
`TournamentEntry`, `TournamentMatch`. New enums: `TournamentFormat`, `TournamentStatus`.
`Match` gets **no** required column changes; the link lives on `TournamentMatch` (a `Match` may
exist with no tournament, exactly as today).

```prisma
enum TournamentFormat {
  SINGLE_ELIM      // V1
  DOUBLE_ELIM      // reserved — V2
  SWISS            // reserved — V2
  ROUND_ROBIN      // reserved — V2
}

enum TournamentStatus {
  DRAFT       // being edited; not visible to players
  OPEN        // registration open; players may join/leave
  RUNNING     // bracket seeded; matches being played
  COMPLETED   // finished; prizes paid
  CANCELLED   // called off; entry fees refunded
}

model Tournament {
  id            String           @id @default(cuid())
  name          String
  format        TournamentFormat @default(SINGLE_ELIM)
  status        TournamentStatus @default(DRAFT)

  // Economy — GOLD ONLY (rule 2). No currency column: it is always gold.
  entryFeeGold  Int              @default(0)   // 0 = free entry
  prizePoolGold Int              @default(0)    // total gold paid out across placements

  // Bracket sizing — must be a power of two in {2..256}; validated on write.
  maxPlayers      Int              @default(16)
  registeredCount Int              @default(0)   // serialized counter — the capacity guard
                                                   // (see "Join" below). Incremented/decremented
                                                   // inside the same $transaction as entry
                                                   // create/delete; NEVER derived from a plain
                                                   // COUNT(*) on TournamentEntry at request time.
  minTrophies     Int              @default(0)    // trophy gate to join (0 = open to all)
  matchMode       MatchMode        @default(CASUAL) // the MatchMode tournament games run as (see below)

  startsAt      DateTime?        // descriptive in V1 (admin-triggered start); scheduler is V2

  // Prize distribution — V1 pays ONLY the champion and runner-up (see "Prize payout
  // (V1: top-2 only, no ties)" below for why). JSON 2-tuple: [firstPrizeGold,
  // secondPrizeGold]. Validated at COMPLETE time: firstPrizeGold + secondPrizeGold
  // === prizePoolGold (else 400 PRIZE_SPLIT_MISMATCH). Placements 3+ are recorded on
  // TournamentEntry.placement for display but are NEVER paid in V1.
  prizeSplitGold Json           @default("[]")

  createdById   String
  createdBy     User             @relation("tournamentsCreated", fields: [createdById], references: [id], onDelete: Restrict)

  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt
  openedAt      DateTime?
  startedAt     DateTime?
  completedAt   DateTime?
  cancelledAt   DateTime?

  entries       TournamentEntry[]
  matches       TournamentMatch[]

  @@index([status, startsAt])
}

model TournamentEntry {
  id           String     @id @default(cuid())
  tournamentId String
  tournament   Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  userId       String
  user         User       @relation("tournamentEntries", fields: [userId], references: [id], onDelete: Cascade)

  seed         Int?       // 1..B, assigned at Start (null while OPEN)
  eliminated   Boolean    @default(false)
  placement    Int?       // final rank set at COMPLETE (1 = champion, 2 = runner-up, recorded
                           // for display beyond that). null = not yet placed / eliminated early.
                           // ONLY placement 1 and 2 are paid in V1 (see prize payout below).
  refunded     Boolean    @default(false) // entry fee refunded (cancel path). guards double-refund at app level too.
  joinedAt     DateTime   @default(now())

  @@unique([tournamentId, userId])   // one entry per player per tournament (dedupe)
  @@index([tournamentId, seed])
}

> **Entry lifecycle decision — HARD DELETE on leave (V1).** `POST /leave` deletes the
> `TournamentEntry` row (as already stated below), it does not soft-delete it. Rejoining after a
> leave creates a **brand-new** `TournamentEntry` with a new `id`. This is deliberate: every
> per-entry money movement (charge and refund — see "Economy / ledger flows" below) is keyed off
> `entry.id`, not `tournamentId`, specifically so a `join → leave → rejoin → cancel` sequence
> produces two *distinct* entries with two *distinct* idempotency keys — the leave-refund and the
> cancel-refund can never collide. The trade-off: a hard delete loses the row-level history of the
> player's first stint (no `leftAt` audit trail beyond the `AuditLog` row already written for
> `tournament.leave` — see Admin API's "every mutation writes an audit row", which for the player
> API means the player route also writes an `AuditLog` row on join/leave so the history survives
> at the audit layer even though the `TournamentEntry` row itself is gone). A soft-delete
> alternative (`leftAt DateTime?` + a partial/conditional unique on active entries only) would
> preserve the row, but V1 prefers the simpler hard-delete: it needs no partial-index migration,
> the plain `@@unique([tournamentId, userId])` above keeps working unmodified (a rejoin after
> leave is just a fresh insert), and the audit log already captures what a soft-delete's history
> would show. Revisit if a V1.5/V2 feature needs to query a player's full multi-stint history for
> one tournament.

model TournamentMatch {
  id           String     @id @default(cuid())
  tournamentId String
  tournament   Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade)

  round        Int        // 1 = first round; final round = log2(B)
  slot         Int        // 0-based position within the round (parent = slot >> 1 in round+1)

  // The two competitors for this slot. null = not yet determined (awaiting a
  // feeder result) OR a bye (one side null with the other present in round 1).
  redEntryId   String?
  redEntry     TournamentEntry? @relation("tmRed",  fields: [redEntryId],  references: [id], onDelete: SetNull)
  blueEntryId  String?
  blueEntry    TournamentEntry? @relation("tmBlue", fields: [blueEntryId], references: [id], onDelete: SetNull)

  // The real Match this slot was played as, if any. V1: players play through the
  // EXISTING normal match flow (unrelated to the bracket) and the admin reports the
  // result via /report — matchId is set by the admin's report call as an optional
  // reference/audit link, NOT created by a lazy "Play your match" socket handoff
  // (that mechanism is deferred to V1.5 — see "Deferred to V1.5: lazy match
  // creation + live handoff" below). null for byes or if the admin didn't link one.
  matchId      String?    @unique
  match        Match?     @relation(fields: [matchId], references: [id], onDelete: SetNull)

  winnerEntryId String?   // set when the slot resolves (from admin report/bye)
  status        String     @default("pending") // "pending" | "ready" | "done"
  resolvedAt    DateTime?

  @@unique([tournamentId, round, slot])
  @@index([tournamentId, round])
}
```

**`User` back-relations to add:** `tournamentsCreated Tournament[] @relation("tournamentsCreated")`,
`tournamentEntries TournamentEntry[] @relation("tournamentEntries")`.
**`Match` back-relation to add:** `tournamentMatch TournamentMatch? @relation`.

**Design decisions:**
- **No `currency` column** anywhere — gold is the only currency (rule 2). The mockup's currency
  dropdowns render Gold-only. This bakes the legal constraint into the schema.
- **`slot`/`round` binary-tree encoding** makes advance a pure function: a match at
  `(round r, slot s)` feeds `(round r+1, slot s >> 1)`, filling `redEntryId` if `s` is even else
  `blueEntryId`. No parent-pointer column needed.
- **`matchId` is nullable + `@unique`** — a slot may be resolved by a bye or by an admin report
  with no linked `Match`; when the admin links a played `Match` it points at exactly one row.
  `onDelete: SetNull` keeps the bracket if a `Match` row is ever purged. In V1 this is purely a
  reference for the admin's own bookkeeping — no code path creates a `Match` from this field.
- **`TournamentEntry.refunded`** + the ledger's idempotency index together make cancel-refund
  double-safe (belt and suspenders). Because refunds are now keyed off `entry.id` (see the entry
  lifecycle decision above), this flag only needs to dedupe *within* a single entry's lifetime —
  it can never collide with a different entry's refund the way a `tournamentId`-keyed ref could.
- **`matchMode`** lets the admin choose whether tournament games count as CASUAL (default) or
  RANKED. **V1 recommendation: `CASUAL`** so tournament play doesn't move ladder trophies and
  can't be farmed; the field exists so this is a per-tournament admin choice, not hardcoded.
  Tournament `Match` rows still bank their normal `goldPerWin` on settlement (existing behavior),
  which is intended and separate from the tournament prize pool.

---

## Economy / ledger flows (GOLD only, audited, idempotent)

All three money movements go through `applyLedger`/`applyLedgerTx(tx, { userId, currency:"GOLD",
amount, reason, refType:"tournament", refId })` (`economy/ledger.ts:21,51`). The `LedgerEntry`
unique index `@@unique([userId, currency, reason, refType, refId])` (schema.prisma:134) makes each
**idempotent** by `(reason, refType, refId)` — **but only when the caller catches P2002.**
`applyLedger` (the non-tx wrapper, `ledger.ts:51-69`) already swallows P2002 as an already-applied
no-op, **but `applyLedgerTx` (the in-transaction primitive, `ledger.ts:21-43`) does NOT** — it
lets P2002 propagate to the caller's `$transaction`, which the caller must catch itself. Every
flow below that calls `applyLedgerTx` inside its own `$transaction` is responsible for its own
P2002 mapping (see "Join" below for the concrete pattern, mirroring `seasons.ts` /
`payments.ts`).

**Keying — `refId` is `entry.id`, NOT `tournamentId`.** Every per-entry money movement (debit and
refund) is keyed off the `TournamentEntry.id` that movement belongs to, not the tournament. This
is required because leave is a **hard delete** (see the entry lifecycle decision above): a
`join → leave → rejoin → cancel` sequence produces two different `TournamentEntry` rows, so
keying off `tournamentId` alone would put the join-debit, the leave-refund, and the (later)
cancel-refund for the *second* entry all in a search space that collides with the first entry's
movements — the leave-refund and the cancel-refund would land on the **same** idempotency slot
(`reason=tournament-refund, refType=tournament, refId=tournamentId`) and the second one would be
silently swallowed as "already applied", permanently losing the player one entry fee. Keying off
`entry.id` makes each entry's fee+refund pair distinct no matter how many times the same user
joins/leaves/rejoins the same tournament. Prize payout is keyed the same way for consistency (a
champion only ever has one entry at completion time, so this is not itself a race, but it keeps
the whole table on one rule).

| Movement | When | `amount` | `reason` | `refType` | `refId` | Idempotency key |
|---|---|---|---|---|---|---|
| **Entry fee (spend)** | player joins | `-entryFeeGold` | `tournament-entry` | `tournament` | `entry.id` | one debit per entry |
| **Refund (grant)** | player leaves (OPEN) or tournament cancelled | `+entryFeeGold` | `tournament-refund` | `tournament` | `entry.id` | one refund per entry |
| **Prize (grant)** | tournament completed | `+prizeSplitGold[0]` to the champion, `+prizeSplitGold[1]` to the runner-up (only) | `tournament-prize` | `tournament` | `entry.id` | one prize per entry |

Because `refId = entry.id` and `reason` differs per movement, a given entry can have at most one
debit, one refund, and one prize — retries/double-clicks/re-runs of complete or cancel are safe
no-ops **and** a leave-then-rejoin can never cannibalize a later cancel's refund slot, because the
rejoin is a new entry with a new `id`. (Entry fee `0` is a no-op: skip the ledger call when
`entryFeeGold === 0`.)

- **Join (spend) — must create the entry FIRST, then charge, with explicit P2002 mapping.**
  Runs **inside a `$transaction`**, in this order: (1) `tx.tournamentEntry.create(...)` — the
  `@@unique([tournamentId, userId])` constraint is the concurrency guard for a double-join, and
  creating the row first means its `id` exists before the ledger call needs it as `refId`; (2)
  the capacity guard (`registeredCount` conditional `updateMany`, see "Capacity" below); (3)
  `applyLedgerTx(tx, { ..., refId: entry.id })` to charge `entryFeeGold`. The whole `$transaction`
  call is wrapped in a `try/catch`:
  - `P2002` (from the entry create — a concurrent duplicate join) → `err.conflict("ALREADY_JOINED")`
    (409). This is the fix: **`applyLedgerTx` itself does not swallow P2002**, so without this
    explicit catch a concurrent double-join throws a raw, unmapped 500 instead of the documented
    409 — the spec's earlier claim that the join transaction was idempotent "for free" via
    `applyLedger`'s P2002 handling was wrong, because join uses `applyLedgerTx` (the tx-scoped
    primitive), not `applyLedger`.
  - `INSUFFICIENT_GOLD` (thrown by `applyLedgerTx` when the balance would go negative) →
    `err.badRequest("INSUFFICIENT_GOLD")` (400).
  - `TOURNAMENT_FULL` (from the capacity guard) → `err.conflict("TOURNAMENT_FULL")` (409).
  A fast-path pre-read (existing-entry check + registered-count check) is kept before opening the
  transaction purely as a cheap short-circuit for the common sequential case — it is **not** the
  concurrency guard; the `@@unique` and the conditional `updateMany` inside the transaction are.
- **Refund (leave or cancel)** — leave (single entry, while `OPEN`) and cancel (all paid,
  un-refunded entries) both call `applyLedgerTx(tx, { ..., refId: entry.id })` per entry, inside
  the same `$transaction` that deletes the entry (leave) or flips it `refunded=true` (cancel).
  Because the key is `entry.id`, leave's refund and a later cancel's refund (against a *different*
  entry created by a rejoin) never share a slot — see the keying note above. Cancel additionally
  guards on `refunded=false` at the app level (belt-and-suspenders alongside the ledger index).
- **Prize (complete) — V1 pays only placements 1 and 2, no ties.** `prizeSplitGold` in V1 is a
  fixed 2-tuple `[firstPrizeGold, secondPrizeGold]`. Complete grants `firstPrizeGold` to the
  entry at `placement=1` (champion) and `secondPrizeGold` to the entry at `placement=2`
  (runner-up) — skip a grant if its amount is `0`; `refId` is each winner's `entry.id`. Validated
  up front: `firstPrizeGold + secondPrizeGold === prizePoolGold` (else 400
  `PRIZE_SPLIT_MISMATCH`) so the console can't pay out more or less than the declared pool.
  Single-elimination always produces **exactly one** champion and **exactly one** runner-up, so
  this pair is never ambiguous or shared — see "Prize payout (V1: top-2 only, no ties)" below for
  why placements 3+ are recorded but not paid.

**Capacity — the `registeredCount` serialization guard.** `@@unique([tournamentId, userId])`
only stops the *same* user joining twice; it does nothing to cap the number of *distinct* users,
and under Read Committed a plain "COUNT(*) entries, then INSERT if below cap" is **not**
serialized — two concurrent joins can both read `count < maxPlayers` and both insert, overfilling
the bracket. V1 closes this with a real counter column and a conditional update as the
serialization point, inside the same join `$transaction` from the "Join" bullet above:

```
const claim = await tx.tournament.updateMany({
  where: { id: tournamentId, status: "OPEN", registeredCount: { lt: maxPlayers } },
  data: { registeredCount: { increment: 1 } },
});
if (claim.count === 0) throw new Error("TOURNAMENT_FULL"); // mapped to 409 in the catch above
```

This `updateMany` is atomic at the row level — only one of any number of concurrent joins can
increment past the last remaining seat, because each is a single UPDATE that re-checks
`registeredCount < maxPlayers` at write time, not at an earlier read time. `registeredCount` is
**decremented** on both leave (single entry) and cancel (per refunded entry) in their own
`$transaction`s, so it always reflects the live entry count. **Start** additionally clamps against
a slipped overfill defensively: seed with `n = min(entries.length, maxPlayers)` (or reject Start
outright with 409 if `entries.length > maxPlayers`, which should be unreachable given the guard
above, but costs nothing to check) so a bug or manual DB edit can never orphan a seed beyond the
bracket size.

> **Anti-fabrication (rule 1):** every gold number a page shows — prize pool, entry fee, "gold
> paid" — is a real column (`prizePoolGold`, `entryFeeGold`) or a real `LedgerEntry` aggregate.
> No invented metrics. The header's "Gold prize pool (scheduled)" stat is `SUM(prizePoolGold)`
> over `OPEN`+`RUNNING` tournaments (mirrors the mockup's `tStatPrize`, html:1923).

---

## Bracket lifecycle (the core state machine)

```
DRAFT ──open──▶ OPEN ──start──▶ RUNNING ──complete──▶ COMPLETED
  │              │                 │
  └── (edit) ────┘                 └──────────── cancel ──────────▶ CANCELLED
     cancel from DRAFT/OPEN/RUNNING ─────────────────────────────▶ CANCELLED (refunds)
```

**Start (seed the bracket) — the interesting bit.** In one `$transaction`:
1. Load entries ordered by `joinedAt asc`; assign `seed = 1..n`.
2. `B` = smallest power of two `≥ n`, `B ≤ maxPlayers`; `rounds = log2(B)`.
3. Create round-1 `TournamentMatch` rows for `B/2` slots using **standard seed pairing**
   (seed 1 vs seed B, 2 vs B-1, …) so top seeds meet late. Any pairing where one side would be
   seed `> n` is a **bye**: fill only the present side, set `winnerEntryId = presentEntryId`,
   `status="done"`, and immediately advance that entry into round 2's parent slot.
4. Create the remaining empty `TournamentMatch` rows for rounds `2..rounds` (all
   `status="pending"`, competitors null) so the tree exists up front and advance just fills slots.
5. Set `Tournament.status = RUNNING`, `startedAt = now()`. Audit `tournament.start`.

**Play a match (V1: the existing, normal match flow — no new handoff).** Once a slot is `ready`
(both competitors filled), the two players play their match through the **existing, unmodified**
match flow — matchmaking, a private/friendly match invite, or however two players already start
a `Match` on the platform today. Nothing about `TournamentMatch` changes how a `Match` gets
created or played in V1. There is **no** `POST /api/tournaments/:id/matches/:tmId/play` endpoint,
no lazy `Match` creation off a bracket slot, and no new socket handoff in V1 — see "Deferred to
V1.5: lazy match creation + live handoff" below for the mechanism reserved for later.

**Report result + advance (V1: the only way the bracket advances).** The admin reports the
winner of a `ready` slot via `POST /admin/tournaments/:id/matches/
:tmId/report { winnerEntryId, matchId?, reason }` (`matchId` optional — a reference link to the
`Match` that was actually played, purely for the admin's own audit trail; not required, not
validated against live-match state). `resolveTournamentSlot(tx, tmId, winnerEntryId)`:
1. In a `$transaction`, `updateMany({ where:{ id:tmId, status:"ready" }, data:{
   winnerEntryId, matchId, status:"done", resolvedAt } })`. The guard is intentionally
   `status:"ready"`, **not** `status:{ not:"done" }` — a slot only becomes reportable once both
   feeders have filled it (`redEntryId` and `blueEntryId` both set); a `pending` slot (one or both
   sides still null, still waiting on an earlier round) must not resolve just because it isn't yet
   `done`. This atomic guard is idempotent and prevents double-advance; two admins reporting the
   same slot race safely — the loser sees `count === 0`.
2. If `count === 0`, re-read the slot to disambiguate: if `status === "done"` → 409 `SLOT_DONE`
   (already resolved — a race or a retry); if `status === "pending"` → 409 `SLOT_NOT_READY` (one
   or both competitors aren't filled in yet — nothing to report). Byes never hit this path: they
   auto-resolve at Start (step 3 below) and are never reported through `/report`, so a
   `ready`-only guard rejects nothing legitimate. The abandoned-match flow (no `Match` ever
   played) is unaffected — those slots reach `ready` normally once both feeders resolve; there's
   just no linked `matchId`.
3. Mark the losing entry `eliminated = true`.
4. Compute the parent slot `(round+1, slot>>1)`; fill `redEntryId` (even slot) or `blueEntryId`
   (odd) with the winner entry. If the parent now has both sides → `status="ready"`.
5. If this was the **final round** → the winner is the champion; **do not auto-complete** (payout
   is an explicit admin action so the split can be reviewed) — the final slot is left `done` with
   its winner; the admin's Complete reads it.

Because the admin always calls `/report` (never an automatic hook), draws, disputed results, and
matches that were never actually played all resolve the same way: the admin decides the winner
and reports it. There is no separate "force-resolve fallback" endpoint in V1 — `/report` **is**
the one and only advance path, which is exactly what makes V1 fully server-testable via
`app.inject()` with no dependency on live-match/socket state.

> **Deferred to V1.5: lazy match creation + live handoff.** The richer flow — a player clicking
> "Play your match" on their bracket slot, the server lazily creating a `Match` (mode =
> `tournament.matchMode`, red/blue = the two entries' users, default settings) **like
> matchmaking does** (`realtime/matchmaking.ts:179-198`), calling `createLiveMatch(match.id,
> redId, blueId, mode, settings)` to seed the authoritative in-memory loop, and the client then
> **must emit `matchResync`** (real, at `apps/server/src/realtime/match.ts:536` — NOT `mmFound`,
> which is the normal-matchmaking-found event and does not apply to a lazily-created tournament
> match) to actually enter the match room and receive live state — is **entirely deferred to
> V1.5**, along with the paired **auto-advance-on-settlement hook**: a best-effort post-settlement
> hook at the end of `settleMatch` (`realtime/match.ts:295`) that would detect a `TournamentMatch`
> linked to the just-settled `Match` and call `resolveTournamentSlot` automatically, wrapped in
> try/catch so it never blocks match settlement (same discipline as the existing best-effort
> quest/gold grants in `settleMatch`). Building and testing this pair — lazy creation racing
> against a real-time `matchResync` join, plus an auto-advance hook that must not double-fire —
> is real integration-test surface that V1 explicitly avoids by having the admin report results
> instead. When V1.5 picks this up, the `TournamentMatch.matchId` `@unique` (or an `updateMany
> where matchId=null` guard) must ensure only one `Match` is created under a race, with the loser
> of the race joining the existing `matchId` via `matchResync`.

**Complete (pay prizes) — V1: top-2 only, no ties.** Pre-check: the final slot is `done` (a
champion exists) — else 409 `NOT_FINISHED`. Single-elimination guarantees **exactly one champion**
(the final slot's winner) and **exactly one runner-up** (the final slot's loser) — there is never
a tie for either of these two placements, so paying them is unambiguous. In one `$transaction`,
**the guarded status flip is the explicit first step** (matching the atomic-claim pattern already
used for Start/Cancel and `admin-reports.ts:48`), so a losing concurrent Complete 409s cleanly
instead of racing into the payout logic and surfacing a raw P2002/500:
1. **First:** `const flip = await tx.tournament.updateMany({ where:{ id, status:"RUNNING" },
   data:{ status:"COMPLETED", completedAt: new Date() } }); if (flip.count === 0) throw
   err.conflict("ALREADY_TERMINAL")`. Only one concurrent Complete call can win this flip; the
   loser 409s immediately, before touching placements or the ledger.
2. Set `placement=1` on the champion's entry and `placement=2` on the runner-up's entry.
3. **Optionally**, for display only, set `placement=3` on the two semifinal losers (and so on for
   earlier rounds, by the round a player was eliminated in) — this is informational bracket
   history, not a payout instruction. **V1 does not pay placement 3+ under any circumstances**,
   even if `prizeSplitGold` were extended, because ties for shared placements are exactly the
   ambiguity this rule avoids (double-pay risk vs. the `sum === prizePoolGold` invariant). If a
   future version wants to pay 3rd, it needs an explicit tiebreak rule (e.g. a real 3rd-place
   match) — tracked as a V2 backlog item, not V1.
4. Grant `prizeSplitGold[0]` to the champion and `prizeSplitGold[1]` to the runner-up (skip a
   grant if its amount is `0`), keyed `refId = entry.id` — per the ledger table above. Because the
   status flip already happened atomically in step 1, this grant can never run twice for the same
   tournament even without relying solely on the `LedgerEntry` unique index — the flip is the
   primary guard, the ledger index is the belt-and-suspenders backstop.
5. (`completedAt` already set in step 1.)

Audit `tournament.complete` with before/after + the payout map (exactly two grants at most).

**Abandoned-before-start tournament matches (V1: admin resolves, no auto-forfeit).** If a
tournament match is never actually played to completion (a player never shows up, the match is
abandoned, or it's disputed), V1 has **no automatic forfeit clock for tournament brackets** — the
admin simply calls `/report` with whichever entry should advance (typically the participant who
showed up), same as any other result. There is no round timer, no walkover automation, and no
dependency on the normal match loop's own 45s in-match abandonment forfeit (that forfeit still
applies to matches actually in progress, but nothing in V1 requires a tournament match to have
been started via the normal match loop before the admin can report a winner). Auto-forfeit
automation for tournament matches is V1.5/V2 backlog.

**Cancel (refund).** Allowed from `DRAFT` (no refunds needed), `OPEN`, or `RUNNING`. Guarded status
flip first (same pattern as Complete): `updateMany({ where:{ id, status:{ in:["DRAFT","OPEN",
"RUNNING"] } }, data:{ status:"CANCELLED", cancelledAt } })`, `count===0` → 409
`ALREADY_TERMINAL`. Then, in the same `$transaction`: refund every paid, un-refunded entry (ledger
table above, `refId = entry.id`). Audit `tournament.cancel` with the refund total. Any live
tournament `Match` rows are left to settle normally (harmless — the tournament is gone);
optionally notify participants.

---

## Admin API — `apps/server/src/modules/admin-tournaments.ts`

New Fastify plugin, registered in `buildApp()` alongside the other `admin-*` modules under the
`/api` prefix (so routes are `/admin/tournaments…` → client calls `/api/admin/tournaments…`,
mirroring `admin-reports.ts:21`). **All routes `requireAdmin("ECONOMY")`** (tournaments move
gold, so ECONOMY is the correct gate — matches the nav's `["/tournaments", …, "ECONOMY", true]`
at `App.tsx:42`). **Every mutation writes an `audit()` row** with before/after/reason.

| Method | Path | Role | Body | Audit action | Notes / errors |
|---|---|---|---|---|---|
| GET | `/admin/tournaments?status=&cursor=&limit=` | ECONOMY | – | – | list; cursor-paginated `orderBy [{createdAt:desc},{id:desc}]` (same pattern as admin-reports). Returns rows + registered counts + the 4 header stats. |
| GET | `/admin/tournaments/:id` | ECONOMY | – | – | full detail incl. entries (with user), and bracket (`matches` grouped by round). |
| POST | `/admin/tournaments` | ECONOMY | createBody | `tournament.create` | creates a `DRAFT`. Validates power-of-two `maxPlayers`, `format===SINGLE_ELIM`, gold ≥ 0. |
| PATCH | `/admin/tournaments/:id` | ECONOMY | editBody | `tournament.update` | **only when `status===DRAFT`** (else 409 `NOT_EDITABLE` — can't change fees after players may have joined). |
| POST | `/admin/tournaments/:id/open` | ECONOMY | `{reason}` | `tournament.open` | `DRAFT→OPEN`; sets `openedAt`. Else 409 `BAD_STATE`. |
| POST | `/admin/tournaments/:id/start` | ECONOMY | `{reason}` | `tournament.start` | `OPEN→RUNNING`; seeds bracket (see lifecycle). Rejects `< 2` entries → 400 `TOO_FEW_PLAYERS`. |
| POST | `/admin/tournaments/:id/matches/:tmId/report` | ECONOMY | `{winnerEntryId, matchId?, reason}` | `tournament.match.report` | **the only bracket-advance path in V1** — admin reports the winner of a `ready` slot; resolves + advances (see lifecycle). `matchId` optional (audit reference to a `Match` actually played, if any — not validated against live state). Atomic guard is `status:"ready"` (not merely "not done"). 409 `SLOT_DONE` if already resolved, 409 `SLOT_NOT_READY` if the slot's competitors aren't both filled yet; 400 if winner isn't a competitor of that slot. |
| POST | `/admin/tournaments/:id/complete` | ECONOMY | `{reason}` | `tournament.complete` | guarded status flip `RUNNING→COMPLETED` is the first step in the transaction, then pays gold prizes to placements 1 and 2 only (see lifecycle). 409 `NOT_FINISHED` if no champion yet; 409 `ALREADY_TERMINAL` if the flip loses a race; 400 `PRIZE_SPLIT_MISMATCH`. |
| POST | `/admin/tournaments/:id/cancel` | ECONOMY | `{reason}` | `tournament.cancel` | guarded status flip first, then refunds entry fees keyed `refId=entry.id` (see lifecycle). 409 `ALREADY_TERMINAL` if COMPLETED/CANCELLED. |

`createBody`/`editBody` (zod): `name` (1..80), `format` (enum, **must be `SINGLE_ELIM` in V1**,
else 400 `FORMAT_UNSUPPORTED`), `entryFeeGold` (int 0..1_000_000), `prizePoolGold` (int 0..),
`maxPlayers` (enum of powers of two `[2,4,8,16,32,64,128,256]`), `minTrophies` (int ≥ 0),
`matchMode` (`CASUAL|RANKED`, default CASUAL), `startsAt` (ISO datetime, optional),
`prizeSplitGold` (**exactly a 2-tuple** `[firstPrizeGold, secondPrizeGold]`, both non-negative
ints, summing to `prizePoolGold` — validated at create/edit **and** re-validated at complete; V1
rejects an array of any other length with 400 `PRIZE_SPLIT_MISMATCH`). All state transitions use
an **atomic guarded `updateMany`** (`where:{ id, status:<expected> }`) so two admins can't both
start/complete/cancel the same tournament (mirrors admin-reports' atomic OPEN-claim,
`admin-reports.ts:48`).

**Error helpers:** reuse `errors.ts` (`err.conflict(code,msg)` 409, `err.badRequest` 400,
`err.notFound` 404). New codes (`NOT_EDITABLE`, `BAD_STATE`, `TOO_FEW_PLAYERS`, `SLOT_DONE`,
`SLOT_NOT_READY`, `NOT_FINISHED`, `PRIZE_SPLIT_MISMATCH`, `ALREADY_TERMINAL`,
`FORMAT_UNSUPPORTED`, `ALREADY_JOINED`, `TOURNAMENT_FULL`) are just overrides on the existing
helpers — no new helper functions (same approach as reports-queue). `ALREADY_JOINED` and
`TOURNAMENT_FULL` are surfaced from the **player** join route (see "Player-facing API" below) but
listed here too since they're mapped through the same `err.conflict` helper and the same
join-transaction catch block described in "Economy / ledger flows" above.

---

## Player-facing API + UI

**Player API** — `apps/server/src/modules/tournaments.ts` (new), `requireAuth`, registered in
`buildApp()`. Guests are blocked from joining (they can't hold gold meaningfully / farmable) →
403 `GUEST_CANNOT_JOIN` (mirrors reports-queue's guest block; `isGuest` is on the request,
`guards.ts:34`).

| Method | Path | Notes |
|---|---|---|
| GET | `/api/tournaments?status=OPEN\|RUNNING` | public list of joinable/live tournaments. Returns fee, prize pool, `registered/maxPlayers`, `startsAt`, `minTrophies`, and `joined` (does the caller have an entry). |
| GET | `/api/tournaments/:id` | detail + bracket (entries with public user fields, matches by round) + `myEntry` (seed, eliminated, current placement if set). |
| POST | `/api/tournaments/:id/join` | **creates the entry, claims a seat, then charges `entryFeeGold` via ledger — in that order, in one `$transaction`** (see "Join" under "Economy / ledger flows" above for why the order matters). A fast pre-read short-circuits the common case: status `OPEN`; not already joined; capacity; `user.trophies >= minTrophies` (403 `TROPHY_GATE`); not a guest/bot. The transaction itself is the concurrency guard: `tx.tournamentEntry.create` racing on `@@unique([tournamentId,userId])` → caught, mapped to 409 `ALREADY_JOINED`; the `registeredCount` conditional `updateMany` racing on the last seat → 409 `TOURNAMENT_FULL`; `applyLedgerTx` throwing `INSUFFICIENT_GOLD` → 400. Never a raw 500 on a concurrent double-join (see the join-race regression test). |
| POST | `/api/tournaments/:id/leave` | **only while `OPEN`** (once RUNNING you can't leave a live bracket). Refunds the entry fee (ledger `tournament-refund`, `refId=entry.id`) + **hard-deletes** the entry + decrements `registeredCount`, all in one `$transaction`. 409 `BAD_STATE` if not OPEN. A subsequent rejoin creates a brand-new `TournamentEntry` (new `id`) — see the entry lifecycle decision under "Data model" for why this is deliberate (it's what keeps leave's refund and a later cancel's refund from colliding). |

Note what's **not** here: there is no `/api/tournaments/:id/matches/:tmId/play` endpoint in V1.
Players play their tournament matches through the platform's existing, ordinary match flow
(matchmaking / friendly invite / however matches are started today) — the bracket doesn't launch
or link matches for them. The admin is the one who records the outcome (see "Report result +
advance" above). That endpoint, and the client-side lazy-create + `matchResync` handoff it
implies, is deferred to V1.5 (see "Deferred to V1.5: lazy match creation + live handoff").

**Web UI — deferred to V1.5.** The mockup's player "Cups" list + an interactive round-by-round
bracket rendering (`apps/web/src/features/tournaments/CupsPage.tsx`,
`apps/web/src/features/tournaments/TournamentPage.tsx`, a "Play your match" button) is **not**
built in V1. V1 ships the `GET`/`join`/`leave` player API above so the backend is complete and
testable, but the **player-facing web UI consuming it is V1.5 work**. If a minimal V1 touchpoint
is wanted before V1.5, it can be as small as a join button + "you're entry #N, eliminated: y/n"
status line reusing existing list/card components — but building the polished bracket visual is
explicitly out of V1.

Notifications: on Start and when the admin reports a result that advances the caller into the
next round, write a `Notification` (`type:"tournament"`, existing model, `schema.prisma:434`) so
players know it's their turn — reuse the notification system already used elsewhere; no new push
infra. This is cheap enough to ship in V1 alongside the backend even though the rich bracket UI
is deferred.

---

## Admin page — `apps/admin/src/pages/Tournaments.tsx`

Replaces the Phase-2 stub. Matches the approved `secTournaments` markup (html:701–766) using
**only approved admin CSS tokens/classes** (same token set as `Economy.tsx` / `LiveOps.tsx`),
consuming via `api.get` and mutating via `useAdminMutation` (`apps/admin/src/lib/ui.tsx:105`).

- **4-stat header** (html:704–709): Live now (`status===RUNNING` count), Upcoming
  (`OPEN` count), Players registered (`SUM(registeredCount)` — the serialized counter, not a
  live `COUNT(entries)`, so the header stat and the join-capacity guard always agree), Gold prize
  pool scheduled (`SUM(prizePoolGold)` over OPEN+RUNNING). All from real queries (rule 1).
- **"+ New tournament" form** (html:716–735): name, format (**Single elimination** selectable;
  the other three shown **disabled with a "V2" note**), bracket-size cap (power-of-two select),
  entry-fee currency (**Gold only** — Diamonds option removed/disabled), entry fee, prize-pool
  currency (**Gold only**), prize pool, **prize split editor** (ordered gold amounts that must
  sum to the pool — a small addition beyond the mockup so payouts are real, not fabricated),
  min-trophies, starts. Save → `POST`/`PATCH`.
- **Tournaments table** (html:737–766): Tournament (name + min-trophy sub-label) · Status badge
  (Draft/Upcoming[OPEN]/Live[RUNNING]/Finished[COMPLETED]/Cancelled — the exact
  `statusStyle` color map at html:1922) · Format · Entry (fee or "Free") · Prize pool · Players
  (`registered / cap`) · Starts · Actions. Actions per status:
  - `DRAFT`: **Edit**, **Open registration**, **Cancel**.
  - `OPEN`: **Start** (seed bracket), **Cancel** (refunds).
  - `RUNNING`: **View bracket**, **Complete** (pay prizes), **Cancel** (refunds).
  - `COMPLETED`/`CANCELLED`: **View** (read-only); no Cancel (matches `t.canCancel`, html:1922).
- **Simple bracket/slot view** (V1 — drawer/expanded panel on a RUNNING/COMPLETED row, an
  addition the mockup gestures at via `t.edit`): **not** a fancy interactive bracket graphic —
  a plain list of rounds, each showing its slots' two entrants and the resolved winner (if any).
  Each unresolved slot has a **"Report result"** control (`{winnerEntryId, matchId?, reason}`
  confirm modal via `useAdminMutation`) calling `/report` — this is the **only** way a slot
  advances in V1, not a fallback for a missing auto-hook. The fancier round-by-round bracket
  rendering (bracket-tree graphics, connecting lines, etc.) is V1.5 admin-page polish; the V1
  version can be a simple table/columns-of-rounds layout.
- Every mutating button funnels through `useAdminMutation` (confirm → reason → toast), so the
  reason string reaches the server audit. Two empty states: "No tournaments yet — create one" and
  a filtered-empty state.

**Nav wiring** (`apps/admin/src/App.tsx`): drop the `P2` flag on the `/tournaments` row
(remove the trailing `true` at line 42), import `Tournaments`, and swap the route (line 189)
from the `<Phase2 …>` stub to `<Tournaments />`. Keep the dot color `#e0a24a` and group
`Engagement`.

---

## Files touched

**Server (V1)**
- `apps/server/prisma/schema.prisma` — 3 models + 2 enums + 3 back-relations (additive migration).
- `apps/server/src/economy/tournament-ledger.ts` — NEW: thin helpers `chargeEntryFeeTx(tx, entry,
  amount)`, `refundEntryFeeTx(tx, entry, amount)`, `payPrizeTx(tx, entry, amount)` wrapping
  `applyLedgerTx` with the fixed `refType:"tournament"` / `reason` per the table and
  **`refId = entry.id`** (never `tournamentId` — see the keying note under "Economy / ledger
  flows"). These are thin `applyLedgerTx` wrappers, **not** `applyLedger` wrappers — callers
  (join/leave/cancel/complete) remain responsible for catching P2002 around the `$transaction`
  that calls them, since `applyLedgerTx` itself does not swallow it.
- `apps/server/src/lib/tournament-bracket.ts` — NEW: pure functions `seedPairings(n, B)`,
  `parentSlot(round, slot)`, `resolveTournamentSlot(tx, tmId, winnerEntryId)`,
  `computePlacements(matches)` — unit-testable, no I/O beyond the passed tx.
- `apps/server/src/modules/admin-tournaments.ts` — NEW: admin routes, including `/report` (the
  sole advance path in V1).
- `apps/server/src/modules/tournaments.ts` — NEW: player routes — `GET` list/detail, `join`,
  `leave` only (no `/play` endpoint in V1).
- `apps/server/src/index.ts` — register `adminTournamentsRoutes` + `tournamentRoutes` in `buildApp()`.

**Server — deferred to V1.5 (not touched in V1)**
- `apps/server/src/realtime/match.ts` — the best-effort post-settlement tournament-advance hook
  at the end of `settleMatch` is **not added in V1**; V1 makes no changes to this file.
- `apps/server/src/realtime/matchmaking.ts` — no changes in V1 (referenced only as a pattern to
  copy from when V1.5 builds lazy match creation).

**Web (player app) — deferred to V1.5**
- `apps/web/src/features/tournaments/CupsPage.tsx` — list UI, V1.5.
- `apps/web/src/features/tournaments/TournamentPage.tsx` — bracket + "Play your match", V1.5.
- route + nav entry for the Cups screen — V1.5. (V1 ships the player join/leave/list API with no
  dedicated web UI, or at most a minimal join-button touchpoint — see "Web UI" above.)

**Admin (V1)**
- `apps/admin/src/pages/Tournaments.tsx` — NEW page: list, create/edit form, **simple**
  bracket/slot view with "Report result" — no fancy bracket graphics in V1.
- `apps/admin/src/App.tsx` — import + route swap + drop the `/tournaments` P2 flag.

---

## Testing — server integration tests (via `buildApp()` + `app.inject()`)

Reuse the existing harness (`apps/server/test/helpers.ts`: `buildTestApp`, `authFor`, `seedUser`,
`truncateAll`). **Extend `truncateAll`** to also wipe
`"Tournament","TournamentEntry","TournamentMatch"` (add them to the `TRUNCATE … CASCADE` list at
`helpers.ts:54`; `Match` too so tournament matches don't leak between tests). Seed users with a
starting `gold` balance for the economy tests.

**Bracket unit tests** (`tournament-bracket.ts`, pure — no DB):
- `seedPairings`: `n=8` → 4 balanced pairings (1v8,4v5,3v6,2v7); `n=6,B=8` → seeds 7,8 (the
  absent slots) produce byes for seeds 1,2; `n=2` → single final.
- `parentSlot`: `(1,0)`&`(1,1)`→`(2,0)`; `(1,2)`&`(1,3)`→`(2,1)`.
- `computePlacements`: champion=1, runner-up=2 — **exactly one of each, always** (single-elim
  guarantees no tie for placement 1 or 2). Both semifinal losers **may** be labeled placement=3
  for display, but the test must assert `computePlacements` never returns more than one entry at
  placement 1 and never more than one at placement 2 (this is the property that makes the V1
  payout unambiguous — see "Prize payout" above).

**Integration tests** (via `inject()`):
- **RBAC:** SUPPORT/MODERATOR hitting any `/admin/tournaments*` mutation → 403; unauthenticated →
  401; the hardened `requireAdmin` rejects a now-demoted admin with a stale ECONOMY token.
- **Create/edit lifecycle:** create DRAFT → PATCH allowed; open → PATCH now 409 `NOT_EDITABLE`.
- **Join charges gold (core):** seed a user with 500 gold, `entryFeeGold=100`, join → entry
  exists, balance = 400, `registeredCount` incremented by 1, exactly one `LedgerEntry`
  `tournament-entry` `amount=-100` `refId=<the new entry's id>`. Re-POST join → 409
  `ALREADY_JOINED`, balance unchanged, still one debit (idempotent).
- **Join guards:** insufficient gold → 400 `INSUFFICIENT_GOLD`, no entry, no ledger row, no
  `registeredCount` change; below `minTrophies` → 403 `TROPHY_GATE`; at capacity → 409
  `TOURNAMENT_FULL`; guest → 403 `GUEST_CANNOT_JOIN`.
- **Join race (HIGH #1 regression — must never 500):** `Promise.all` of two identical concurrent
  join requests for the *same user* against the same tournament. Assert: exactly one
  `TournamentEntry` row is created, exactly one `LedgerEntry` `tournament-entry` row exists,
  `registeredCount` incremented exactly once, one response is `201` and the other is `409
  ALREADY_JOINED` — **never a `500`**. This is the direct regression test for the
  `applyLedgerTx`-does-not-swallow-P2002 bug: without the create-first + explicit `try/catch`
  fix, the loser of the race throws an unmapped Prisma error out of the route handler.
- **Capacity race (MEDIUM #3 regression):** a tournament with `maxPlayers=8` and 7 existing
  entries; fire `N` (e.g. 5) concurrent joins from **different** users for the last seat via
  `Promise.all`. Assert the final entry count **never exceeds `maxPlayers`** (exactly one of the
  N succeeds with `201`, the rest get `409 TOURNAMENT_FULL`), and `registeredCount === maxPlayers`
  afterward with no drift from the true `COUNT(TournamentEntry)`. This replaces the earlier,
  weaker "capacity respected under `Promise.all`" assertion with an explicit exceeds-cap check.
- **Leave refunds:** join (balance 400) → leave while OPEN → balance back to 500, entry
  hard-deleted, `registeredCount` decremented by 1, one `tournament-refund` `+100`
  `refId=<that entry's id>`. Leave while RUNNING → 409 `BAD_STATE`.
- **Leave→rejoin→cancel regression (HIGH #2 regression):** join (entry A, debit −100,
  `refId=A.id`) → leave while OPEN (refund +100, `refId=A.id`, entry A hard-deleted,
  `registeredCount` back down) → rejoin (entry B, a **new** id, debit −100, `refId=B.id`) →
  cancel (refund +100, `refId=B.id`). Assert: exactly one debit ledger row per entry (two total,
  A and B), exactly one refund ledger row per entry (two total, A and B), the player's net gold
  balance is unchanged from before the sequence (500 → 400 → 500 → 400 → 500), and specifically
  that the **cancel refund was not swallowed** by colliding with the leave refund's idempotency
  slot (the bug this test guards against: both used to share `refId=tournamentId`, so the second
  `applyLedger` call would have silently no-op'd as "already applied", permanently losing the
  player their second entry fee).
- **Bracket seeding:** register 6 users, start → `status=RUNNING`, 6 seeds assigned by join order,
  round-1 has byes for the top 2 seeds (their round-2 slots pre-filled), all rounds' slot rows
  exist; start with <2 → 400 `TOO_FEW_PLAYERS`; start twice concurrently → one succeeds, other 409.
  Also: if `registeredCount` were ever to exceed `maxPlayers` (defensively, e.g. via a seeded DB
  fixture bypassing the guard), Start clamps seeding to `n = min(entries.length, maxPlayers)`
  rather than seeding an oversized bracket.
- **Report result + advance (core — the only V1 advance path):** for a `ready` slot, admin
  `POST /report {winnerEntryId}` marks the slot `done`, eliminates the loser, and fills the
  parent slot's `redEntryId`/`blueEntryId` correctly (even/odd slot → red/blue); when the parent
  now has both sides, its `status` flips to `ready`. Re-`POST /report` on an already-`done` slot
  → 409 `SLOT_DONE` (idempotent atomic guard — the earlier report wins, no double-advance).
  **`POST /report` on a `pending` slot (one or both competitors not yet filled) → 409
  `SLOT_NOT_READY`**, not a silent resolve — this is the regression test for restricting the
  guard from `status:{not:"done"}` to `status:"ready"`. Winner not a competitor of that slot →
  400. Optional `matchId` is stored as-is with no validation against any live-match state (there
  is none to validate against in V1). This test suite requires **no socket connection, no
  live-match harness, and no `matchResync`** — pure `app.inject()` HTTP calls, which is the
  concrete proof that V1 is fully server-testable.
- **Prize payout (core, top-2 only):** a 4-player tournament to completion (admin reports every
  round), `prizePoolGold=1000`, `prizeSplitGold=[700,300]` → champion `placement=1` +700,
  runner-up `placement=2` +300 (exactly two `tournament-prize` ledger rows, `refId` = each
  winner's `entry.id`), balances reflect it, `status=COMPLETED`; assert **no** `tournament-prize`
  ledger row exists for either semifinal loser even if the implementation also stamps
  `placement=3` on them for display. Re-run complete → 409 `ALREADY_TERMINAL`, no double-pay
  (asserted both via the ledger's unique index **and** via the guarded status-flip being the
  first transaction step, per the Complete-guard-ordering fix). `prizeSplitGold` not summing to
  pool → 400 `PRIZE_SPLIT_MISMATCH`; `prizeSplitGold` with a length other than 2 → 400
  `PRIZE_SPLIT_MISMATCH`. Complete before a champion exists → 409 `NOT_FINISHED`. **Concurrent
  complete race:** `Promise.all` of two `POST /complete` calls on the same finished tournament →
  exactly one `200` and one `409 ALREADY_TERMINAL`, exactly two `tournament-prize` ledger rows
  total (never four) — proves the status flip, not just the ledger index, is what prevents a
  double-pay.
- **Abandoned match:** a `ready` slot with no `Match` ever created/settled — admin `POST /report`
  still resolves and advances it exactly like any other slot (no special-case error, no
  dependency on match state); confirms V1 has no auto-forfeit dependency. (The slot reaches
  `ready` the normal way — both feeders resolved — so the `status:"ready"` guard change doesn't
  affect this case.)
- **Cancel refunds (core):** OPEN tournament with 3 paid entries → cancel → each user refunded
  once (3 `tournament-refund` rows, `refId` = each entry's own id, `refunded=true`),
  `status=CANCELLED`, `registeredCount` reset/irrelevant post-cancel; re-run cancel → 409
  `ALREADY_TERMINAL`, no second refund. Free tournament (`entryFeeGold=0`) cancel → no ledger rows.
- **Audit:** every mutation writes an `AuditLog` row with the expected `action`, `targetType:
  "tournament"`, before/after, and the passed `reason`.

Web/admin have no test harness → those paths verified manually (create → open → join from two web
sessions → admin starts → admin reports each round's result via the admin page → complete pays
prizes; cancel refunds; the simple bracket/slot view renders and updates after each report). This
manual pass has **no dependency on the live match/socket flow** — the admin can report results
for slots regardless of whether the underlying match was actually played through the app.

---

## Migration & rollout

- **One Prisma migration** (`prisma migrate dev --name tournaments`): 3 models + 2 enums + 3
  back-relations. Purely additive — no changes to existing table columns → **zero risk to live
  data** (rule 4). No raw-SQL partial index needed (unlike reports-queue); all constraints are
  expressible in the schema DSL. Applied to prod via the established deploy path
  (`prisma migrate deploy` on Railway, per MEMORY `railway-deploy`; CI migrates too).
- **Feature-flaggable:** guard the player-facing join/leave/list routes behind a `Config` flag
  (`tournaments.enabled`, reusing the existing `Config` model, schema.prisma:475) so the admin
  can build DRAFT/OPEN tournaments before exposing them to players. Admin page ships unflagged.
- **Ship server + admin together in V1** (no web player UI required to ship — see "Web UI"
  above). Because V1 adds no hook to `settleMatch` and no changes to `realtime/matchmaking.ts`,
  the entire tournaments feature is additive at the API-route level too: zero risk to the
  existing match/matchmaking code paths, not just to the schema.
- **V1.5 backlog** (recorded here so it isn't rediscovered): the `settleMatch` auto-advance
  post-settlement hook, the lazy "Play your match" match-creation + `matchResync` live handoff,
  the player-facing Cups list + interactive bracket rendering UI, live socket bracket push,
  auto-forfeit for abandoned tournament matches.
- **V2 backlog** (recorded here so it isn't rediscovered): double-elim/Swiss/round-robin,
  auto-scheduler (cron open/start at `startsAt`), auto-matchmaking + round timers + walkover
  clocks, trophy-seeding, third-place match (would need an explicit tiebreak rule before it could
  be paid), re-buy/late registration, spectator brackets, guild tournaments.
```
