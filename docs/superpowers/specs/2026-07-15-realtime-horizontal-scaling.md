# Realtime Horizontal Scaling — Design & Migration Plan

**Status:** proposed (not yet implemented)
**Author:** engineering (with Claude)
**Date:** 2026-07-15
**Goal:** let the API run **multiple instances** so it can absorb a production influx of players, without breaking matchmaking, live matches, private rooms, presence, or chat.

---

## 1. Problem statement

Today the API is a **single-instance** realtime server. All live realtime state is held in in-process `Map`s, and Socket.IO has **no cross-instance adapter**. Concretely:

| State | File / line | Scope |
|---|---|---|
| Live matches | `apps/server/src/realtime/match.ts:47` `const live = new Map()` | in-process |
| Match spectators | `match.ts:57` | in-process |
| Rematch offers | `match.ts:164` | in-process |
| Abandon timers | `match.ts:139` | in-process (`NodeJS.Timeout`) |
| Matchmaking queues | `matchmaking.ts:72` `const queues = new Map()` | in-process |
| Queue membership | `matchmaking.ts:77` `const queuedIn` | in-process |
| Bot-fill timers | `matchmaking.ts:29` | in-process |
| Private rooms | `rooms.ts` (in-memory) | in-process |
| Damath equivalents | `damath-match.ts`, `damath-rooms.ts` | in-process |
| Socket.IO broadcast | `index.ts:154` `new IOServer(...)` — **default adapter, no Redis** | per-process |

**Consequence:** if a second replica is added, two players who land on **different** instances cannot be matched, cannot see each other's moves, and cannot share a room — the queue, the match room, and every `io.to(matchId).emit(...)` are local to one process. So today we are **capped at one process** (vertical scaling only: bigger box, one event loop).

**The good news:** `@socket.io/redis-adapter` (^8.3.0) and `ioredis` (^5.4.0) are **already in `package.json`** and a Redis service already runs in the Railway project — they're simply **not wired up** (grep confirms the only reference is `REDIS_URL` in `config/env.ts:13`; presence is in-memory too, despite the aspirational comment). So this is greenfield wiring, not a rip-and-replace.

---

## 2. Capacity note — is this urgent?

**Not for the closed test.** One instance handles hundreds of concurrent matches comfortably: each move is a cheap validate → apply → broadcast, and the DB persist is fire-and-forget (`match.ts` — not awaited). The event loop, not memory, is the ceiling.

**Yes for production launch / influx.** The moment sustained load needs a second replica, everything above breaks unless this migration is done first. Treat this as **pre-launch infrastructure**, sequenced after the closed test but before any public scale-up.

---

## 3. Design — two independent layers

The migration splits cleanly into two layers that can ship in **separate PRs**:

### Layer A — Socket.IO Redis adapter (broadcast fan-out) — SMALL, do first

Wire `@socket.io/redis-adapter` so `io.to(room).emit(...)` reaches sockets connected to **any** instance. This alone fixes: live-match move broadcasts, room chat, spectator counts, presence fan-out — anything that is a `io.to(...).emit`.

- Create two `ioredis` clients (pub + sub) from `REDIS_URL`.
- `io.adapter(createAdapter(pubClient, subClient))` in `index.ts` right after `new IOServer(...)`.
- **Keep `connectionStateRecovery`** (just added) — it composes with the Redis adapter.
- Cost: ~15 lines + connection lifecycle. No logic changes.

**After Layer A**, broadcasts are cross-instance, but the **authoritative match/queue STATE is still per-process** — so a match is still "owned" by whichever instance created it, and matchmaking queues are still local. That's fine only if we guarantee both players of a match are on the same instance (see Layer B).

### Layer B — Shared authoritative state (the hard part) — LARGE, do second

Two viable strategies; pick one:

**Strategy B1 — Sticky sessions + single "match owner" instance (LOWER effort, recommended first step).**
- Add sticky sessions at the load balancer (Railway: enable session affinity, or route by a hash) so a given socket always hits the same instance.
- Matchmaking: run the queue in **Redis** (a Redis list/sorted-set per mode) so any instance can enqueue/dequeue. When two players match, the pairing instance creates the `LiveMatch` locally and **both players' sockets are already sticky to their own instances** — so the match state must live where the moves are validated.
- Simplest correct version: the instance that creates the match becomes its **owner**; both players are (via matchmaking hand-off) migrated/pinned to the owner for the match's lifetime. This needs a socket "move to instance" mechanism → complex.
- **Verdict:** sticky sessions solve reconnect-affinity but NOT the "two players on different instances" pairing problem by themselves. B1 is only clean if combined with a Redis queue AND a rule that both matched players reconnect to the owner instance — awkward.

**Strategy B2 — Fully externalized state in Redis (HIGHER effort, the "correct" long-term answer).**
- Move `live` (match state), `queues`, `queuedIn`, `spectators`, `rematchOffers`, and room state into **Redis** (hashes/JSON), with the game state as the value.
- Any instance can handle any move: on `match:move`, load the match state from Redis, validate+apply with the engine, write it back **atomically** (Redis `WATCH`/`MULTI` or a Lua script to prevent two instances applying moves concurrently), then broadcast via the Layer-A adapter.
- Timers (`abandonTimers`, `botTimers`) become a problem — an in-process `setTimeout` doesn't survive if that instance dies. Replace with a **Redis-backed delayed-job** mechanism (e.g. a sorted-set of due-times polled by all instances with a claim, or a lightweight queue like BullMQ) so the bot-fill / abandon fire exactly once cluster-wide.
- **Verdict:** this is the real horizontal-scale design. Every instance is stateless; add/remove replicas freely. Cost: significant — it touches the entire realtime core and needs careful concurrency testing (the atomic move-apply is the crux).

**Recommendation:** ship **Layer A now** (cheap, immediate multi-instance broadcast), then do **Layer B2** as a dedicated, well-tested project before public launch. B1 is a trap — it looks cheaper but doesn't fully solve pairing.

---

## 4. Concurrency invariants that MUST hold after Layer B

1. **One move applied at a time per match.** Two instances must never both apply a move to the same match. Enforce with a Redis atomic op (Lua script: load state → check turn/legality → apply → store, all atomic) or an optimistic `WATCH`/retry.
2. **Bot-fill / abandon fires exactly once.** A cluster-wide delayed job with a claim, not N instances each running the timer.
3. **A match is settled exactly once.** `settleMatch` (trophies, gold, ledger) must be idempotent or guarded by a Redis lock — double-settle would double-award.
4. **Auth still enforced on recovery.** `connectionStateRecovery.skipMiddlewares: false` (already set) keeps the `io.use` auth guard running when a dropped client recovers.
5. **The client-trust boundary is unchanged.** The server stays authoritative; none of this moves any decision to the client.

---

## 5. Phased rollout

- **Phase 0 (done this session):** optimistic client moves + `connectionStateRecovery` — makes matches feel responsive under latency on a single instance. No scale change.
- **Phase 1 (Layer A):** Redis adapter for broadcast. Small PR. Deploy still 1 replica (no behavior change), but ready for more.
- **Phase 2 (Layer B2):** externalize match/queue/room state + atomic move-apply + cluster-safe timers. The big project; needs a load test.
- **Phase 3:** turn up replicas on Railway; run a synthetic load test (N concurrent matches across instances); watch p99 move-latency + Redis CPU.

---

## 6. Testing strategy for Phase 2

- Unit: the atomic move-apply Lua/transaction under simulated concurrent writers (two "instances" racing the same match) — must serialize, never double-apply.
- Integration: spin up 2 API instances locally behind a proxy + shared Redis; verify a match between players on different instances plays, broadcasts, settles once.
- Load: k6/artillery driving many concurrent matches; assert no desync, single settle, bounded p99 latency.
- Chaos: kill one instance mid-match; a matched player's reconnect must resume the match from Redis state (not lose it).

---

## 7. Estimate

- **Layer A:** ~0.5 day (wiring + a 2-instance smoke test).
- **Layer B2:** ~1–2 weeks (state migration + atomic move-apply + timer redesign + the test matrix above). This is the real cost of "production scale" and should be planned as its own tracked project, not squeezed into a feature PR.

---

## 8. What NOT to do

- Do **not** turn up Railway replicas before Layer A + B — it silently breaks matchmaking (players on different instances never pair).
- Do **not** attempt B1 sticky-only — it doesn't solve cross-instance pairing.
- Do **not** move any authority to the client to "reduce server load" — the anti-cheat boundary must stay server-side.
