# TI-style tournament format: round robin groups → double elimination

Status: **BUILT and merged-ready (2026-08-03).** Spec v3 — v1 design, v2 review
corrections, v3 records what was actually implemented and which decisions were
taken to get there.
Owner decision: 2026-08-03 — "Configurable per cup", then "proceed to fix and complete"

## Decisions taken at implementation time

The owner reaffirmed rather than answering the six open questions individually,
so these were decided on their behalf and are recorded here as the ones to
revisit if any turn out wrong:

| Question | Decision | Why |
| --- | --- | --- |
| Short fields | **Full-cup gate** (`GROUP_NEEDS_FULL_FIELD`) | Matches the DOUBLE_ELIM precedent already accepted; never reshapes a cup people paid to enter |
| Group rounds | **Generated one at a time** | The only way to keep "one live fixture per player", which the no-show forfeit depends on |
| Scheduling / push | **Not built** — capped total matches at 120 instead | Push infrastructure is a separate project; the cap keeps cups finishable |
| Tied placements | **Share the pooled slots** | Otherwise declared prize gold silently fails to move |
| Best-of | **Bo1 throughout** | Bo3 would touch match completion, the realtime layer and the schema |
| Seeding | **Trophies, for this format only** | Join-order seeds would settle the last qualifying place by who clicked Join first |

**Still deferred, and the one to watch:** there is no scheduling and no
notification system. A 40-match cup is finishable because the no-show forfeit
keeps things moving, but a pair who are both absent still produce a fixture
nothing can resolve. See B5.
Requested: "round robin eliminates 2 players depending on the size of the tournament.
once all round robin is completed, we move to the group stages, the top N is in the
upper bracket and the below N are in the lower bracket. This is the game mechanics
used by the dota2 the international."

---

## What the review changed

v1 of this spec claimed the double-elimination engine needed **no changes at all** and
that this was "the bulk of what this would otherwise have cost." **That claim is struck.**
The geometry argument behind it survives; the engineering conclusion does not.

Four independent reviewers converged on the same defects. Corrections carried into v2:

| v1 said | Reality |
| --- | --- |
| The DE engine needs no changes | `reportResult` derives `B` by **counting W-round-1 rows**. Skipping W1 makes `B = 0` and every playoff match throws a 500. |
| Derive everything from `maxPlayers` | Start seeds from `n = min(entries.length, maxPlayers)`. Fields are routinely short. All the validation was computed on the wrong number. |
| Only `SINGLE_ELIM` is wired end-to-end | Stale. `DOUBLE_ELIM`, `SWISS` and `ROUND_ROBIN` are **all** fully wired. More per-format plumbing exists to extend than v1 budgeted. |
| Android uses the same shared `roundLabel` | Android hand-maintains a **parallel Kotlin port** of the whole bracket module. Every shared-package change needs doing twice. |
| `roundLabel` has an off-by-one from the skipped round | Wrong. It labels by distance from the end of the rounds *actually present*, so it self-corrects. There **is** a real off-by-one, but in the numbered fallback, and only at S≥32. |
| Cross-group pairing listed A1·B4, A2·B3, B1·A4, B2·A3 | Laid into slots in that order, `parentSlot(2,0) == parentSlot(2,1)` puts **A1 and A2 in the same upper semifinal** — a same-group rematch, the exact thing the rule existed to prevent. |
| Idempotency guard prevents double-generation | It does. It does nothing about **zero**-generation, which this repo has already been bitten by and documents at `tournaments-core.ts:838-851`. |
| Placements are a clean permutation | `computeDoubleElimPlacements` deliberately emits **ties and gaps** (`1,2,3,4,5,5,7,7`). Test plan item 5 as written could never pass, and the payout loop silently drops gold. |
| Group standings table is new UI | New on **Android only**. Web already has a working `StandingsTable`. |

One v1 claim was checked and **held**: odd group sizes are safe. A reviewer executed
`roundRobinSchedule` for n=5/9/10 — byes emit no row at all, so `computeRoundRobinStandings`
cannot miscount them, and every player plays exactly `groupSize - 1` games.

---

## ⚠️ Pre-existing production bug found during this review

**Not caused by this feature. Present in shipped code today.**

`ROUND_ROBIN` tournaments create **every** fixture with `status: "ready"` at start
(`tournaments-core.ts:322-335`), but `myTournamentMatch` only ever shows a player their
**earliest unresolved** fixture (`tournament-live.ts:90-97`), and `markReady` accepts
**any** ready slot the caller is seated in (`tournament-live.ts:175-216`).

So a player can ready a fixture their opponent's UI is not pointing at, wait out
`readyWindowSec`, and win by forfeit via `resolveNoShow` (`tournament-live.ts:372-398`)
without a game being played. It also fires **by accident**: anyone clearing fixtures
faster than the field ends up holding matches their opponents cannot see.

Swiss is not exposed (it generates round-by-round, one live fixture per player).
Single-elim is not exposed. **`ROUND_ROBIN` is.** Worth fixing regardless of whether the
TI format is ever built — recommend not running a `ROUND_ROBIN` cup until it is.

---

## The load-bearing insight (survives review)

**A TI playoff bracket is a standard double-elimination bracket of size `S` with winners
round 1 already decided.** The group stage *is* winners round 1.

Verified against `losersBracketStructure()` for B=4, 8, 16, 32 — each sums to `B-2`
matches, and the TI shape lands exactly on W-round-2 and L-round-1 every time:

| Standard B=16 double elim | TI 16-player playoff |
| --- | --- |
| W round 2 — 8 players, 4 matches | Upper bracket round 1 — 8 players, 4 matches |
| L round 1 — 8 players, 4 matches | Lower bracket round 1 — 8 players, 4 matches |
| L round 2 — 4 L-R1 winners vs 4 W-R2 losers | Lower bracket round 2 — same |

`losersDropSlot`, `lWinnerAdvance` and `losersBracketStructure` are individually correct
for a pre-seeded L1 — `lWinnerAdvance(1, s, …)` maps `s → s` 1:1, meeting the W-R2 loser
`losersDropSlot(2, s, 16)` drops at the same slot. `computeDoubleElimPlacements` also
ignores W rounds entirely and filters group rounds out cleanly.

**But their caller does not survive.** See the next section.

### The constraint this forces

- **Upper bracket size = lower bracket size = `S/2`. Derived, not configurable.**
- `S` must be a power of two; `qualifiersPerGroup` must be even.

Exactly what TI does anyway (4 up, 4 down of 8 qualifiers).

---

## 🔴 Blockers — must be resolved before any code

### B1. `B` is derived from a W-round-1 row count

`apps/server/src/modules/tournaments-core.ts:796-797`:

```ts
const wRound1Count = await tx.tournamentMatch.count({ where: { tournamentId, bracket: "W", round: 1 } });
const B = wRound1Count * 2;
```

This is the **only** source of `B` in the codebase, and the design note at `:593-600`
states it as deliberate. Skipping W1 gives `B = 0` → `losersBracketStructure(0)` →
`Math.log2(0) = -Infinity` → throws a bare `Error` (not an `ApiError`) at
`tournament-bracket.ts:494`, inside `db.$transaction`, so the result rolls back. The
auto-advance path only swallows `SLOT_DONE` (`tournament-live.ts:350-355`) and the
sweeper retries forever. **Not one playoff match in the cup could ever resolve.**

**Fix:** persist `bracketSize` on the Tournament at the phase transition, and read it for
this format. Deriving from `2 × count(W round 2)` also works but keeps the fragile
"count rows to recover a structural constant" pattern.

### B2. Field size is `n`, not `maxPlayers`

`tournaments-core.ts:185`: `const n = Math.min(entries.length, tournament.maxPlayers)`.
The only gate is `n >= 2`. Start is admin-triggered whenever they like, with whatever
field turned up. Each format already handles the shortfall differently — single-elim
shrinks and pads with byes, RR/Swiss use `n` directly, and **DOUBLE_ELIM refuses to
start** with `DE_NEEDS_POWER_OF_TWO` rather than strand entry-fee gold in an
unresolvable bracket (`:457-462`, reasoning documented at
`tournaments-core.test.ts:1524-1541`).

Every derived quantity in v1 was computed on `maxPlayers`. With 13 of 18 registering,
`groupSize` is 9 on paper and 6.5 in fact; `qualifiersPerGroup = 8` exceeds the short
group; `S` stops being a power of two and the whole insight collapses. **In a beta with
few players this is the expected case, not the edge case.**

**Owner decision required — pick one:**

- **(a) Full-cup gate.** Refuse Start unless `registered === maxPlayers`. Least code,
  matches the existing DOUBLE_ELIM precedent the owner has already accepted. One no-show
  blocks the cup; the only exit is cancel + refund.
- **(b) Re-derive from `n` at Start.** Recompute the shape from the real field, reject
  with `INVALID_GROUP_SHAPE` if `n` doesn't factor. Admin UI must then show which
  entrant counts are legal — most aren't.
- **(c) Shrink policy** — unequal groups, fixed `q`. Breaks the equal-groups fairness
  rule and the power-of-two guarantee at once. Not recommended.

### B3. The phase transition can generate **zero** brackets

v1's guard ("do any `bracket = "W"` matches already exist?") prevents a *duplicate*
bracket. It does nothing about a *lost* one. Under READ COMMITTED, two reports settling
the last two group matches concurrently can each see the other as not-yet-done and both
skip generation. The repo documents this exact failure for Swiss at
`tournaments-core.ts:838-851`, and with 72 group matches settling over hours — via a
fire-and-forget `onMatchEnd` hook — concurrent reports are the normal case.

`recoverMissingSwissRounds` is the existing fix, but it is called from `completeTournament`
(`:1021`), which is **unreachable** for a cup stranded before its playoffs exist. Entry
fees debited, no payout, no completion, no player-side recovery.

**Fix:** a lazy recovery pass hung off `sweepTournamentReadyChecks`
(`tournament-live.ts:425`) so a stranded cup self-heals within one sweep tick.

### B4. Group fixtures must be generated round-by-round

The ready-check invariant is stated explicitly at `tournament-live.ts:75-78`: *"A player
is only ever in one [unresolved slot] at a time."* A group stage violates it eight ways
per player, which is what produces the forfeit bug described above.

**Fix:** generate group round `r+1` inside the transaction that completes round `r` —
exact precedent in `maybeGenerateNextSwissRound` (`tournaments-core.ts:853-940`). One
live fixture per player restores the invariant and the no-show clock only ever arms on a
slot both players are looking at. Cost: lockstep rounds, so everyone waits for the
slowest pairing. That is a real UX trade-off and should be an owner-visible one.

### B5. There is no scheduling and no liveness guarantee

- No scheduled match time exists anywhere — `startsAt` is documented "descriptive in V1"
  (`schema.prisma:797`) and `TournamentMatch` has no time column at all.
- The no-show clock **only exists if someone readies**; `readyDeadlineAt` is otherwise
  null and the sweeper scans only non-null deadlines (`tournament-live.ts:430-434`).
- So a **mutually absent pair produces a permanently unresolvable fixture**, and one
  stuck fixture out of 72 halts the entire cup. There is no tournament timeout or
  abandonment job anywhere in the codebase.
- Draws make it worse: a drawn tournament match clears `readyDeadlineAt`
  (`tournament-live.ts:323-339`), returning to the no-timer state.
- There are also **no tournament notifications and no push infrastructure**
  (`PushNotifications.kt` is an explicit stub; web has no push). Your opponent readies, a
  ten-minute forfeit clock starts, you are offline, you lose, and nothing told you.

A 15-match knockout tolerates this. A 94-match asynchronous format does not. **This is
the finding that should most affect the go/no-go decision** — it is infrastructure the
group stage needs and single elimination merely masks.

### B6. Prize payout cannot express the placements this produces

`completeTournament` pays `for i in 1..split.length` via
`placements.find(p => p.placement === i)`, `continue`-ing when no row matches and paying
only the **first** of a tie (`tournaments-core.ts:1078-1087`). Validation checks only
that the split sums to the pool (`:987-994`).

`computeDoubleElimPlacements` returns e.g. `{1,2,3,4,5,5,7,7,9,9,9,9,13,13,13,13}` for
B=16 — sparse and tied. v1 then stacked group eliminations on top at S+1…maxPlayers. An
18-entry split would silently fail to distribute placements 6, 8, 10–12, 14–16, while the
audit row records the full split as paid (`:1095`). **Advertised pool ≠ distributed gold.**

**Fix:** decide whether ties split their combined share (correct, and what players
expect) or whether the split is defined over *distinct* placement bands. Either way this
is a payout-logic change, not a ranking change, and it touches money — so it needs its
own review.

---

## 🟡 Design corrections

### Cross-group pairing must use `seedPairings` slot order

v1 listed `A1·B4, A2·B3, B1·A4, B2·A3` and implied laying them into slots 0–3 in order.
`parentSlot(2,0) == parentSlot(2,1) == {3,0}`, so A1 and A2 — same group, top two —
would meet in the upper semifinal, while the two group winners could only meet in the
final. `seedPairings` (`tournament-bracket.ts:17-35`) exists precisely to mirror-append
so seeds 1 and 2 land in opposite halves. **Build the cross-group pairs, then lay them
into `seedPairings`-order slots.**

### `groupCount = 1` is contradictory — drop it

v1 admitted it in validation rule 5 and in the shapes table, while Phase 2 requires
pairing against *another group*. Either forbid `groupCount >= 2`, or specify the
degenerate case explicitly. Recommend forbidding it.

### Seeds are join order, not strength

Every start branch assigns `seed = i + 1` ordered by `joinedAt`
(`tournaments-core.ts:224-226`, `:316-318`, `:379-381`, `:472-474`). Nothing reads
trophies at seeding time. Consequences v1 missed:

- Its snake-draft rationale ("straight dealing stacks the strong seeds into group 0") is
  **vacuous** — snake balances registration order, which is noise. Keep the snake (it
  costs nothing) but state the honest reason: it is arbitrary either way.
- The snake mapping is deterministic *and* the current `registered` count is exposed on
  the public unauthenticated list endpoint (`tournaments.ts:58`), so **two accounts can
  watch the counter and join at positions 4 and 5 to guarantee landing in the same
  group**, then throw games to each other.
- `computeRoundRobinStandings`' final tie-break is seed ascending
  (`tournament-bracket.ts:224`). In an 8-of-9-qualify shape, ties are the norm — so **who
  qualifies, and who takes gold, is routinely decided by who registered first.**

Seeding by trophies descending at Start is ~3 lines per branch and would make both the
snake draft and the tie-break mean what v1 claimed they meant. Recommend it.

### Local vs global seed in per-group scheduling

`roundRobinSchedule(groupSize)` returns **local** seeds 1..groupSize; `startRoundRobin`
resolves through a `bySeed` map keyed by **global** seeds (`tournaments-core.ts:319-324`).
Called per-group without a local→global remap, group 1's lookups return `undefined` and
throw inside the Start transaction. Also `matchesPerRound = Math.floor(groupSize/2)` —
writing `groupSize/2` yields fractional slots at groupSize 9.

### The transition must create the whole playoff skeleton

`startDoubleElim` creates the full L skeleton **and** GF game 1 at start
(`tournaments-core.ts:516-530`). Here Start creates only `G` matches, so the transition
must create W rounds 2..k, every L slot, and GF game 1 — v1 discussed only seeding W2 and
L1. Missing L slots make `losersDropSlot`'s `findUniqueOrThrow` throw (`:659-661`).

Pre-created L slots are hardcoded `status: "pending"` (`:521`), and the only paths that
flip them to `"ready"` are the W-drop and L-advance. **Pre-seeded L1 must be written
`"ready"` explicitly** or every L1 match stalls on `SLOT_NOT_READY` forever — a silent
permanent stall discovered only in production.

Use `createMany` for the skeleton: this runs in the hot path of a player finishing a
game, against Prisma's default 5s interactive-transaction timeout.

---

## Configuration

Two admin-settable fields: `groupCount`, `qualifiersPerGroup`. Everything else derived:

```
groupSize  = fieldSize / groupCount        // fieldSize per B2 decision, NOT maxPlayers
S          = groupCount * qualifiersPerGroup
upperSeats = lowerSeats = S / 2
```

### Validation

1. `fieldSize % groupCount === 0`
2. `S` is a power of two, `S >= 4`
3. `qualifiersPerGroup` even
4. `qualifiersPerGroup < groupSize` — someone must actually be eliminated
5. `groupCount >= 2`
6. **A match-count cap.** `ROUND_ROBIN_MAX_PLAYERS = 16` and `SWISS_MAX_PLAYERS = 32`
   already exist (`admin-tournaments.ts:27-28`) with the comment "match count = n(n-1)/2
   grows fast." A group cup **is** a round robin and needs its own cap; v1 argued about
   94 matches in prose while an enforced limit already existed in code.

Note that `ELIMINATION_FORMATS` forces `maxPlayers` to a power of two
(`admin-tournaments.ts:59-71`). If `GROUP_DOUBLE_ELIM` joins that set, **18, 20, 12, 10
and 9 are all rejected** — five of six rows in the shapes table. It needs its own branch.

### Shapes

| Players | Groups | Qual/group | S | Out | Group matches | Playoff | Total |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 18 | 2 | 8 | 16 | 2 | 72 | 22 | **94** ← literal TI |
| 20 | 2 | 8 | 16 | 4 | 90 | 22 | 112 |
| 16 | 2 | 4 | 8 | 8 | 56 | 10 | 66 |
| 12 | 2 | 4 | 8 | 4 | 30 | 10 | **40** ← recommended |
| 10 | 2 | 4 | 8 | 2 | 20 | 10 | 30 |

Admin UI must show the computed total match count live.

---

## Schema

```prisma
enum TournamentFormat { …existing…, GROUP_DOUBLE_ELIM }

model Tournament {
  groupCount         Int?
  qualifiersPerGroup Int?
  bracketSize        Int?   // per B1 — the fix for the B=0 bug
}

model TournamentEntry {
  groupIndex     Int?
  groupPlacement Int?
}
```

`TournamentMatch` needs no new columns. Migration notes: nullable column adds are
metadata-only and safe on the live Railway database; **`ALTER TYPE … ADD VALUE` cannot be
*used* in the same transaction that adds it**, so keep the migration purely additive with
no backfill referencing the new value. Postgres has no `DROP VALUE` — the enum addition
is one-way.

### Round namespacing

Add `G_ROUND_OFFSET = 300`. `bracketOfRound()` must test `>= 300` **before** the `>= 200`
grand-final test — today `bracketOfRound(301)` returns `"GF"`, so every group match would
render as a grand final. **This exists in two codebases**: `packages/shared/src/bracket.ts:26-30`
and the hand-maintained Kotlin port at `TournamentBracket.kt:28-32`, each with its own
tests. Band headroom is fine — a 9-player group occupies 301–309 and nothing lives above 300.

---

## Client surface (corrected)

`BracketKey` is a closed union — adding `"G"` is a **typed breaking change** across
`bracket.ts:24`, its `Record` at `:33`, the Kotlin enum at `TournamentBracket.kt:25`, and
admin's `BRACKET_LABEL`. TypeScript enforces the additions; Kotlin does not.

**Format-string equality is the main hazard.** `=== "DOUBLE_ELIM"` appears in at least
five places — `tournament-live.ts:126`, `web types.ts:47`, `BracketView.tsx:289`,
`admin Tournaments.tsx:90`, `TournamentDetailScreen.kt:679`. All become false for the new
value, which un-titles the L/GF sections, switches wording to single-elim, and on Android
**turns off connector drawing entirely**. Every one must become a predicate over "has a
losers bracket", not a string comparison.

If group matches reached today's clients they would **not crash** — they would be coerced
into the winners section (`BracketView.tsx:294` defaults to `"W"`), so five columns would
all read "Grand Final", the real upper-bracket final would lose its name, and
`layoutBracket` would hit its malformed-ratio fallback and stack 60px cards at 27px pitch
starting at y = −17. Android degrades identically.

Other corrections:

- **`roundLabel` is fine for S≤16** — it labels by distance from the end of the rounds
  actually present, so a skipped W1 self-corrects. The real bug is the numbered fallback
  at `bracket.ts:74` using the raw round number, wrong at S≥32. One-line fix, in both
  languages.
- **`myMatch.roundLabel` is computed server-side** (`tournament-live.ts:126`) and would
  read "Grand Final" for every group fixture on both clients.
- **Web already has a `StandingsTable`** (`TournamentDetailPage.tsx:62-116`) with a live
  client-side W/L tally — export and widen it rather than writing one. Android has
  nothing to reuse; there it genuinely is new UI.
- **`isStandingsFormat` gates the bracket off entirely** (`TournamentDetailPage.tsx:422`).
  A group format needs both, so the phase switch belongs in `TournamentDetailPage`, not
  inside `BracketView` as v1 placed it.
- **Live qualification bands contradict `groupPlacement`**, which is only written at
  group-stage completion. Compute standings live client-side (web already does) or add an
  endpoint.
- **Android DTOs must declare new fields explicitly** — `ignoreUnknownKeys = true`
  (`ApiClient.kt:26`) means server additions are silently dropped, so the group UI would
  render empty with no error.
- **Admin's format list is hardcoded** in seven places and propagates nothing
  automatically. The SWISS-only `rounds` field is the exact conditional-field precedent to
  copy for `groupCount`/`qualifiersPerGroup`.
- `FORMAT_LABEL` is a total `Record`; a missing entry renders a bare `" · Starts …"` on
  the tournaments page, the detail page **and the home page**.

---

## Test plan

1. `bracketOfRound(301) === "G"`, not `"GF"` — in **both** TS and Kotlin.
2. Every validation rule, each with a failing shape.
3. Snake draft: every player assigned exactly once.
4. Cross-group pairing: no same-group match in upper round 1 **and none in upper round 2**
   (the v1 defect).
5. **Full-tournament simulation** at 12 and 18 players, scripted deterministically:
   every match resolves, exactly one champion, gold conserved. Assert placements are
   *consistent with the tie/gap contract* — **not** a dense permutation, which
   `computeDoubleElimPlacements` never produces.
6. Zero-generation: two concurrent final-group-match reports still produce exactly one
   bracket, and the recovery pass heals a deliberately stranded cup.
7. Pre-seeded L1 matches are `status: "ready"`, not `"pending"`.
8. Three-way head-to-head cycle inside a group still yields a total order.

---

## What shipped

Server: `apps/server/src/modules/tournament-groups.ts` (start, progressive group
rounds, the cut, playoff seeding, recovery, placements), with the pure helpers in
`lib/tournament-bracket.ts` (`groupStageShape`, `snakeDraftGroups`,
`seedPlayoffFromGroups`, `groupStageSchedule`, `groupRoundCount`). Dispatch added to
`startTournament`, `reportResult` and `completeTournament`; recovery hung off both
Complete and the ready-check sweeper. Admin validation enforces the shape rules and a
120-match cap.

Clients: web and Android both render per-group standings with qualification bands plus
the bracket; admin gained the format, the conditional shape fields and a live match
count. Connector lines are suppressed for the group section on both clients — a round
robin's columns are a schedule, not a feeder tree.

Verification: 640/640 server tests, 389/389 Android unit tests, web and admin typecheck
clean. The load-bearing test plays a 12-player cup from the first group fixture to a
champion through the real `reportResult` path and asserts the declared prize pool is
distributed in full.

## Still open

- **B5 — partly closed.** The organiser start timer (`Tournament.startWindowSec`, null =
  off) now starts a fixture's clock from the moment it becomes playable rather than from
  a player's Ready, so **two absent players no longer block a round** — the deadline
  expires and the better seed advances. What remains unbuilt is *notification*: nothing
  tells a player their clock is running, because there is no push infrastructure. A
  player who never opens the app can still be forfeited without warning, which is the
  argument for setting a generous start window (hours, not minutes) on a casual cup.
- **No scheduled match times.** Fixtures still have no appointment; the timer bounds how
  long one can sit, it does not tell players when to be there.
- **Bo3.** This is a Bo1 implementation throughout.
- **Collusion in the final group round.** All fixtures in a round are live
  simultaneously, but nothing forces them to be *played* simultaneously, so a pair can
  hold their game until they know exactly what result eliminates a third player. TI
  mitigates this by playing the last round at the same time; we cannot, without
  scheduling.
- **Losers-bracket rematches.** `losersDropSlot` uses an index-aligned mapping that is
  documented as not guaranteeing zero rematches. First-round separation is enforced;
  later drop rounds are not.
