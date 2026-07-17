# FilipinoDama — Multi-Region Design Spec

**Status:** Design (approved to build Stage 0 immediately; later stages gated on data)
**Audience:** Owner + implementing engineers
**Date:** 2026-07-17

> **Verified-facts updates (2026-07-17), superseding the "unconfirmed" notes below:**
> - **Railway private networking DOES span regions** within one environment. Proven during the Singapore relocation: a US-West API instance talked to the Singapore Redis over `*.railway.internal` while Postgres was still mid-migration, staying healthy. So **Risk #4 is resolved** and **Stage 1 does NOT require exposing public DB/Redis endpoints** — cross-region instances use the private network as-is. (Re-verify auth posture before wide rollout, but the network path works.)
> - The whole stack is now in **Singapore** (`southeast-asia`): Postgres + Redis single instances, API on 2 replicas. This is the Stage-0 baseline.
> - Railway region friendly-names for scaling: `us-west`, `us-east`, `eu-west`, `southeast-asia` (legacy alias `sfo` = US-West; zero it out where it lingers). `num_replicas` legacy setting fights the region-replica map — set both, or watch the count flap. See docs/ops/singapore-region-migration-runbook.md for the gotchas.

---

## 1. Recommendation (read this first)

**Do NOT build two independent databases. Multi-region for FilipinoDama means: one global source of truth (money, ranking, matchmaking pool) that never splits, plus local reads and a per-match "home region" for the live game loop. Compute goes multi-region; the money/ranking/matchmaking-pool data layer stays single-writer.**

Concretely: keep **one Postgres primary** and **one global Redis** for everything that must be globally consistent (wallet, trophies, the matchmaking pool, presence, the socket.io adapter). Push latency wins outward in cheap, reversible increments — edge (Cloudflare) first, then regional API compute, then a per-match live-Redis "home region," then read-replicas — each shipped only when measured data says the previous stage isn't enough.

**The single most important insight:** the thing players *feel* as lag is the **per-move Redis lock+CAS loop** (`mutateMatch` does 3+ Redis round-trips per move), not database reads and not matchmaking. So the highest-value regionalization is **live-match state, pinned to a home region chosen at pair time** — not a read-replica, and definitely not a second wallet. A read-replica improves reads nobody's blocked on; regionalizing the move loop fixes the actual complaint. But dama is turn-based and latency-tolerant, so even that may not trigger for a long time. **Build the measurement before you build the region.**

**What you are NOT building:** active-active, region-sharded data, distributed SQL (Cockroach/Yugabyte), or per-region matchmaking pools. All are correct at 1M+ DAU spread evenly across continents; all are wrong for a turn-based board game in beta with a thin pool and one small team. Adopting a new DB engine *during beta* is the worst possible time to inherit its edge cases.

---

## 2. Non-negotiables (never violate these)

These are invariants. Any stage that would break one is rejected, no matter the latency win.

1. **Money is single-writer, forever.** `LedgerEntry`, `Order`, `Payment`, and the trophy/rank settle all write to exactly **one** Postgres primary. No second region ever accepts a write to a player's wallet or trophy count. Double-credit across regions is catastrophic and unrecoverable. The existing DB-gated idempotent settle (`updateMany where endedAt:null; count===0 → return`) + ledger unique-index second wall stay exactly as they are — they are region-agnostic *because* there is one DB.

2. **Balance and own-rank reads are read-your-writes.** Any read whose entire job is to confirm the player's own just-completed action (post-purchase balance poll, post-match trophy/rank, post-purchase inventory, post-join guild status) reads the **primary**, never a replica. This is a short enumerable list (~8-12 endpoints), hard-coded, not session-wide routing.

3. **Matchmaking is ONE global pool per mode.** Never hard-partition `rt:mmq:<mode>` into per-region Redis instances. A thin beta pool that's partitioned means two lone testers in different regions silently get bot-filled instead of matched — a *silent* degradation (bots are deliberately unlabeled). Region-awareness, when it comes, is a *preference inside the one pool* (regional-first pop, global fallback before the 7-20s bot-fill window), never a second queue.

4. **The socket.io Redis adapter is ONE global instance.** Sharding the adapter per region doesn't slow delivery — it *breaks* it: sockets on other regions' instances silently stop receiving `matchMoved`/`matchEnded`. Non-negotiable that all API instances everywhere share one adapter Redis.

5. **Every request is region-tagged before any second region exists.** Logs, error tracker, and match/queue records carry a `region` dimension *before* Stage 2, or you debug blind exactly when a region misbehaves.

---

## 3. Staged Roadmap

Each stage is independently shippable and independently valuable. Do them in order. Do not skip to a later stage because it sounds more complete.

### Stage 0 — Edge + instrumentation (ship this week)

**What:** Put Cloudflare in front of web + API. Pin socket.io transport to WebSocket-only on both clients. Add per-connection RTT logging tagged with client region. Add a `region` dimension to logs now.

**Why:** ~80% of *perceived* latency for a globally-scattered beta is TCP+TLS handshake and static-asset delivery, which Cloudflare's anycast edge fixes without touching anything stateful. The instrumentation is the prerequisite for every later decision — you need weeks of real RTT/abandon data before spending on a region.

**How (concrete):**
- Cloudflare in front of `filipinodama.com` + `api.filipinodama.com` (free/Pro tier). Cache static bundles aggressively (`Cache-Control: immutable` + cache-busted filenames). Cache the store-catalog endpoint 60-300s TTL, **excluding** any per-user fields (balance, owned items); purge on admin catalog edit. Never cache live match / wallet / matchmaking / leaderboard-live responses.
- **Force `transports: ['websocket']`** — currently BOTH clients allow polling (web `apps/web/src/lib/socket.ts:22` sends `["websocket","polling"]`; Android `SocketClient.kt:76` sends `["polling","websocket"]`, polling-first). socket.io's polling handshake is multiple sequential HTTP requests that can land on different origin pools once an LB exists, breaking the handshake. This is a **required pre-multi-region fix**, testable now in single-region.
- Persist socket ping/pong RTT per connection + client region (Cloudflare gives you geo headers for free once fronted). Log abandon-forfeit rate by region (the abandon job already produces this signal).

**Cost:** $0-20/mo. **Ops burden:** near-zero, nothing stateful changes. **Risk:** none to money/matchmaking. **Trigger:** now, unconditionally.

---

### Stage 1 — Regional API compute, still one Singapore Postgres + one global Redis

**What:** Deploy the stateless Fastify/socket.io image into 1-2 more Railway regions (start with the region your Stage-0 data says has the most testers — likely `eu-west` or `us-east`, not all four). Front them with a Cloudflare Load Balancer: geo-steering + health checks, origin pools per region. All instances still connect to the **one** Singapore Postgres and the **one** global Redis (mm queue, presence, adapter, jobs).

**Why:** This gives real compute failover (Cloudflare demotes an unhealthy region's pool within one check interval; other regions unaffected) and moves the TLS/session termination closer. **Be honest about what it does NOT do:** a US API instance still talks to Singapore Redis for the live match loop, so per-move latency is unchanged (arguably one hop worse). This stage buys failover and slightly faster stateless reads — **not** match-latency. Don't let anyone sell it internally as fixing lag.

**How (concrete):**
- Same server image, deployed per-region on Railway. **Verify explicitly** whether Railway private networking spans two services in *different* regions in one environment (the four specialists flagged this as unconfirmed). If it does not, cross-region instances need public Postgres/Redis endpoints with **TLS + strong auth** — that's a security-review item, because today's private-network assumption may permit weaker auth that is unsafe once exposed. Confirm with Railway before relying on either answer.
- Stamp `socket.data.region` at handshake (mirror the existing `classifyDevice`/`socket.data.device` pattern in `index.ts`). This is the region tag Stage 2 depends on — land it here.
- Cut `api.filipinodama.com` from a plain DNS record to the Cloudflare LB. Canary one beta cohort on the new region; watch error rate + RTT before adding more.
- **Money/ranking re-verification (required):** compute is now genuinely concurrent across physical regions hitting one Redis at 150-250ms RTT instead of <5ms. Re-run the per-match lock+CAS and idempotent-settle paths under real cross-region latency (load/chaos test, not just code review) to confirm the 2s lock TTL / 3-attempt-with-jitter timing assumptions still hold. This is the one place added latency could surface a timing bug that didn't exist single-region.

**Cost:** +$5-20/region/mo (compute only, no volume). **Ops burden:** doubled alerting surface, region-tagged debugging, distinguishing "our bug" from "Railway flaky in region X." **Trigger:** Stage-0 data shows, sustained 2-4 weeks: ≥15-20% of active testers cluster in one non-SEA region AND median socket RTT from there to Singapore consistently >150-200ms AND a real churn/abandon correlation or explicit lag complaints from that region. If you don't see the top three together, you have a hypothesis, not a latency problem.

---

### Stage 2 — Live-match "home region" (the real match-latency fix)

**What:** Split Redis into two roles. Keep **one global Redis** for matchmaking queue, presence, adapter, and cross-region jobs (`bot-fill`). Add **per-region "live-match" Redis** instances that own only the per-move hot-path keys. At pair time, choose a **home region** for each match; that match's live keys live in exactly one region's Redis for its whole life.

**Why:** This is the only stage that fixes what players actually feel. Same-region matches (the majority once players exist in 2+ regions) get zero cross-region latency on the move loop — identical to today's single-region performance. Only genuinely cross-region pairs pay a tax, only one side of the pair pays it, and it's minimized by picking the better home region.

**How (concrete):**
- **Redis role split** in `apps/server/src/realtime/store.ts`: replace the single `export const redis` singleton with `mmRedis` (global — owns `rt:mmq:*`, `rt:queuedIn:*`, `rt:online*`, `rt:jobs` for global job types, and the adapter) and a `matchRedisFor(region)` router (returns the right regional client for `rt:match:<id>`, `rt:lock:match:<id>`, `rt:spect:*`, `rt:rematch:*`, and per-match `bot-move`/`abandon-forfeit` jobs). `withLock`, `casJSON`, `queuePopPair` logic is unchanged — just parameterized by which client runs it.
- **Home-region selection** at the `createLiveMatch` call sites (`matchmaking.ts` `tryMatch` + `startBotMatch`, and the rematch flow in `match.ts`): both same region → that region; different → pick by a static 4×4 inter-region latency matrix (minimizes the disadvantaged player's penalty, predictable, not random). Write a `rt:matchHome:<matchId> → region` pointer in the **global** Redis so any instance handling a later `matchMove`/`matchResync`/`spectateJoin`/`resign`/`bot-move`/`abandon` for that match knows which regional client to use.
- Each API instance holds one connection to the global Redis + one to each regional match-Redis (4 regions is nothing). A move handler looks up the home region, then runs the existing `mutateMatch` against that client, unchanged.
- **Adapter emit stays on the global Redis** — one publish per move for `matchMoved` fan-out. This is a fire-and-forget publish (one Redis command latency), not a blocking round-trip; it affects "how fast the opponent sees my move," not "how fast my move is accepted." Accepted tradeoff.
- Deploy regional match-Redis only in regions that actually have testers (likely 2 to start, not 4). Postgres stays single primary; settle still writes back to Singapore at match-end (one write, ~150-300ms, unnoticed — versus every move, which everyone notices).
- **Do NOT** build region-aware matchmaking pairing (regional-first pop) yet. Ship blind global-FIFO. Add the "scan-first-N same-region, global fallback before bot-fill" pop only when population data shows same-region pairs are common — otherwise it's premature optimization on a thin pool.

**Cost:** +$10-30/mo per regional Redis + the Stage-1 compute. **Ops burden:** the real split-brain risk lives here — two regional live-Redis instances must never both think they own a match; the `rt:matchHome` pointer + single-writer Postgres are what prevent it. Keep money/ranking single-writer always; the crack split-brain crawls through is "let's also write ranking from the EU service." **Trigger:** Stage-1 is live AND live-move RTT (not stateless-read RTT) is the measured complaint — i.e. players in a region report the *game itself* feeling laggy per move, not pages loading slow. Turn-based dama tolerates latency well, so this may never trigger; that's a feature of the plan, not a gap.

---

### Stage 3 — Postgres read-replicas for cosmetic reads (only at real read scale)

**What:** Add a managed cross-region read-replica (Neon preferred) for replica-eligible reads: store catalog, other players' profiles, match history, general leaderboard views, guild roster/chat browsing. Writes and all money/own-rank reads stay on the primary.

**Why:** Improves read latency for content players are *looking at*, not acting on. This is the lowest-value latency stage for a real-time game (nobody's blocked on these reads), and the highest-risk for correctness (replica-lag bugs: "why does my rank differ from my friend's screen"). Last thing you touch, driven by concrete leaderboard/profile read-latency complaints — not by "multi-region" as a vibe.

**How (concrete):**
- **Provisioning:** prefer **Neon** (managed replica, vanilla Postgres wire protocol → Prisma needs zero schema change, just a second `DATABASE_URL_REPLICA`; Neon operates replication/failover/lag-monitoring for you) over self-run streaming replication as a second Railway service (which makes you own Postgres replication ops on top of everything else — viable only with infra headcount). Keep the **primary where it is** (Singapore) unless telemetry proves the player mass moved; moving the primary is riskier than adding replicas.
- **Minimal Prisma change** (`apps/server/src/db/client.ts`) — additive, one file, every existing import keeps working:

```typescript
// writeDb = primary. ONLY client allowed to touch Ledger/Order/Payment/settle/trophy.
const writeDb = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
// readDb = nearest replica, FALLS BACK to primary if unset (replicas are opt-in, region by region).
const readDb = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_REPLICA ?? process.env.DATABASE_URL } } });

export const prisma = writeDb;               // safe default — all existing code unchanged
export const db = { write: writeDb, read: readDb };  // opt-in only
```

Call sites: money/rank paths keep using `prisma` (unchanged). Cosmetic reads opt into `db.read`. Read-your-writes call sites explicitly use `db.write`. `DATABASE_URL_REPLICA` is set per-region on each API service — env var is the routing, no code branches on region. Evolve to a Prisma `$extends` client extension (auto-route read methods for an allowlist of models) only if the opt-in call-site count grows large.

**Read/write split (authoritative table):**

| Model | Write | Read |
|---|---|---|
| `LedgerEntry`, `Order`, `Payment` | Primary always | **Primary always** |
| `User.trophies` / `rankTier` | Primary always | **Primary for acting player's own**; replica OK for others' |
| `Match` (live/settling) | Primary always | **Primary while active/settling**; replica OK for old history |
| Guild-war / Tournament results | Primary always | Primary for own entries; replica OK for browsing standings |
| `Guild` / `GuildMember` | Primary | Replica OK for roster; **primary for "did my join just get approved"** |
| `User` profile, store catalog, leaderboard views, match history, DM/guild-chat | Primary | **Replica OK** (sender's own just-sent message → primary or the socket echo you already have) |
| Presence, mm queue, live board state | — Redis, not Postgres — | — Redis — |

**Rule:** anything the settle transaction or ledger unique index touches = primary-only, ever. Everything else is replica-eligible with per-call-site read-your-writes overrides.

**Cost:** $50-300+/mo depending on tier. **Ops burden:** highest — replica-lag correctness, migration ordering (replica applies after primary), doubled DB monitoring. **Trigger:** concrete, sustained read-latency complaints on leaderboard/profile endpoints from a region, after Stages 0-2 are in and still insufficient. Likely a long way off for a turn-based game.

---

## 4. Data-layer detail (summary)

- **Topology:** single global Postgres primary + (Stage 3) regional read-replicas. Rejected: distributed SQL (premature, new-engine edge cases during beta, and your global ledger/leaderboard are exactly the un-geo-partitionable tables that gain nothing from it) and region-sharding (your core loop *pairs arbitrary players* and your social systems are inherently cross-shard — anti-shardable by design).
- **Primary location:** Singapore, until beta telemetry proves otherwise.
- **Provisioning on Railway:** Railway volumes are region-pinned and Railway offers no managed cross-region streaming replication — so replicas mean either self-run streaming replica as a second Railway service (you own the ops) or (preferred) managed Neon while keeping Railway for compute + Redis.

## 5. Realtime detail (summary)

- One global Redis owns matchmaking queue, presence, adapter, and global jobs — permanently. Per-region live-match Redis (Stage 2) owns only per-move hot-path keys, home-region-pinned at pair time via `rt:matchHome:<matchId>`.
- The `redis` singleton in `store.ts` becomes `mmRedis` (global) + `matchRedisFor(region)` (router). All lock/CAS/queue logic unchanged, just parameterized.
- Adapter + `fetchSockets()` (presence, abandon-sweep, rematch fan-out) ride the global Redis and keep working cluster-wide across regions unmodified.

## 6. Routing detail (summary)

- Cloudflare LB, anycast edge → geo-steered origin pools (one per Railway region), health-checked. Not Railway's built-in nearest-region (too weak), not literal anycast origins (Railway origins aren't anycast-capable).
- Stickiness holds for the life of one WebSocket (one TCP stream, no mid-connection re-route). The real risk is polling's multi-request handshake → fixed by WebSocket-only transport (Stage 0).
- Fully transparent to clients: both apps keep hitting `api.filipinodama.com`. Only client change is transport-pinning — a robustness fix, not region-awareness.

## 7. Risks

1. **Data-layer SPOF is real and unfixed by multi-region compute.** If the Singapore region (not just its compute) goes down, every region goes down — all writes depend on that one Postgres/Redis. Multi-region compute buys *latency + compute failover*, NOT full HA. Say this plainly to stakeholders; true HA is a separate DB-failover project.
2. **Split-brain** if anyone ever adds a second wallet/ranking writer, or two regional live-Redis both claim a match. Prevented by single-writer Postgres + the `rt:matchHome` pointer. Guard it in review.
3. **Replica lag** (Stage 3) serving stale balance/rank right after a write. Prevented by the read-your-writes call-site list.
4. **Railway private-networking-across-regions is unconfirmed** — resolve before Stage 1; if it doesn't span regions, cross-region DB/Redis auth becomes a security-review item.
5. **Lock/CAS timing under WAN latency** — verify at Stage 1 before wide rollout.

## 8. First step (do this now)

**Put Cloudflare in front of web + API, pin both socket.io clients to `transports: ['websocket']`, and start logging per-connection socket RTT tagged by client region.** Half a day to a day of work, zero stateful change, zero money/matchmaking risk. Then explicitly tell the owner: *"We are not adding a second region this week — we're adding the measurement that tells us in 3-4 weeks, with real numbers, whether and where we need one."* The Stage-0 deliverable is evidence, not a region.

Files to touch first: `apps/web/src/lib/socket.ts:22`, `apps/android/.../SocketClient.kt:76` (transport pin); Cloudflare config (no repo change); RTT logging in the socket connection handler in `apps/server/src/realtime/index.ts`.