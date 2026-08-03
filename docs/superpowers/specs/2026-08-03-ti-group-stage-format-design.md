# TI-style tournament format: round robin groups → double elimination

Status: **spec, not yet implemented**
Owner decision: 2026-08-03 — "Configurable per cup"
Requested: "round robin eliminates 2 players depending on the size of the tournament.
once all round robin is completed, we move to the group stages, the top N is in the
upper bracket and the below N are in the lower bracket. This is the game mechanics
used by the dota2 the international."

---

## Problem

`TournamentFormat` today is:

```prisma
enum TournamentFormat {
  SINGLE_ELIM   // V1
  DOUBLE_ELIM   // reserved — V2
  SWISS         // reserved — V2
  ROUND_ROBIN   // reserved — V2
}
```

Only `SINGLE_ELIM` is wired end-to-end. There is no group-stage concept anywhere in the
codebase — no `groupIndex`, no pools, no phase transition.

A player can currently be knocked out of a cup by a single bad game against the one
opponent they happened to be seeded against. The TI format fixes that: everyone plays a
full round robin first, so seeding into the knockout is *earned* rather than drawn, and
even the knockout gives you a second life via the lower bracket.

## Goal

Add one new format that runs a group round robin, cuts the bottom of each group, and
seeds the survivors into a double-elimination bracket with the top half in the upper
bracket and the bottom half in the lower bracket.

---

## The load-bearing insight

This looked like it needed a bespoke bracket generator. It does not.

**TI's playoff bracket is a standard double-elimination bracket of size `S` with winners
round 1 already decided.** The group stage *is* winners round 1.

Check it against `losersBracketStructure(16)`, which this repo already implements:

| Standard B=16 double elim | TI 16-player playoff |
| --- | --- |
| W round 2 — 8 players, 4 matches | Upper bracket round 1 — 8 players, 4 matches |
| L round 1 — 8 W-R1 losers, 4 matches | Lower bracket round 1 — 8 players, 4 matches |
| L round 2 — 4 L-R1 winners vs 4 W-R2 losers | Lower bracket round 2 — same |
| …unchanged all the way to the grand final | …unchanged |

Exact structural match. So the implementation is:

> Build the ordinary `B = S` double-elimination bracket, **skip creating W round 1
> matches**, and seed the upper qualifiers straight into W round 2 and the lower
> qualifiers straight into L round 1.

`losersDropSlot`, `lWinnerAdvance`, `losersBracketStructure` and
`computeDoubleElimPlacements` then all work **completely unchanged**, because the
geometry really is a standard bracket. That is the difference between "write a new
bracket engine" and "add a seeding function".

### The constraint this forces

A standard W round 1 of size `S` produces exactly `S/2` winners and `S/2` losers.
Therefore:

- **Upper bracket size = lower bracket size = `S/2`. Not configurable — derived.**
- `S` (survivor count) must be a power of two.
- `qualifiersPerGroup` must therefore be even.

This is not a limitation we are choosing; it is what makes the existing machinery
apply. It also happens to be exactly what TI does (4 up, 4 down, of 8 qualifiers
per group).

---

## Configuration

Two new admin-settable fields, per the owner's "configurable per cup" decision:

| Field | Meaning |
| --- | --- |
| `groupCount` | How many round-robin groups |
| `qualifiersPerGroup` | How many survive each group |

Everything else is derived:

```
groupSize  = maxPlayers / groupCount
S          = groupCount * qualifiersPerGroup     // survivors → bracket size
upperSeats = S / 2                               // per whole field, not per group
lowerSeats = S / 2
eliminated = maxPlayers - S
```

### Validation (reject at create/update, `400 INVALID_GROUP_SHAPE`)

1. `maxPlayers % groupCount === 0` — groups must be equal size, or the round robin is
   unfair (a smaller group is an easier qualification).
2. `S` is a power of two and `S >= 4`.
3. `qualifiersPerGroup` is even — required for the S/2 upper/lower split.
4. `qualifiersPerGroup < groupSize` — at least one player must actually be eliminated,
   otherwise the group stage decides nothing and is pure filler.
5. `groupCount >= 1`.

Validation must run on **create and update**, and must be re-checked at start if
`maxPlayers` can change after creation.

### Shapes that pass

| maxPlayers | groups | groupSize | qual/group | S | Eliminated | Group matches | Playoff matches | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 18 | 2 | 9 | 8 | 16 | 2 | 72 | 22 | **94** |
| 20 | 2 | 10 | 8 | 16 | 4 | 90 | 22 | 112 |
| 16 | 2 | 8 | 4 | 8 | 8 | 56 | 10 | 66 |
| 12 | 2 | 6 | 4 | 8 | 4 | 30 | 10 | **40** |
| 10 | 2 | 5 | 4 | 8 | 2 | 20 | 10 | 30 |
| 9 | 1 | 9 | 8 | 8 | 1 | 36 | 10 | 46 |

Row 1 is literal TI: 18 entrants, two groups of nine, bottom one of each group out,
16 into the bracket.

> **Operational warning — read this before picking a shape.** Round-robin match count is
> quadratic: `groupSize * (groupSize - 1) / 2` *per group*. The true-TI shape costs **94
> matches** for 18 players. On a mobile game where each match needs both players present
> and ready, that is a very long-running cup. The 12-player shape at **40 matches** is the
> realistic default for a first outing. Admin UI should show the computed total match
> count live as the admin types, so nobody creates a 112-match cup by accident.

---

## Schema changes

```prisma
enum TournamentFormat {
  SINGLE_ELIM
  DOUBLE_ELIM        // reserved — still not implemented
  SWISS              // reserved — still not implemented
  ROUND_ROBIN        // reserved — still not implemented
  GROUP_DOUBLE_ELIM  // NEW — the TI format
}

model Tournament {
  groupCount         Int?   // required when format = GROUP_DOUBLE_ELIM, else null
  qualifiersPerGroup Int?   // required when format = GROUP_DOUBLE_ELIM, else null
}

model TournamentEntry {
  groupIndex     Int?   // 0-based; null until the cup starts
  groupPlacement Int?   // 1-based within the group; null until the group stage ends
}
```

`TournamentMatch` needs **no new columns** — it already has `round`, `slot` and
`bracket String @default("W")`.

### Round namespacing

The existing scheme partitions the round-number space:

| Range | Bracket |
| --- | --- |
| `< 100` | `W` winners |
| `>= 100` (`L_ROUND_OFFSET`) | `L` losers |
| `201` / `202` (`GF_ROUND` / `GF_RESET_ROUND`) | `GF` grand final |

Add one more band:

```ts
export const G_ROUND_OFFSET = 300;   // group stage: round 300 + r
```

`bracketOfRound()` must test `>= 300` **before** the `>= 200` grand-final test, or every
group match will be mislabelled as a grand final. This ordering is the single easiest
thing to get wrong in the whole change — it needs its own unit test.

Winners round 1 is **never** materialised for this format. The first real `W` round is 2.

---

## Phase 1 — group stage

### Group assignment: snake draft by seed

```
seeds 1..n sorted ascending, dealt across groups in serpentine order:
  group 0:  1,  4,  5,  8, ...
  group 1:  2,  3,  6,  7, ...
```

Straight dealing (`seed % groupCount`) stacks all the strong seeds into group 0 whenever
seeding is at all accurate. Snake balances group strength, which matters here because
qualification is per-group: an unbalanced draw eliminates a stronger player than it
should.

### Fixtures

`roundRobinSchedule(groupSize)` already exists and produces circle-method pairings. Call
it once per group; store matches as `bracket = "G"`, `round = 300 + r`, and namespace
`slot` per group so slots never collide:

```
slot = groupIndex * matchesPerRound + slotWithinGroup
```

Odd `groupSize` yields a bye each round — `roundRobinSchedule` already handles this, and
byes must count as neither a win nor a loss.

### Standings and tie-breaks

Reuse `computeRoundRobinStandings` **unchanged**, called once per group. It already ranks:

1. **Wins**, descending.
2. **Head-to-head** among the players tied on wins — including correct handling of a
   3-way cycle, where it falls through rather than looping.
3. **Seed**, ascending, as the final deterministic fallback.

Because the round robin is *within* a group, every tied pair has necessarily played each
other, so head-to-head is always defined for 2-way ties. This is exactly the situation
the function was written for. **No new tie-break logic is needed** — which is worth
stating plainly, because arbitrary bracket seeding from ambiguous standings would be the
most likely source of "why did I get the lower bracket?" complaints.

Write `groupPlacement` onto each entry when the group stage completes.

---

## Phase 2 — the cut and the seeding

Trigger: **every** `bracket = "G"` match has `status = "done"`. Run the transition inside
the same transaction that completes the final group match, so two concurrent match
completions cannot both generate the playoff bracket. Guard with a uniqueness check —
"do any `bracket = "W"` matches already exist for this tournament?" — as a belt-and-braces
second line of defence.

### Who goes where

For each group, ordered by `groupPlacement`:

```
placements 1 .. q/2           → UPPER bracket   (q = qualifiersPerGroup)
placements q/2+1 .. q         → LOWER bracket
placements q+1 .. groupSize   → ELIMINATED
```

With TI's numbers (q=8, groupSize=9): 1–4 upper, 5–8 lower, 9th out. Matches the request
exactly.

### Cross-group pairing

Same-group players must **not** meet in the first playoff round — they just played a full
round robin against each other, and an immediate rematch makes the group stage feel
pointless. Pair each group's placement-`i` player against another group's
placement-`(q/2 + 1 - i)` player, rotating group offsets so with more than two groups the
crossing still alternates.

With two groups, upper bracket round 1 becomes:

```
A1 vs B4      A2 vs B3      B1 vs A4      B2 vs A3
```

Strongest qualifier meets weakest qualifier, never from their own group. Lower bracket
round 1 uses the same crossing over placements q/2+1..q.

### Final placements

- Playoff finishers: `computeDoubleElimPlacements` — unchanged, returns 1..S.
- Group-stage eliminations: ranked below every playoff finisher, i.e. placements
  `S+1 .. maxPlayers`, ordered by `groupPlacement` ascending, then wins descending, then
  seed ascending. Two players knocked out in the same group position tie-break by their
  actual group record, not by group index — group index is an arbitrary artefact of the
  draw and must never affect a player's final standing or prize.

---

## Client surface

### Shared (`packages/shared/src/bracket.ts`)

- `G_ROUND_OFFSET`, and `bracketOfRound()` extended (with the ordering caveat above).
- `roundLabel()` gains group labels — "Group Stage — Round 3".
- `BRACKET_SECTION_LABEL` gains a `G` section.
- **`roundLabel()` must be checked for this format.** It currently names W rounds by
  distance from the final (Quarterfinals / Semifinals / Final). With W round 1 skipped,
  a naive implementation will label the first playoff round using the wrong round index
  and produce an off-by-one ("Semifinals" for what is really the quarterfinals). Label by
  *remaining players*, not by raw round number.

### Web (`apps/web/src/features/tournaments/`)

`BracketView` renders a single W-plus-L bracket today. It needs a phase switch: a group
standings table while `stage === "group"`, then the bracket. The group table needs
qualification bands — a visible line showing who is currently upper-bound, lower-bound,
and out, since that is the entire drama of a group stage.

### Android

Same two-phase treatment in the tournament detail screen. The bracket connector drawing
already matches the web (verified 2026-08-03: identical `.42` alpha, same shared
`roundLabel`), so only the standings table is genuinely new UI.

### Admin

Format picker gains the new option; `groupCount` and `qualifiersPerGroup` inputs appear
only for it, with live derived output: group size, survivors, upper/lower split,
eliminated count, and **total match count**.

---

## Test plan

Pure-function tests carry most of the weight here, because the bracket helpers are pure.

1. `bracketOfRound(301) === "G"` — and specifically **not** `"GF"`. Regression test for
   the ordering trap.
2. Validation: every rule above, each with a failing shape. Explicitly include
   `qualifiersPerGroup` odd, and `S` not a power of two.
3. Snake draft: balanced seed sums across groups; every player assigned exactly once.
4. Cross-group pairing: assert no upper-bracket-round-1 match contains two players from
   the same group, for 2 groups and for 4.
5. **Full-tournament simulation** — the one that actually proves it. Play a 12-player and
   an 18-player cup end to end with deterministic scripted results; assert every match
   resolves, exactly one champion emerges, and placements are a permutation of
   `1..maxPlayers` with no duplicates and no gaps. This is the test that would catch a
   bad `losersDropSlot` interaction.
6. Idempotent transition: fire the group-stage-complete handler twice, assert one
   bracket.
7. Three-way head-to-head cycle inside a group still produces a total order.

---

## Open questions for the owner

1. **Best-of.** TI's group stage is Bo2 (draws allowed) and its playoffs are Bo3/Bo5.
   Every match in this repo is a single game. This spec assumes Bo1 throughout, which
   keeps the change to seeding rather than match semantics. Bo3 is a much larger change —
   it touches match completion, the realtime layer, and the schema — and should be its
   own piece of work.
2. **Shape default.** I recommend seeding the admin form with the 12-player / 2-group /
   4-qualifier shape (40 matches), not true TI (94 matches), for the first live cup.
3. **Group-stage abandonment.** If a player no-shows mid-round-robin, do their remaining
   fixtures become forfeits (keeps standings comparable) or voids (distorts them)? The
   existing ready-check and auto-advance work is the natural place to hang this, and
   forfeits are almost certainly correct — a void lets a player manipulate a rival's
   win count by refusing to play.

---

## Cost

Roughly: shared bracket helpers small; server seeding and transition moderate; the real
work is the two-phase UI on web + Android + admin, and the simulation tests. The
double-elimination engine itself needs **no changes at all**, which is the bulk of what
this would otherwise have cost.
