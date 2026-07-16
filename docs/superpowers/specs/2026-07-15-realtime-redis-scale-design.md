# Realtime Redis Scale — Approved Design (Approach A)

**Status:** APPROVED by owner 2026-07-15 (supersedes the exploratory plan in
`2026-07-15-realtime-horizontal-scaling.md`, which remains as background).
**Goal:** the API runs N replicas; matches, private rooms, and matchmaking work
correctly across instances under player influx. Zero client changes.

## Verified facts this design rests on

- `REDIS_URL` is wired in prod (`redis.railway.internal`); `@socket.io/redis-adapter`
  and `ioredis` are already dependencies (unused today).
- All realtime state is in-process Maps: `live` (match.ts:47), `spectators`
  (match.ts:57), `abandonTimers` (match.ts:139), `rematchOffers` (match.ts:164),
  `queues`/`queuedIn` (matchmaking.ts:72/77), `botTimers` (matchmaking.ts:29),
  rooms + `userRoom` (rooms.ts), presence `online` map (presence.ts:19), and the
  damath-* equivalents.
- `GameState`/`LiveMatch` are JSON-safe (already persisted to Prisma JSON and sent
  over socket.io verbatim) → serializable into Redis without shape changes.
- Timers: `ABANDON_MS = 90_000` (match.ts:138), bot-fill `7_000–20_000` randomized
  (matchmaking.ts:20-26), `REMATCH_TTL_MS = 60_000` (match.ts:165).
- Settle idempotency backstop ALREADY EXISTS: `applyLedger` catches the
  `(user, currency, reason, ref)` unique index (economy/ledger.ts:55-61), with
  grants keyed `refType:"match", refId:matchId` — duplicate money grants are
  rejected at the DB even if settle raced.
- The move engine (`isLegal`/`applyMove`, @dama/game-engine) is JS — validation
  CANNOT run inside Redis Lua. This forces the lock-around-JS pattern below.
- `currentSocketForUser` resolves sockets via the `presence:<userId>` room —
  cluster-wide once the Redis adapter is installed (`fetchSockets` spans nodes).

## Architecture

### 1. Redis socket adapter (broadcast layer)
`io.adapter(createAdapter(pub, sub))` in `apps/server/src/index.ts`, two ioredis
clients from `REDIS_URL`. Makes `io.to(room).emit(...)` and `fetchSockets()`
cluster-wide. Known trade-off (accepted): `connectionStateRecovery` sessions are
per-node; a reconnect landing on a different node falls back to the existing
`matchResync` full-state path. No client change.

### 2. RealtimeStore (new: `apps/server/src/realtime/store.ts`)
One shared ioredis client + typed helpers. Keyspace:

| Key | Type | Holds | Lifecycle |
|---|---|---|---|
| `rt:match:<id>` | STRING (JSON) | LiveMatch (state, redId, blueId, mode, settings, botColor, **version**) | created at pairing; DEL on settle; 24h TTL safety net |
| `rt:lock:match:<id>` | STRING | move-apply lock | SET NX PX 2000 |
| `rt:room:<code>` | STRING (JSON) | private-room (host, guest, spectators, settings, matchId) | DEL on close; 24h TTL |
| `rt:userRoom:<userId>` | STRING | room code | mirrors room membership |
| `rt:mmq:<mode>` | LIST (JSON entries) | matchmaking queue (userId, joinedAt, colorPref) | push on join; LREM on leave/pair |
| `rt:queuedIn:<userId>` | STRING | mode | mirrors queue membership |
| `rt:spectators:<matchId>` | SET | spectator userIds | DEL on match end |
| `rt:rematch:<matchId>` | STRING (JSON) | rematch offer | native TTL 60s (replaces sweep code) |
| `rt:online` | SET | online userIds (presence) | SADD/SREM on connect/disconnect |
| `rt:jobs` | ZSET | delayed jobs, score = fire-at ms, member = JSON `{type,key,payload,nonce}` | claimed atomically by the poller |

### 3. Atomic move-apply (the concurrency core)
Pattern for every state mutation on a match (human move, bot move, resign,
abandon-forfeit, rematch-start):

1. Acquire `rt:lock:match:<id>` (`SET NX PX 2000`; retry ~3× with 50–150ms jitter;
   on failure emit the existing `matchIllegal {reason:"busy" → retry}` no-op path —
   in practice contention is two alternating players, near-zero).
2. `GET rt:match:<id>` → parse LiveMatch (with `version`).
3. Validate + apply in JS (`isLegal`, `applyMove`) — unchanged logic.
4. Write back via the ONE Lua script (compare-and-set): *"if stored version ==
   expected, SET new JSON with version+1 and return 1, else return 0"*. A CAS
   failure (expired lock + racer) rethrows to a single retry from step 1.
5. Release lock (DEL if still owner — ownership token in the lock value).
6. Broadcast via the adapter (unchanged emit shapes).

### 4. Cluster-safe delayed jobs (`rt:jobs` ZSET + poller)
A ~40-line poller on every instance, every 1s: Lua claim script pops all members
with `score <= now` atomically (ZRANGEBYSCORE + ZREM in one script — only one
instance wins each job). Job types:
- `bot-fill` (payload: userId, mode, colorPref; delay 7–20s) — cancel = ZREM on
  pair/leave (replaces `botTimers`).
- `abandon-forfeit` (payload: matchId, userId; delay 90s) — cancel = ZREM on
  reconnect (replaces `abandonTimers`). Handler re-checks the match still lives
  and the player is still absent before forfeiting (idempotent by design).
- Rematch expiry needs NO job — native key TTL.
Jobs survive instance death (the whole point: an in-process setTimeout dies with
its instance today).

### 5. Idempotent settle (money can never double-award)
Replace the in-memory `lm.settled` flag with a DB gate:
`prisma.match.updateMany({ where: { id, endedAt: null }, data: {...} })` —
`count === 0` ⇒ another instance already settled ⇒ skip grants + skip broadcast.
The ledger unique index stays as the second wall. Match key DEL'd from Redis after.

### 6. Module migration (same event contracts, zero client changes)
`match.ts`, `matchmaking.ts`, `rooms.ts`, `presence.ts` — every Map read/write
becomes a RealtimeStore call; handlers stay on the same events with the same
payloads. `forfeitLiveMatch` (used by rooms) goes through the same lock+CAS path.
**Damath modules (`damath-*.ts`) migrate too** — same server binary; leaving them
in-memory would break damath under replicas. Same primitives, mechanical port.

### 7. Rollout (risk-gated)
1. Merge + deploy at **replicas = 1** (behavior identical; Redis just replaces RAM).
2. Soak on live traffic; watch logs + Redis health.
3. Owner decides when to raise replicas (Railway setting — no code change).

## Testing (evidence gates)
1. Unit: CAS Lua (version mismatch rejects), job-claim Lua (N concurrent claimers,
   exactly one winner), lock ownership-token release.
2. Integration (CI): **two in-process socket.io servers sharing one Redis** —
   (a) players on different instances pair via the Redis queue and play a full
   match with moves alternating across instances; (b) forced double-apply race →
   exactly one move wins; (c) settle fires exactly once (assert single ledger row
   set + endedAt); (d) bot-fill fires exactly once with both instances polling;
   (e) abandon-forfeit fires despite killing the arming "instance".
   CI has Redis available (tests currently run against services in CI; add a Redis
   service to the workflow if absent).
3. Full existing suite stays green (typecheck + all current tests).

## Out of scope
Client changes (none needed) · admin app · PayMongo/billing · the mobile
piece-skin feature (separate task) · raising replicas (owner action post-soak).
