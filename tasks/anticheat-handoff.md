# Anti-cheat detection — state at hand-off (2026-08-01)

Branch `feat/anticheat-detection`, worktree `D:/AI Projects/fd-anticheat`.
**NOT merged. Backend AND admin UI are done and verified end to end.**

## What the admin page looked like before

`apps/admin/src/pages/Matches.tsx` (nav label "Anti-cheat") was an honest
read-only match browser. Four tiles — Avg accuracy / Move time / Moves / Priors
— all rendered "—", with a banner reading *"Anti-cheat detection is a Phase 2
subsystem — not yet built."* Nothing was fabricated; there was simply no
detection subsystem behind it.

## What now exists (backend, done)

**`apps/server/src/lib/anticheat.ts`** — pure, DB-free, unit-testable.
Replays a finished match ply by ply and measures ENGINE AGREEMENT: how often a
player chose the move the engine would.

The one thing that makes the metric meaningful: Dama forces captures, so long
stretches of a game have exactly one legal move. Everyone "agrees with the
engine" there, cheater and beginner alike. **Forced plies are excluded from both
numerator and denominator**, so `decisionCount` — positions with a real choice —
is the sample size, not `moveCount`.

**`apps/server/src/lib/anticheat-service.ts`** — loads a match, analyses it,
upserts one `MatchAnalysis` row per human player. Bots are skipped (a bot's
moves ARE the engine's, so it would sit at 100% and bury real cases). A
moderator's CONFIRMED/DISMISSED verdict is never overwritten by a recompute.

**Schema** — `MatchAnalysis` + `AnalysisStatus` enum
(CLEAR/FLAGGED/CONFIRMED/DISMISSED), migration
`20260801120000_anticheat_match_analysis`. Purely additive: 4 CREATE, 3 ALTER
TABLE ADD CONSTRAINT, zero drops. Applied to the local dev DB.

**Routes** (`admin-matches.ts`, all `requireAdmin("MODERATOR")`):
- `GET  /admin/matches/:id/analysis` — read-only, returns stored rows
- `POST /admin/matches/:id/analysis` — queue a match for analysis
- `GET  /admin/anticheat/queue?status=FLAGGED` — the review queue
- `GET  /admin/anticheat/priors/:userId` — confirmed / flagged / dismissed /
  player CHEATING reports, counted separately rather than summed
- `POST /admin/anticheat/:id/review` — CONFIRMED or DISMISSED + note, optional
  ban. Reuses `banUser` (one ban path, not two), writes an audit row, and
  refuses to re-review a decided case or ban while dismissing.

**Job wiring** — `anticheat-analyse` added to `RtJobType` and registered in
`rtJobHandlers`. Analysis never runs in a request (see cost below).

**`analysisBestMove(state, depth)`** added to `@dama/game-engine` — additive
export, gameplay untouched, nothing else calls it.

## Measurements that drove the design (do not re-litigate without re-measuring)

`bestMove` cost per call, measured on this machine:

| position | depth 4 | depth 7 (`hard`) |
|---|---|---|
| opening | 137 ms | 4,464 ms |
| early   | 193 ms | 2,357 ms |
| mid     | 519 ms | 13,268 ms |

Consequences:
- **Depth 7 is unusable in bulk** — minutes per match. A first attempt using it
  produced no output in 10 minutes and was abandoned.
- **Analysis must be a background job**, never an HTTP handler. At depth 4 a
  match is seconds; that is fine for a job and still far too slow for a request.
- **`bestMove(state,"normal")` cannot be the reference**: it applies an 8%
  BLUNDER, returning a random legal move that often. A reference that disagrees
  with itself cannot measure agreement. Hence `analysisBestMove`.
- Reference is depth 4; `FLAG_RATE` raised 0.85 → **0.90** because a shallower
  engine plays more obvious moves that strong humans also find, so the
  honest-player baseline is higher.

## Verified

Synthetic control, same game shape, red behaving differently:

```
red PLAYS ENGINE  -> rate=100%  decisions=10
red AVOIDS ENGINE -> rate=0%    decisions= 9
```

Clean separation — the metric discriminates. Both were reported `FLAG=false`
because `decisionCount` fell under `MIN_DECISIONS` (12); that is the sample
floor working as intended, not a bug.

Persistence verified against real matches: `analyseAndStore` wrote 4
`MatchAnalysis` rows to Postgres, and one corrupt match returned
`error: "Match has no recorded moves."` instead of throwing.

Server typecheck clean.

## Admin UI — DONE

`apps/admin/src/pages/Matches.tsx` no longer contains a single Phase-2 stub
(`grep PHASE2_NOTE` → 0). Two tabs:

- **Review queue** — cases from `GET /admin/anticheat/queue`, filterable by
  Flagged / Confirmed / Dismissed / Clear, highest suspicion first.
- **All matches** — the match browser, now showing each match's real engine
  agreement, suspicion and status, with an **Analyse / Re-analyse** button that
  queues the background job. Un-analysed matches say "not analysed" rather than
  showing a fabricated score.

The drawer renders one `AnalysisCard` per human player, because a case is about
a PLAYER in a match, not the match — which is why the old match-wide decision
bar was removed. Each card carries the four tiles (Engine agreement / Move time
/ Moves / Priors), the verbatim `reasons`, and — while undecided — a mandatory
note, an optional ban with duration, and Dismiss / Confirm.

"Move time" is shown as the whole-match average and explicitly labelled context
only, with a panel explaining that per-move think time is unrecoverable. That is
the honest treatment of the one signal we cannot produce.

### Verified in the browser (headless Chrome over CDP, isolated profile)
Signed in as a MODERATOR, the page renders "MATCHES & ANTI-CHEAT" with the queue
tabs and a real row: `testplayer1 #5410 · played blue · PRIVATE · 0% of 1 free`
under **Confirmed**, 1 case.

### Verified through the API
- `POST /admin/matches/:id/analysis` → `{queued:true}`; the job poller then wrote
  both rows (red 50% over 2 decisions, blue 0% over 1), and `GET` returned them
  with `avgSecPerMove` computed.
- Guards: ban-while-dismissing → 400; empty note → 400; re-reviewing a decided
  case → 409.
- `POST /admin/anticheat/:id/review` with `CONFIRMED` + 168h → user banned until
  2026-08-09, verdict + note stored, `reviewedAt` stamped, and an audit row
  written (`anticheat.confirmed / matchAnalysis`).
- Re-queuing after a verdict refreshed the measurements (decisionCount 24 → 1)
  but **kept `CONFIRMED` and the review note** — measurements update, verdicts
  do not.
- The `(matchId, userId)` unique constraint rejected a duplicate insert.

Admin app typecheck and production build both clean.

## Local dev gotcha found while verifying

The admin console runs on `:5174`, but `CORS_ORIGIN` in `apps/server/.env`
defaults to `http://localhost:5173` only. Every mutating admin request is then
rejected with `CSRF_ORIGIN: Cross-site request blocked` — the origin guard
working correctly, but it makes the console unusable locally. Set
`CORS_ORIGIN=http://localhost:5173,http://localhost:5174` (done on this machine;
`.env` is gitignored, so it is not in the commit). The server reads env at
startup, so it needs a full restart, not a tsx-watch reload.

## NOT done

1. **Nothing queues analysis automatically.** Matches are only analysed when a
   moderator asks. Enqueue on match settle (`realtime/match.ts`) to build the
   queue on its own.
3. **"Move time" cannot be filled honestly.** Stored moves are
   `{from,path,captures,promotion}` with **no timestamps**, so per-move think
   time is unrecoverable for existing matches — and uniform think time is one of
   the strongest engine tells. Adding a timestamp per move going forward is the
   single highest-value improvement to the signal set.
4. **Thresholds are untuned.** `MIN_DECISIONS=12` and `FLAG_RATE=0.90` are
   reasoned starting points, not calibrated against a real player population.
   Run the analyser over historical matches and look at the distribution before
   letting this drive any automatic action.
5. No unit tests for `analyseMatch` yet — it is pure and DB-free specifically so
   it can have them.
6. The queue has no pagination control yet (the endpoint supports a cursor).
7. Nothing surfaces a per-PLAYER case history; `priors` gives counts only.

## Local environment

Docker Postgres is up with the migration applied. The API server and Vite are
stopped. Server test suite cannot run in this environment (pre-existing,
unrelated: `.env.test` declares no `REDIS_URL`, so it falls back to a Redis
without `UNLINK` and fails identically on unmodified main).
