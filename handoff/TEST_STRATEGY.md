# TEST_STRATEGY.md — Testing Strategy

How FilipinoDama Royal is tested. The goal: the **rules engine and the economy are provably correct**, real multiplayer works across two clients, and money can never be created client-side. Tests gate every merge (see `GIT_WORKFLOW.md`).

---

## 1. Test pyramid

```
        e2e (Playwright)         ← few, high-value: golden paths across real UI + server
     integration (Vitest+DB)     ← API routes, socket flows, ledger, payments — real PG+Redis
   unit (Vitest, pure functions) ← MANY: game-engine, rating, formatters, validators, reducers
```

Bias toward the base. The **game-engine unit suite is the largest and most important** set in the repo.

## 2. Tooling

- **Vitest** — unit + integration (server & shared & engine).
- **Playwright** — browser e2e against a running dev stack.
- **Testcontainers / CI service containers** — ephemeral Postgres + Redis for integration.
- **Stripe CLI** (`stripe listen`) — local webhook delivery; Stripe test clock for subscriptions if used.
- **k6** or **Artillery** — load/soak testing the socket match loop.
- Coverage via `vitest --coverage` (v8).

## 3. Coverage gates (CI fails below these)

| Area | Line/branch min |
|------|-----------------|
| `packages/game-engine` | **100% / 95%** — non-negotiable |
| `apps/server/src/economy` (ledger, rating) | **95%** |
| `apps/server/src/modules/payments` | **95%** |
| shared validators/DTOs | 90% |
| Other server modules | 80% |
| Web (logic/stores/hooks; not pixels) | 70% |

---

## 4. Layer-by-layer

### 4.1 Game engine (unit) — the heart
Implements the full matrix in `GAME_RULES.md`. Must cover:
- Setup: 12v12, correct squares, red to move.
- Man movement (forward only, one step); king sliding (multi-square, blocked by first occupant).
- Single capture forward **and** backward; king flying capture with multiple landing squares.
- Multi-jump chains (2 & 3 captures) are forced to completion.
- Illegal: jump own piece, jump two at once, re-jump a piece in one chain; captured pieces block landing during the chain, removed only at end.
- **Mandatory capture:** quiet moves excluded when a capture exists.
- **Maximal capture (`forcedMaxCapture`):** only longest chains legal; `isLegal` rejects shorter ones.
- Promotion on quiet move and as capture landing (turn ends).
- Outcomes: capture-all win, no-moves (stalemate = loss for blocked side), draw by inactivity + threefold repetition.
- **Purity:** `applyMove` doesn't mutate input; `GameState` round-trips JSON.
- **Determinism:** replaying `history` from initial state reproduces the final position (this is what makes replays trustworthy).
- **Property/fuzz test:** play thousands of random legal games; assert invariants every ply — piece count only decreases, no two pieces share a square, only dark squares occupied, side-to-move never has zero pieces after its own move, engine never throws on a `legalMoves()` output.
- AI: `bestMove` always returns a legal move; never throws; respects the per-move time cap; higher difficulty beats lower over N games.

### 4.2 Server integration (Vitest + real PG/Redis)
- **Auth:** register→verify→login→refresh rotation→logout; guest; OAuth callback (mock provider); protected routes reject without token; expired/replayed refresh rejected.
- **Ledger (critical):** grant/spend updates balance cache **and** writes a matching `LedgerEntry` atomically; gold/diamonds can't go negative; trophies can; a thrown mid-transaction leaves balance + ledger unchanged (rollback). **Concurrency:** fire N simultaneous spends on the same wallet → never oversell (no negative balance, ledger sum == final balance).
- **Purchase:** `purchaseItem` spends the right currency, grants the item + bundle contents, writes order + ledger; double-purchase blocked; insufficient funds rejected with no side effects.
- **Payments (money can't be minted client-side):**
  - Diamonds are credited **only** by a verified webhook — assert no REST/socket path grants diamonds.
  - Webhook with a bad/missing signature is rejected and credits nothing.
  - **Idempotency:** delivering the same Stripe event twice credits once.
  - Refund reverses currency + revokes the item exactly once.
- **Matchmaking:** two queued players of near rating get matched; `mm:lock` prevents double-queue; leave dequeues.
- **Match settlement:** on `match:ended`, a `Match` row is written with correct winner/reason, trophy deltas applied via ledger to both players, per-win gold banked once; voiding reverses deltas exactly once.
- **Social/guild:** friend request accept creates one friendship; guild create is free (no charge); min-trophy gate blocks under-threshold joins; role permissions enforced (a MEMBER can't kick).
- **Notifications/chat:** unread counts + `lastReadAt`; chat rate limit trips after the configured burst.

### 4.3 Realtime (socket) tests
Use `socket.io-client` against a test server with two sockets:
- Server-authoritative: an **illegal** `match:move` returns `match:illegal` and does **not** mutate state; a legal one broadcasts `match:moved` to both players + spectators.
- Reconnect: drop a socket mid-game, `match:resync` restores authoritative state.
- Disconnect grace → abandon → correct loss + deltas.
- Spectator late-join receives current state; can't submit moves.
- Redis adapter: two server instances share a room (broadcast from instance A reaches a client on instance B).

### 4.4 Web (unit/component)
- Zustand stores/reducers, formatters (currency, time, rank tier via `rankTierFor`), the client-side engine mirror used for hints/offline AI.
- Component tests (Testing Library) for stateful pieces: board interaction states (select/legal/capture/must-capture/promotion), cart math, replay controls (step/jump/flip), forms (edit profile, delete-account typed confirm).
- No pixel-snapshot tests (brittle) — assert behavior + roles/labels for a11y.

### 4.5 End-to-end (Playwright) — golden paths
Run against the dev stack; these must pass before the first production promotion:
1. Register → verify → land on Home.
2. Diamond top-up (Stripe **test**) → diamonds credited via webhook only.
3. Buy a Gold board theme → equip → renders in game.
4. **Two browser contexts** queue ranked → match → play a full legal game → correct winner + trophy/gold deltas + a Match row.
5. Profile → Match History → replay that game move-for-move.
6. Create guild (free) → invite friend → guild chat delivered with unread badge.
Plus: mobile viewport smoke of every screen (nav + mobile nav usable, no overflow, hit targets ≥44px).

### 4.6 Non-functional
- **Load/soak (k6):** N concurrent live matches + chat; assert p95 move round-trip and no memory growth over a 30-min soak; queue wait stays bounded.
- **Security:** authz matrix (a normal token can't hit `/api/admin/*`; a `SUPPORT` admin can't hit `ECONOMY` routes); rate limits; CORS locked to web origin; no secret behind a `VITE_` prefix (lint check).
- **Accessibility:** axe pass on key screens; keyboard play of the board; Lighthouse mobile ≥90 perf/a11y.
- **DB:** every migration applies cleanly forward on a copy of prod-shaped data; seed is idempotent.

---

## 5. Per-branch requirement (definition of done)

Every `feat/*` PR into `dev` must:
- Add/extend tests for the code it introduces at the appropriate layer.
- Keep the full suite green (`pnpm test`) and meet the coverage gate for touched areas.
- Gameplay/economy/payment PRs additionally keep the engine suite + ledger/payment integration tests green.
- Add an e2e case (or extend one) when it introduces or changes a golden-path step.

## 6. CI wiring
`ci.yml` runs on every PR to `dev`/`main`: install → prisma generate → lint → typecheck → `migrate deploy` (ephemeral PG) → **unit + integration** → build → **e2e** (PRs targeting dev/main). Coverage thresholds enforced in `vitest.config`. Load and full-matrix soak run on a nightly/schedule workflow, not per-PR.

## 7. Test data
- Deterministic factories in a `test/factories` helper (users at each rank tier, a mid-game `GameState`, a finished match with a known move list for replay assertions).
- Seed the store catalog/quests/season in integration setup via the same idempotent seed used in dev.
- Never hit live Stripe/OAuth in tests — use test keys + mock providers + Stripe CLI/fixtures.
