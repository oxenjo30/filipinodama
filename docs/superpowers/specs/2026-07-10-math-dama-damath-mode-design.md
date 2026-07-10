# Math Dama (Damath Mode) — Design

**Date:** 2026-07-10
**Status:** Approved design, ready for implementation planning
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
packages/game-engine/test/damath.test.ts   # 29 Damath unit tests (test #30 = Classic suite, untouched)
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

`DAMATH_OPERATOR_BOARD` and all type definitions, piece-value tables, `getPlayableColumns`, and
`createDamathPieces` are taken **verbatim** from the task spec.

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
man×man=1, dama×man=2, man×dama=1 (configurable), dama×dama=4. Score credits the capturing player.

- **Div-by-zero:** if `÷` and captured value is `0` → base `0` + `division-by-zero-safe-score` note.
  Configurable for tournament rules.
- **Division results (numeric variants):** engine stores the **exact float** (e.g. `7÷3=2.333…`) so
  running totals stay accurate; **UI rounds to 2 decimals for display only.**
- **Multi-capture chain:** each jump scored against **its own** landing operator and summed; **each
  jump emits its own `DamathScoreEvent`** so history reads jump-by-jump.
- Whole/counting/integer → numeric scorer. Fraction/rational → fraction scorer (kept, variant
  locked for MVP). Radical/polynomial → symbolic string, **disabled**.
- Score preview in the UI calls this **same** function — no scoring logic is duplicated in React.

### 5.4 Turn flow & game end (`damathRules.ts`)
`applyDamathMove(state, move)` executes the whole chosen chain: remove captured pieces, move the
piece, append per-jump score events + a `DamathMoveRecord`, apply promotion, switch player
(continuation already inside the single move). Pure/immutable (returns a new state).

`checkDamathEnd` ends on: game timer expiry (20 min), no legal move, no pieces, resign, manual.

**Winner is by SCORE for ALL non-resign ends** (approved): higher score wins; **equal = draw** —
independent of piece/dama count, and independent of who is blocked or eliminated. (A player with no
legal move or no pieces does **not** auto-lose; current score totals decide.) Resign = the resigning
side loses outright.

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
- **Persistence:** new Prisma **`DamathMatch`** model (players, variant, redScore, blueScore, winner,
  endReason, `scoreHistory` JSON, timestamps) via a new migration. Classic `Match` table untouched.
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
- **No hardcoded scoring in React** — components only render engine-produced values.

## 9. Testing (29 Damath tests + Classic suite = #30)

Board: 8×8 (#1); exactly 32 playable squares (#2); only `+ - × ÷ null` (#3).
Setup: whole creates 24 pieces (#4); 12 each (#5); top on rows 0–2 (#6); bottom on rows 5–7 (#7).
Movement: forward diagonal (#8); no backward quiet move (#9); capture forward (#10) and backward
(#11); non-capture illegal when capture exists (#12); multi-capture continuation (#13); max-capture
filters shorter sequences (#14).
Dama: promotion (#15); moves over distance (#16); captures over distance (#17).
Scoring: uses landing operator (#18); add (#19); subtract (#20); multiply (#21); divide (#22);
div-by-zero no crash (#23); dama capture ×2 (#24); dama-vs-dama ×4 (#25); score history created on
capture (#26); no score on normal move (#27).
Winner: higher score wins (#28); equal score = draw (#29).
**#30: Classic Dama tests still pass unchanged** (run full `turbo run test`).

## 10. Acceptance criteria

- Start Math Dama from mode selection; Whole loads the exact operation board + official chip values.
- Pieces move per dama rules; captures mandatory; score uses landing-square operator; scores update
  immediately; history shows the formula.
- Dama promotion + score multiplier work; game ends correctly; winner by score.
- **Classic Dama is not broken.**

## 11. Explicit non-goals (from the "Do not" list)

Do not replace/modify Classic Dama. No scoring inside React components. Never score from the starting
square (always landing operator). Never allow non-capture when capture exists. Never ignore
multi-capture continuation. Winner is never by remaining pieces alone. Radical/polynomial stay
disabled until symbolic scoring exists. No official PDF artwork — recreate the board from the matrix.

## 12. Open decisions — all resolved

- Scope: **Local + vs-AI + Online**, all server-authoritative.
- Engine location: **`game-engine/src/damath/`**; coords **`{x,y}`** per spec.
- Non-resign ends (incl. blocked / no-pieces): **decided by score**; equal = **draw**.
- Division (numeric variants): **exact float in engine, 2-dp display rounding**.
- Online rewards: **unranked, no payout at launch**; persist `DamathMatch` rows.
- Level selector: **two-step Elementary → Secondary → variant**; Secondary selectable, all Coming
  Soon; Whole is the only enabled variant. Elem = Counting/Whole/Fraction; Sec =
  Integer/Rational/Radical/Polynomial/Binary. **Piece count is identical across levels** (24/12).
- Damath AI: **score-greedy + 1-ply opponent check**, difficulty-tuned.
