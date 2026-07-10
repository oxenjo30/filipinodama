# Math Dama (Damath Mode) — Design

**Date:** 2026-07-10 · updated after multi-agent review (41 agents; 31 findings verified)
**Status:** **Approved & unblocked — ready for Phase 1.** Official operator board + Whole chip values now
embedded (§5.1, B1 resolved). Rules/scoring/timer/anti-stall/matchmaking decisions resolved (§12).
**Internal mode id:** `damath` · **Display name:** `Math Dama` · **Subtitle:** `Dama with math scoring`

## 1. Summary

Add a playable **Damath**-style mode to FilipinoDama as a **fully isolated ruleset** alongside
Classic Dama. Damath uses the official 8×8 operation board, numbered chips, mandatory captures,
score-by-operation, dama promotion, move/game timers, and **winner-by-score**. Classic Dama is
**not modified** — Damath is purely additive.

Damath shares *patterns and UI chrome* with Classic (perfect 8×8 grid rendering, flip support,
server-authoritative online loop shape, zustand store shape) but shares **no code**: it has the
opposite board parity, a different piece/turn/score model, and a score-based winner. Reuse is by
composition, never by importing Classic's engine.

### MVP scope (approved)

- **Variant:** `whole` (Whole Numbers) only is playable. All other variants ship as locked data
  ("Coming Soon"/Beta) in the variant registry.
- **Opponents:** Local pass-and-play, **vs-AI**, and **Online** (server-authoritative).
- **Online rewards:** **Unranked, no economy payout at launch.** `DamathMatch` rows persist
  (scores, winner, history) for replay/stats. No trophies/gold/ELO. Balancing comes after play data.

## 2. Official rules grounding (researched)

Per official DepEd Damath rules (FilipiKnow, Wikipedia, DepEd Bohol "Rules of Damath", damath.ph):

- **24 chips total, 12 per player**, on the dark squares of the **first three rows** each side.
- **Chip count and physical board setup are identical across ALL levels.** Only the **number system
  printed on the chips** changes between Elementary and Secondary. (FilipiKnow, verbatim: *"The
  physical board setup and chip count remain constant; only the number systems differ."*)
- Elementary/Secondary is therefore a **purely organizational grouping** in the UI + a label for the
  number system a variant teaches. It introduces **no rules or piece-count branching.**
- **Game ends** on the 20-minute time limit, a player having no chips / no legal move (trapped), or
  repetitive moves. **The winner is the player with the highest total score — never by elimination.**
- **End-of-game chip bonus (official):** at game end, each player **adds the values of their own chips
  still on the board to their score, with remaining dama chips doubled.** (Wikipedia, verbatim:
  *"Each player also scores the value of their pieces remaining on the board at the end of the game,
  with dama pieces again scoring double."* FilipiKnow and damath.ph agree.) This is applied in §5.4.

| Level | Grade | Variant | Number system | MVP |
|---|---|---|---|---|
| Elementary | I–II | Counting | Counting numbers | locked |
| Elementary | III–IV | **Whole** | Whole numbers | **enabled** |
| Elementary | V–VI | Fraction | Positive fractions | locked |
| Secondary | Y1 | Integer | Integers (signed) | locked |
| Secondary | Y2 | Rational | Signed fractions | locked |
| Secondary | Y3 | Radical | Radicals | locked |
| Secondary | Y4 | Polynomial | Polynomials | locked |
| Secondary | — | Binary | Binary | locked |

**Sources:**
[FilipiKnow](https://filipiknow.net/damath-board/) ·
[Wikipedia](https://en.wikipedia.org/wiki/Damath) ·
[DepEd Bohol Rules PDF](https://depedbohol.org/v2/wp-content/uploads/2014/09/Rules-of-Damath.pdf) ·
[damath.ph](https://damath.ph/rules/)

## 3. Existing codebase (integration context)

- Monorepo (pnpm + turbo): `packages/game-engine` (pure TS rules, vitest), `packages/shared`
  (types), `apps/web` (React/Vite/zustand), `apps/server` (Fastify + socket.io + Prisma).
- **Classic engine** = `packages/game-engine/src/engine.ts` (+ `ai.ts`), exported via `index.ts`.
  Coords `{r,c}`, playable ⇔ `(r+c)%2===1`. Red bottom (rows 5–7, moves up), Blue top (rows 0–2,
  moves down). Already implements: forced-max-capture, flying kings, backward man capture, mid-chain
  promotion-stops-turn, threefold/inactivity draws.
- **Web game loop:** `apps/web/src/stores/gameStore.ts` (zustand) + `components/Board.tsx`. Routes in
  `App.tsx`: `/play` hub → `/play/ai` setup → `/play/ai/game`; `/play/local`.
- **Online:** `apps/server/src/realtime/match.ts` holds one authoritative `GameState` per match,
  validates every `EV.matchMove` via the engine, settles via trophy/gold ledger. Prisma `Match`
  model is Classic-shaped (winner color, no scores).

**Coordinate reconciliation:** Damath uses `{x,y}` (x=col 0–7 L→R, y=row 0–7 top→bottom), the
opposite parity from Classic (Damath playable ⇔ `(x+y)%2===0`). Because the two engines share no
code, Damath keeps the spec's `{x,y}` convention verbatim — zero translation of provided types.

## 4. Architecture

Pure logic lives in `game-engine`; web + server import the **same** validator/scorer.

```
packages/game-engine/src/damath/
  damathTypes.ts          # DamathOperator, DamathVariant, PlayerId, DamathPiece, DamathScoreEvent,
                          #   DamathMoveRecord, DamathLegalMove, DamathGameState, DamathRuleOptions
  damathBoard.ts          # DAMATH_OPERATOR_BOARD, isPlayable(x,y)=(x+y)%2===0, board invariants
  damathPieces.ts         # DAMATH_PIECE_VALUES + DAMATH_SECONDARY_PIECE_VALUES, variant registry
                          #   (level, enabled/locked, scoring kind), createDamathPieces, getPlayableColumns
  damathScoring.ts        # calculateNumericDamathScore, fraction scorer, div-by-zero-safe, multipliers
  damathMoveGeneration.ts # getLegalDamathMoves / getAllLegalDamathMoves (mandatory capture,
                          #   max-capture, dama-priority, flying dama, per-jump landing operator)
  damathRules.ts          # DAMATH_RULE_OPTIONS, applyDamathMove, checkDamathEnd + winner
  damathState.ts          # createInitialDamathState, timer helpers
  damathAi.ts             # score-greedy + 1-ply opponent lookahead (easy/normal/hard)
  index.ts                # re-exports; wired into game-engine top-level index.ts (additive)
packages/game-engine/test/damath.test.ts   # 40 Damath unit tests (test #41 = Classic suite, untouched)
```

**Hard invariant:** Classic's `engine.ts`, `ai.ts`, shared `game.ts`, and existing tests are **not
edited**. Test #30 ("Classic tests still pass") is satisfied by not touching them and running the
full suite.

### Phasing (each phase independently verifiable)

1. **Core engine** — types, board, pieces, scoring, move-gen, apply, end/winner + 29 unit tests.
2. **Local UI** — Damath mode card, two-step Elementary/Secondary → variant select, `damathStore`,
   `DamathBoard`/`DamathPiece`/`DamathScorePanel`/`DamathMoveHistory`, timers. Pass-and-play works
   end-to-end.
3. **vs-AI** — plug `damathAi` into `damathStore`.
4. **Online** — server-authoritative Damath match type (parallel to Classic's `match.ts`), scores
   persisted via new `DamathMatch` model.

## 5. Engine internals

### 5.1 Board & coordinates
`{x,y}`; `DAMATH_OPERATOR_BOARD[y][x]` gives the operator. Playable ⇔ `(x+y)%2===0`. Every playable
square has an operator; every non-playable is `null` (asserted as an invariant — tests #2, #3). Red
= bottom (y=5,6,7, moves −y), Blue = top (y=0,1,2, moves +y), mirroring Classic's seat convention.

All type definitions, `getPlayableColumns`, and `createDamathPieces` follow the shapes in §6.

#### `DAMATH_OPERATOR_BOARD` (official — B1 resolved)

Row-major, `board[y][x]`, `y=0` at the **top** (Blue home rows). Transcribed from the official Damath
operation board. `null` = non-playable (grey) square; operators sit only on playable squares
(`(x+y)%2===0`). The layout is a **4-row repeating block** (rows 0–3 repeat as rows 4–7), which is the
canonical DepEd arrangement and the invariant tests should assert.

```ts
// x:   0    1    2    3    4    5    6    7
const DAMATH_OPERATOR_BOARD: (DamathOperator | null)[][] = [
  ['×',  null, '÷',  null, '−',  null, '+',  null], // y=0
  [null, '÷',  null, '×',  null, '+',  null, '−' ], // y=1
  ['−',  null, '+',  null, '×',  null, '÷',  null], // y=2
  [null, '+',  null, '−',  null, '÷',  null, '×' ], // y=3
  ['×',  null, '÷',  null, '−',  null, '+',  null], // y=4  (= y=0)
  [null, '÷',  null, '×',  null, '+',  null, '−' ], // y=5  (= y=1)
  ['−',  null, '+',  null, '×',  null, '÷',  null], // y=6  (= y=2)
  [null, '+',  null, '−',  null, '÷',  null, '×' ], // y=7  (= y=3)
]
```

Invariants to assert (tests #2, #3, and the exact-operator test): exactly 32 non-null cells; every
non-null cell satisfies `(x+y)%2===0`; every `(x+y)%2===0` cell is non-null; each cell equals one of
`+ − × ÷`; and `board[y]` deep-equals `board[y+4]` for `y∈{0,1,2,3}` (the repeating-block invariant).

#### Whole variant chip values + placement (official — B1 resolved)

**Enabled MVP variant = Whole (Grades 3–4).** Each player has **12 chips valued `{0..11}` exactly once**.
Official placement order (left→right, top→bottom across the 3 home rows, matching the official piece
sheet's 3×4 layout) is:

```
row A: 9  6  1  4
row B: 0  3 10  7
row C: 11 8  5  2
```

`createDamathPieces` fills each side's 3 home rows on the **playable** squares in reading order with the
sequence `[9,6,1,4, 0,3,10,7, 11,8,5,2]`:
- **Blue (top):** row A→`y=0`, row B→`y=1`, row C→`y=2`; within each row, values map left→right onto that
  row's playable columns (`getPlayableColumns(y)`).
- **Red (bottom):** the same value sequence on `y=5,6,7`, mirrored so the arrangement is point-symmetric
  to Blue (standard Damath — both players see their own `9,6,1,4` on their front-facing home row).

Test #4/#5 (counts) plus a new **exact value-multiset-and-placement** test assert the full mapping — not
just "12 pieces per side" — so a mis-transcribed value can't pass silently.

> **Locked variants (not built for MVP, data recorded for the registry):** Counting `{10,7,2,5,1,4,11,8,
> 12,9,6,3}`; Fraction (all `/10`): `{10,7,2,5,1,4,11,8,12,9,6,3}/10`; Integer `{-9,6,-1,4,0,-3,10,-7,-11,
> 8,-5,2}`; Rational (all `/10`): `{-9,6,-1,4,0,-3,10,-7,-11,8,-5,2}/10`; Radical and Polynomial are
> symbolic (values recorded from the official sheet but their scorers stay **disabled** per §5.3, §11).

### 5.2 Move generation (`damathMoveGeneration.ts`)
Damath-specific capture-chain recursion (not Classic's — coords, piece shape, and per-step operator
differ). Produces `DamathLegalMove` carrying the full path, ordered captured-piece ids, and the
**per-jump landing operator** so scoring always reads the landing square, never the origin. Rules
(all driven by `DAMATH_RULE_OPTIONS`):

- Regular man: quiet move **forward only**; **captures forward AND backward**
  (`allowBackwardCaptureForRegularPiece`).
- Flying dama: moves/captures any distance along a diagonal; capture valid iff exactly one enemy on
  the ray with ≥1 empty landing beyond; dama may choose among landing squares (matches Classic
  flying-king semantics; `allowFlyingDama`).
- **Mandatory capture** (`mustCapture`): if any capture exists, quiet moves are dropped.
- **Max-capture** (`mustTakeMaximumPieces`): keep only sequences capturing the most **pieces**
  (count — NOT score). *Scoring never influences legality*, even if the forced max-capture lowers
  your score.
- **Dama-capture priority** (`damaCapturePriority`): when both a dama-capture and a man-capture
  survive max-capture, keep only dama-initiated sequences.
- Multi-capture continuation is baked into the recursion (one `DamathLegalMove` = the whole chain).
- **Mid-chain promotion stops the turn** (Classic parity — a deliberate, documented choice).

### 5.3 Scoring (`damathScoring.ts`)
Only on capture. `base = capturingValue [landingOp] capturedValue`, then `× multiplier`:
man×man=1, dama×man=2, man×dama=2, dama×dama=4. Score credits the capturing player. **The multiplier
doubles whenever a dama is involved on *either* side** (capturer or captured) and quadruples when both
are dama — per damath.ph (verbatim: *"When a Dama eats a normal chip OR a normal chip eats a Dama, the
score will be doubled (×2)… When a Dama eats another Dama, the score will be quadruple (×4)."*) and
Wikipedia. This is a **fixed official rule, not configurable** — earlier drafts set `man×dama=1`, which
was a rule error (a man capturing a dama still doubles).

- **Div-by-zero:** if `÷` and captured value is `0` → base `0` + `division-by-zero-safe-score` note.
  Configurable for tournament rules.
- **Division results (numeric variants):** engine stores the **exact float** (e.g. `7÷3=2.333…`) so
  running totals stay accurate; **UI rounds to 2 decimals for display only.**
- **Multi-capture chain:** each jump scored against **its own** landing operator and summed; **each
  jump emits its own `DamathScoreEvent`** so history reads jump-by-jump.
- **End-of-game chip bonus** is a distinct, non-capture score source (§5.4): `DamathScoreEvent` carries
  a `kind` discriminator (`capture | end-of-game-chip-bonus`) so the bonus renders separately from
  captures. Bonus events have no operator — they sum remaining chip values (dama ×2), not an operation.
- Whole/counting/integer → numeric scorer. Fraction/rational → fraction scorer (kept, variant
  locked for MVP). Radical/polynomial → symbolic string, **disabled**.
- Score preview in the UI calls this **same** function — no scoring logic is duplicated in React.

### 5.4 Turn flow & game end (`damathRules.ts`)
`applyDamathMove(state, move)` executes the whole chosen chain: remove captured pieces, move the
piece, append per-jump score events + a `DamathMoveRecord`, apply promotion, switch player
(continuation already inside the single move). Pure/immutable (returns a new state).

`checkDamathEnd` ends on: **per-player clock expiry**, no legal move, no pieces, **threefold repetition**,
**inactivity limit**, resign, manual.

**Timers (per-player, server-authoritative).** Each player has an **independent 20-minute game clock**
(mirrors real DepEd Damath and the existing `GameState.clocks?: {red, blue}` / `GameSettings.moveTimerSec?`
shape — reuse the pattern, not the Classic code). A player's own clock counts down only on their turn;
when a player's clock hits **0** the game ends and the winner is decided by **final score** (§below),
*not* an automatic loss for the flagged player. **Move timer: 30 s per turn** (a `DamathRuleOptions`
field, default `30`). On **move-timer expiry the turn is forfeited to the opponent** — the player is
*not* auto-moved and does *not* lose the game (auto-move is impossible under mandatory capture anyway);
their game clock simply keeps whatever time remained. `DamathGameState` carries `clocks: {red, blue}`
(ms remaining), `moveDeadline` (ms), and `activeSince` for authoritative countdown. **No increment/Fischer
bonus** at launch.

**Anti-stall (threefold / inactivity).** Because winner is by score at clock expiry and flying dama can
shuffle indefinitely, Damath detects **threefold repetition** and an **inactivity limit** (N plies with
no capture — reuse Classic's `drawMoveLimit=40` value as the Damath default). Unlike Classic, these do
**not** force a draw: they **end the game and decide by current final score** (captures + end-of-game
chip bonus), so a leading player cannot convert a stall into a timer win and a trailing player cannot
force a draw by shuffling. Equal final score is still a draw.

**End-of-game remaining-chip bonus (official DepEd rule).** When the game ends by any **non-resign**
condition, each player's capture total is finalized by **adding the values of that player's own chips
still on the board**, with **remaining dama chips counted double**:

```
finalScore(player) = captureScore(player)
                   + Σ value(remaining man of player)
                   + Σ value(remaining dama of player) × 2
```

This is computed once by `checkDamathEnd` (pure), emitted as its own `DamathScoreEvent` per player
(kind `end-of-game-chip-bonus`) so the UI can reveal the bonus separately from capture points. It is
**not** applied on resign (the resigning side loses outright regardless of totals). Sources:
[FilipiKnow](https://filipiknow.net/damath-board/), [Wikipedia](https://en.wikipedia.org/wiki/Damath),
[damath.ph](https://damath.ph/rules/) — all state remaining chips are added to the final score and
remaining dama are doubled.

**Winner is by FINAL SCORE for ALL non-resign ends** (approved): after the remaining-chip bonus is
added, higher final score wins; **equal = draw** — independent of raw piece/dama count, and
independent of who is blocked or eliminated. (A player with no legal move or no pieces does **not**
auto-lose; the bonus is added to whatever chips they still have — which for an eliminated player is
zero — and final score totals decide.) Resign = the resigning side loses outright, no bonus applied.

### 5.5 AI (`damathAi.ts`)
**Score-greedy + 1-ply opponent check** (approved): among all legal (forced) move sequences, pick
the one maximizing `(my score gain − opponent's best immediate reply gain)`. Deterministic; plays
Damath sensibly (won't blindly take score-losing captures / div-by-zero traps that hand the
opponent points). Easy/Normal/Hard tune lookahead depth / randomness. Deeper minimax is a later
"Hard" upgrade, out of scope now.

## 6. Data model & types

- All Damath types live in `game-engine/src/damath/damathTypes.ts`, re-exported so `apps/web` and
  `apps/server` import identical definitions. **No Damath types are added to shared `game.ts`.**
- Types taken verbatim from the task spec: `DamathOperator`, `DamathVariant`, `PlayerId`,
  `DamathPiece`, `DamathScoreEvent`, `DamathGameState`, `DamathMoveRecord`, plus `DamathLegalMove`,
  `DamathRuleOptions`, `DamathScoreCalculationParams`, `DamathScoreResult`.
- Engine API (verbatim signatures): `getLegalDamathMoves`, `getAllLegalDamathMoves`,
  `applyDamathMove`, `calculateDamathScore`, `createInitialDamathState`.

## 7. Server (online, server-authoritative)

- **Events:** add Damath event constants to `@dama/shared` events (e.g. `damathJoin`, `damathMove`,
  `damathState`, `damathEnd`) — additive; Classic events untouched.
- **Match loop:** new `apps/server/src/realtime/damath-match.ts` with a `LiveDamathMatch` map. Server
  holds the one true `DamathGameState`, validates each intent via shared
  `getAllLegalDamathMoves`/`applyDamathMove`, broadcasts new state + scores. Mirrors Classic's
  server-authoritative structure and abandon/resign guards, but is its **own file** so Classic's
  loop is never destabilized.
- **Matchmaking (in MVP — approved).** Online Damath needs its own pairing path: Classic's
  `realtime/matchmaking.ts` hardwires `QueueMode = "CASUAL" | "RANKED"` and rejects anything else
  (`mmCancelled("invalid-mode")`), and `match.ts` is only the in-match loop. Add a **`DAMATH_CASUAL`
  queue** (extend `matchmaking.ts` with an additive branch, or a parallel `damath-matchmaking.ts`) that:
  pairs two waiting Damath players, **assigns colors** (first-joiner Red by convention, matching Classic),
  **creates the `DamathMatch` row at pairing** and hands the match id to `damath-match.ts`. **Empty-queue
  behavior:** since Damath is **unranked**, there is no trophy-tier bot selection like Classic's — so on
  an empty queue show a plain **"waiting for opponent"** state (optionally offer a "play the AI instead"
  fallback that drops into local vs-AI), **not** an auto bot-fill. Reconnection/abandon/resign guards
  mirror Classic's in `damath-match.ts`.
- **Persistence:** new Prisma **`DamathMatch`** model (players, variant, redScore, blueScore, winner,
  endReason, `scoreHistory` JSON, **`moveHistory` JSON**, timestamps) via a new migration. `redScore`/
  `blueScore` store the **final** totals **including the end-of-game chip bonus** (§5.4); the pre-bonus
  capture totals and the bonus itself are recoverable from `scoreHistory` (which includes the
  `end-of-game-chip-bonus` events). **`moveHistory`** (the `DamathMoveRecord` list) is the replay source
  of truth — score events are derivable from it, and board replay (Classic-style) needs the moves, not
  just formulas (m8). Score columns are stored as the engine's exact values with the §5.3 float/2-dp
  display contract documented. Classic `Match` table untouched.
- **No economy hooks at launch** (unranked). Result rows persist for replay/stats only.

## 8. Client (UI, store, rendering)

- **Store:** new `damathStore.ts` (zustand), parallel to `gameStore.ts` — never merged. Holds live
  `DamathGameState`, selection, legal-target highlights, forced-capture flag, timers, and mode
  (`local | ai | online`). `ai` calls `damathAi`; `online` is a thin client over the socket events
  (server-authoritative, sends intents only).
- **Routing (additive; Classic routes untouched):**
  - "Math Dama" card added to `PlayHubPage` (title "Math Dama", subtitle "Dama with math scoring",
    description "Capture pieces, solve operations, and win by score.", **Educational** badge) →
    `/damath`.
  - `/damath` — **two-step selector:** pick **Elementary** or **Secondary**, then a variant within
    it. Whole = enabled; all others show **Coming Soon** (locked, from the variant registry). The
    Secondary level is **selectable** and reveals its 5 variants, all Coming Soon. Then pick opponent
    (Local / vs-AI / Online) reusing existing setup patterns.
  - `/damath/game` — the Damath game screen.
- **Board (`DamathBoard.tsx`, `DamathPiece.tsx`):** a **new** component (not a reskin of `Board.tsx`)
  because of opposite parity + operator glyphs. Reuses `Board.tsx` techniques (perfect 8×8 grid,
  centered pieces, flip support). Shows: faint operator on each playable square; inert non-playable
  squares; chip value clearly; **dama** crown/glow/"D"; selected piece; legal destinations; a
  **forced-capture warning** when a quiet move is attempted while a capture exists; a **score preview**
  before confirming a capture (`7 × 3 = 21`); a **`+21` animation** after.
- **Panels (`DamathScorePanel.tsx`, `DamathMoveHistory.tsx`):** live Red/Blue score, current turn,
  remaining game time + move timer; scrollable jump-by-jump history, e.g. `Red: 7 × 3 = 21`,
  `Blue Dama: 10 + 5 = 15 × 2 = 30`, `Red Dama vs Dama: 6 × 4 = 24 × 4 = 96`.
  - **Own-score emphasis:** the panel visibly marks the viewing/active player's own total (a "You"
    label + emphasis) so a player always knows which score is theirs — important in vs-AI and online,
    and for the active seat in local pass-and-play.
  - **End-of-game reveal:** when the match ends, the panel breaks the final total into
    `Captures + Chips on board = Final` per player (e.g. `Red — Captures: 84  + Chips on board: 22  =
    Final: 106`), surfacing the remaining-chip bonus (§5.4) as a teaching moment rather than a silent
    jump in the number. The bonus is read from the engine's `end-of-game-chip-bonus` score events —
    still **no scoring math in React.**
- **No hardcoded scoring in React** — components only render engine-produced values.

## 9. Testing (40 Damath tests + Classic suite = #41)

Board: 8×8 (#1); exactly 32 playable squares (#2); only `+ - × ÷ null` (#3) — **plus exact
operator-at-square assertions once B1 board is embedded**.
Setup: whole creates 24 pieces (#4); 12 each (#5); top on rows 0–2 (#6); bottom on rows 5–7 (#7) —
**plus exact value multiset + placement per side (not just counts)**.
Movement: forward diagonal (#8); no backward quiet move (#9); capture forward (#10) and backward
(#11); non-capture illegal when capture exists (#12); multi-capture continuation (#13); max-capture
filters shorter sequences (#14).
Dama: promotion (#15); moves over distance (#16); captures over distance (#17).
Scoring: uses landing operator (#18); add (#19); subtract (#20); multiply (#21); divide (#22);
div-by-zero no crash — **asserts exact scored value + note, not just no-throw** (#23); dama-captures-man
×2 (#24a); **man-captures-dama ×2** (#24b); dama-vs-dama ×4 (#25); score history created on capture
(#26); no score on normal move (#27).
**High-risk logic (M5):** multi-jump chain with **different operators per jump** summed, one event per
jump (#28); **flying-dama chooses among ≥2 landings with different operators** → correct legality +
score (#29); **dama-capture-priority interacting with max-capture** — a position where the two disagree
(#30); **mid-chain promotion halts the chain** and fixes the scored result (#31); **exact-float division
total equals the sum of the 2-dp displayed history lines** (m3) (#32).
End-of-game chip bonus: remaining chips add to final score (#33); remaining **dama** count double (#34).
Winner: higher **final** score (captures + chip bonus) wins (#35); **blocked-but-leading wins** / **no
pieces but leading wins** (#36); equal final score = draw (#37).
**Timers & anti-stall:** per-player clock expiry → game ends, **score decides** (not auto-loss) (#38);
**move-timer expiry forfeits the turn** to opponent, no auto-move, no game loss (#39); **threefold
repetition / inactivity ends the game and decides by final score** — leading stall cannot become a timer
win (#40).
**#41: Classic Dama tests still pass unchanged** (run full `turbo run test`).

## 10. Acceptance criteria

- Start Math Dama from mode selection; Whole loads the exact operation board + official chip values.
- Pieces move per dama rules; captures mandatory; score uses landing-square operator; scores update
  immediately; history shows the formula.
- Dama promotion + score multiplier work; game ends correctly; **winner by final score**.
- At any non-resign game end, each player's **remaining chips are added to their score (dama doubled)**;
  the score panel reveals this bonus, and the winner is decided on the resulting **final** totals.
- **Classic Dama is not broken.**

## 11. Explicit non-goals (from the "Do not" list)

Do not replace/modify Classic Dama. No scoring inside React components. Never score from the starting
square (always landing operator). Never allow non-capture when capture exists. Never ignore
multi-capture continuation. Winner is never by remaining pieces alone. Radical/polynomial stay
disabled until symbolic scoring exists. No official PDF artwork — recreate the board from the matrix.

## 12. Open decisions

**Resolved:**

- Scope: **Local + vs-AI + Online**, all server-authoritative. **Online stays in MVP** and gets its own
  `DAMATH_CASUAL` matchmaking queue (§7); empty queue → "waiting for opponent" (no bot-fill; unranked).
- Engine location: **`game-engine/src/damath/`**; coords **`{x,y}`** per spec.
- Non-resign ends (incl. blocked / no-pieces): **decided by FINAL score** = captures **+ end-of-game
  remaining-chip bonus (own chips, dama ×2)** (§5.4); equal = **draw**. Resign = outright loss, no bonus.
- **Scoring multipliers (official):** any dama involved = ×2, both dama = ×4 → `man×man=1, dama×man=2,
  man×dama=2, dama×dama=4` (§5.3). Earlier `man×dama=1` was a rule error, now corrected.
- **Timers: per-player 20-min game clock** + **30 s move timer**; move-timeout **forfeits the turn**
  (no auto-move, no loss); clock expiry → score decides. No increment. (§5.4)
- **Anti-stall:** threefold repetition + inactivity (40-ply) **end the game and decide by final score**
  (not a forced draw), closing the leading-player stall-to-win exploit. (§5.4)
- **Persistence:** `DamathMatch` stores final scores (incl. bonus) + `scoreHistory` + **`moveHistory`**
  (replay source of truth). (§7)
- Division (numeric variants): **exact float in engine, 2-dp display rounding**; displayed history must
  sum to the displayed total (test #32).
- Level selector: **two-step Elementary → Secondary → variant**; Secondary selectable, all Coming
  Soon; Whole is the only enabled variant. Elem = Counting/Whole/Fraction; Sec =
  Integer/Rational/Radical/Polynomial/Binary. **Piece count is identical across levels** (24/12).
- Damath AI: **score-greedy + 1-ply opponent check**, difficulty-tuned.

- ✅ **B1 — operator board + chip values RESOLVED:** official `DAMATH_OPERATOR_BOARD` and the Whole
  variant's `{0..11}` values + placement are embedded in §5.1 (with locked-variant values recorded for
  the registry). Phase 1 is unblocked.

**Still open (small; can be settled at Phase-1 start):**

- ⚙️ **Damath type location (m1):** recommend a **new `shared/src/damath.ts`** (additive; does not touch
  `game.ts`, so isolation holds) to match the repo's types-in-`shared` convention, rather than
  game-engine. Confirm before Phase 1 freezes the type file.
- ⚙️ **AI difficulty params (m2, Phase 3):** define concrete Easy/Normal/Hard behavior (blunder-rate
  approach mirroring Classic's `BLUNDER={easy,normal,hard}`); resolve "deterministic vs randomness."
