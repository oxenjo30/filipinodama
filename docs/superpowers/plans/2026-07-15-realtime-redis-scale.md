# Realtime Redis Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the realtime layer (matches, matchmaking, private rooms, presence, damath) from in-process Maps to Redis-authoritative state with the socket.io Redis adapter, so the API runs N replicas correctly.

**Architecture:** A generic Redis core (`withLock` + version-CAS JSON writes + an exactly-once ZSET delayed-job queue) with thin domain wrappers; every socket handler keeps its exact event contract (zero client changes); settle is DB-gated so money can never double-award.

**Tech Stack:** ioredis (^5.4.0, installed), @socket.io/redis-adapter (^8.3.0, installed), socket.io 4.8.3, vitest 2, Prisma. CI already provides `redis:7-alpine` at `REDIS_URL=redis://localhost:6379` and Postgres.

## Global Constraints

- **Zero client changes.** Every socket event name and payload shape stays byte-identical. Clients (web + Android v16) must work unmodified.
- **Server-authoritative + money-idempotent.** Settle gate: `prisma.match.updateMany({ where: { id, endedAt: null } })` — grants run only when `count === 1`. The ledger `(user, currency, reason, ref)` unique index (economy/ledger.ts:55-61) stays as backstop.
- Timer values verbatim from spec: `ABANDON_MS = 90_000`, bot-fill `7_000–20_000` (env-tunable via `BOT_FILL_MIN_MS`/`BOT_FILL_MAX_MS`, existing), `REMATCH_TTL_MS = 60_000` → native Redis TTL of 60s.
- Redis keys are prefixed `rt:` (main game) and `rt:d:` (damath). Match/room JSON values get a 24h TTL safety net (86400s), refreshed on every write.
- Locks: `SET key token NX PX 2000`, 3 acquisition attempts with 50–150ms jitter, release only if token matches (Lua). Lock failure on a player action → emit existing `EV.matchIllegal { matchId, reason: "busy" }` (clients already roll back optimistic moves on any matchIllegal).
- `connectionStateRecovery` stays as configured in index.ts; cross-node recovery falls back to the existing matchResync path (accepted trade-off, no code change).
- All new/changed server code must pass `npx tsc --noEmit` and the FULL existing vitest suite in CI. Tests that need Redis/Postgres run in CI (established convention — no local DB here).
- Run all tests from `apps/server`: `pnpm vitest run <file>` (CI env provides DATABASE_URL + REDIS_URL).

## File Structure

- **Create** `apps/server/src/realtime/store.ts` — Redis client + generic core (getJSON/setJSON/casJSON/withLock) + domain wrappers (match, queue, room, spectators, presence, user-match index).
- **Create** `apps/server/src/realtime/jobs.ts` — ZSET delayed-job queue: schedule/cancel/claim(Lua)/poller.
- **Modify** `apps/server/src/index.ts` — adapter wiring + poller start.
- **Modify** `apps/server/src/realtime/match.ts`, `matchmaking.ts`, `rooms.ts`, `presence.ts`, `damath-match.ts`, `damath-matchmaking.ts`, `damath-rooms.ts` — Map→store migration.
- **Create** tests: `apps/server/test/rt-store.test.ts`, `rt-jobs.test.ts`, `rt-two-instance.test.ts`.

---

### Task 1: Redis core — client, JSON helpers, withLock, casJSON

**Files:**
- Create: `apps/server/src/realtime/store.ts`
- Test: `apps/server/test/rt-store.test.ts`

**Interfaces (Produces):**
```ts
export const redis: Redis;                        // shared ioredis client
export function makeRedisClient(): Redis;         // new connection (adapter pub/sub)
export async function getJSON<T>(key: string): Promise<T | null>;
export async function setJSON(key: string, value: unknown, ttlSec?: number): Promise<void>;
export async function delKey(...keys: string[]): Promise<void>;
export async function casJSON(key: string, value: { version: number }, ttlSec: number): Promise<boolean>;
// ^ writes value with version+1 IFF stored .version === value.version (or key absent and value.version === 0). Returns false on conflict.
export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T | typeof LOCK_BUSY>;
export const LOCK_BUSY: unique symbol;
```

- [ ] **Step 1: Write the failing test** — `apps/server/test/rt-store.test.ts`:

```ts
import { describe, it, expect, afterAll } from "vitest";
import { redis, getJSON, setJSON, delKey, casJSON, withLock, LOCK_BUSY } from "../src/realtime/store.js";

describe("rt store core", () => {
  afterAll(async () => { await redis.del("t:a", "t:cas", "rt:lock:t:l1", "rt:lock:t:l2"); await redis.quit(); });

  it("round-trips JSON with TTL", async () => {
    await setJSON("t:a", { x: 1 }, 60);
    expect(await getJSON<{ x: number }>("t:a")).toEqual({ x: 1 });
    expect(await redis.ttl("t:a")).toBeGreaterThan(0);
    await delKey("t:a");
    expect(await getJSON("t:a")).toBeNull();
  });

  it("casJSON: version-guarded write; stale writer loses", async () => {
    expect(await casJSON("t:cas", { version: 0, v: "first" } as any, 60)).toBe(true);   // create
    const cur = await getJSON<any>("t:cas");
    expect(cur.version).toBe(1);
    expect(await casJSON("t:cas", { ...cur, v: "second" }, 60)).toBe(true);             // version 1 -> 2
    expect(await casJSON("t:cas", { ...cur, v: "stale" }, 60)).toBe(false);             // stale version 1 rejected
    expect((await getJSON<any>("t:cas")).v).toBe("second");
  });

  it("withLock: serializes two racers; loser gets LOCK_BUSY or waits", async () => {
    const order: string[] = [];
    const a = withLock("t:l1", async () => { order.push("a-in"); await new Promise(r => setTimeout(r, 300)); order.push("a-out"); return "a"; });
    await new Promise(r => setTimeout(r, 30));
    const b = withLock("t:l1", async () => { order.push("b-in"); return "b"; });
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toBe("a");
    // b either acquired AFTER a released (ordering intact) or reported busy after retries
    if (rb === LOCK_BUSY) expect(order).toEqual(["a-in", "a-out"]);
    else expect(order).toEqual(["a-in", "a-out", "b-in"]);
  });

  it("withLock: releases only its own token (expiry-safe)", async () => {
    const r = await withLock("t:l2", async () => 42);
    expect(r).toBe(42);
    expect(await redis.get("rt:lock:t:l2")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd apps/server && pnpm vitest run test/rt-store.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** `apps/server/src/realtime/store.ts` (core section):

```ts
import Redis from "ioredis";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";

/**
 * Redis-authoritative realtime state (spec: 2026-07-15-realtime-redis-scale-design.md).
 * One shared client for commands; makeRedisClient() mints extra connections for
 * the socket.io adapter's pub/sub pair. All realtime keys live under `rt:`.
 */
export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 });
export function makeRedisClient(): Redis {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 });
}

export async function getJSON<T>(key: string): Promise<T | null> {
  const raw = await redis.get(key);
  return raw == null ? null : (JSON.parse(raw) as T);
}
export async function setJSON(key: string, value: unknown, ttlSec?: number): Promise<void> {
  const raw = JSON.stringify(value);
  if (ttlSec) await redis.set(key, raw, "EX", ttlSec);
  else await redis.set(key, raw);
}
export async function delKey(...keys: string[]): Promise<void> {
  if (keys.length) await redis.del(...keys);
}

/**
 * Compare-and-set JSON write: succeeds IFF the stored document's .version equals
 * value.version (or the key is absent and value.version === 0). Writes with
 * version+1 and a refreshed TTL. The ONE Lua script that makes an expired-lock
 * racer harmless: even if two writers both held "the lock", only the one holding
 * the current version can commit.
 */
const CAS_LUA = `
local raw = redis.call('GET', KEYS[1])
local expected = tonumber(ARGV[1])
if raw == false then
  if expected ~= 0 then return 0 end
else
  local cur = cjson.decode(raw)
  if tonumber(cur.version) ~= expected then return 0 end
end
redis.call('SET', KEYS[1], ARGV[2], 'EX', tonumber(ARGV[3]))
return 1
`;
export async function casJSON(key: string, value: { version: number }, ttlSec: number): Promise<boolean> {
  const next = { ...value, version: value.version + 1 };
  const ok = (await redis.eval(CAS_LUA, 1, key, String(value.version), JSON.stringify(next), String(ttlSec))) as number;
  return ok === 1;
}

/** Sentinel returned when the lock could not be acquired after retries. */
export const LOCK_BUSY: unique symbol = Symbol("LOCK_BUSY");

const UNLOCK_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0
`;
/**
 * Short mutex around a JS critical section (the game engine can't run inside
 * Redis, so validation/apply happens in-process between GET and CAS). 3 attempts
 * with 50-150ms jitter; TTL 2s so a crashed holder can't deadlock a match. The
 * token-checked release means we never delete a successor's lock; casJSON is the
 * second wall if our lock expired mid-section.
 */
export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T | typeof LOCK_BUSY> {
  const lockKey = `rt:lock:${key}`;
  const token = randomUUID();
  for (let attempt = 0; attempt < 3; attempt++) {
    const ok = await redis.set(lockKey, token, "PX", 2000, "NX");
    if (ok === "OK") {
      try {
        return await fn();
      } finally {
        await redis.eval(UNLOCK_LUA, 1, lockKey, token).catch(() => {});
      }
    }
    await new Promise((r) => setTimeout(r, 50 + Math.floor(Math.random() * 100)));
  }
  return LOCK_BUSY;
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run test/rt-store.test.ts` → PASS (4 tests).
- [ ] **Step 5: Typecheck + commit**

```bash
cd apps/server && npx tsc --noEmit
git add src/realtime/store.ts ../../apps/server/test/rt-store.test.ts
git commit -m "feat(realtime): Redis core - client, JSON helpers, withLock, version-CAS"
```

---

### Task 2: Exactly-once delayed-job queue

**Files:**
- Create: `apps/server/src/realtime/jobs.ts`
- Test: `apps/server/test/rt-jobs.test.ts`

**Interfaces:**
- Consumes: `redis` from `./store.js`.
- Produces:
```ts
export type RtJobType = "bot-fill" | "abandon-forfeit" | "bot-move" | "d-bot-move";
export type RtJobHandler = (payload: Record<string, unknown>) => Promise<void>;
export async function scheduleJob(type: RtJobType, key: string, delayMs: number, payload: Record<string, unknown>): Promise<void>;
export async function cancelJob(type: RtJobType, key: string): Promise<void>;
export function startJobPoller(handlers: Partial<Record<RtJobType, RtJobHandler>>, intervalMs?: number): () => void;
export async function claimDueJobs(now: number): Promise<Array<{ type: RtJobType; key: string; payload: Record<string, unknown> }>>; // exported for tests
```

- [ ] **Step 1: Write the failing test** — `apps/server/test/rt-jobs.test.ts`:

```ts
import { describe, it, expect, afterAll } from "vitest";
import { redis } from "../src/realtime/store.js";
import { scheduleJob, cancelJob, claimDueJobs, startJobPoller } from "../src/realtime/jobs.js";

describe("rt delayed jobs", () => {
  afterAll(async () => { await redis.del("rt:jobs", "rt:jobs:byKey"); await redis.quit(); });

  it("a due job is claimed by exactly ONE of N concurrent claimers", async () => {
    await scheduleJob("bot-fill", "u1", 0, { userId: "u1", mode: "CASUAL" });
    await new Promise((r) => setTimeout(r, 10));
    const now = Date.now();
    const results = await Promise.all([claimDueJobs(now), claimDueJobs(now), claimDueJobs(now), claimDueJobs(now)]);
    const total = results.reduce((n, r) => n + r.length, 0);
    expect(total).toBe(1);
    expect(results.flat()[0]).toMatchObject({ type: "bot-fill", key: "u1", payload: { userId: "u1", mode: "CASUAL" } });
  });

  it("cancelJob removes a scheduled job before it fires", async () => {
    await scheduleJob("abandon-forfeit", "m1:u1", 0, { matchId: "m1", userId: "u1" });
    await cancelJob("abandon-forfeit", "m1:u1");
    expect(await claimDueJobs(Date.now() + 1000)).toEqual([]);
  });

  it("re-scheduling the same (type,key) replaces the old fire time", async () => {
    await scheduleJob("bot-fill", "u2", 60_000, { userId: "u2" });
    await scheduleJob("bot-fill", "u2", 0, { userId: "u2" });
    const due = await claimDueJobs(Date.now() + 10);
    expect(due).toHaveLength(1);
    expect(await claimDueJobs(Date.now() + 120_000)).toEqual([]); // no duplicate left behind
  });

  it("poller dispatches to the registered handler exactly once across two pollers", async () => {
    let fires = 0;
    const stop1 = startJobPoller({ "bot-fill": async () => { fires++; } }, 50);
    const stop2 = startJobPoller({ "bot-fill": async () => { fires++; } }, 50);
    await scheduleJob("bot-fill", "u3", 60, { userId: "u3" });
    await new Promise((r) => setTimeout(r, 500));
    stop1(); stop2();
    expect(fires).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run test/rt-jobs.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** `apps/server/src/realtime/jobs.ts`:

```ts
import { redis } from "./store.js";

/**
 * Cluster-safe delayed jobs (spec §4). ZSET `rt:jobs` scored by fire-at ms;
 * member = JSON {type,key,payload}. A companion HASH `rt:jobs:byKey`
 * (`type:key` -> member) makes cancel/replace O(1). The claim Lua pops due
 * members and their byKey entries atomically, so exactly one instance wins each
 * job even with N pollers. Jobs survive instance death - the whole point:
 * today's in-process setTimeout dies with its instance.
 */
export type RtJobType = "bot-fill" | "abandon-forfeit" | "bot-move" | "d-bot-move";
export type RtJobHandler = (payload: Record<string, unknown>) => Promise<void>;

const ZKEY = "rt:jobs";
const HKEY = "rt:jobs:byKey";

const SCHEDULE_LUA = `
local old = redis.call('HGET', KEYS[2], ARGV[1])
if old then redis.call('ZREM', KEYS[1], old) end
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[3])
redis.call('HSET', KEYS[2], ARGV[1], ARGV[3])
return 1
`;
export async function scheduleJob(type: RtJobType, key: string, delayMs: number, payload: Record<string, unknown>): Promise<void> {
  const member = JSON.stringify({ type, key, payload });
  await redis.eval(SCHEDULE_LUA, 2, ZKEY, HKEY, `${type}:${key}`, String(Date.now() + delayMs), member);
}

const CANCEL_LUA = `
local old = redis.call('HGET', KEYS[2], ARGV[1])
if old then
  redis.call('ZREM', KEYS[1], old)
  redis.call('HDEL', KEYS[2], ARGV[1])
end
return 1
`;
export async function cancelJob(type: RtJobType, key: string): Promise<void> {
  await redis.eval(CANCEL_LUA, 2, ZKEY, HKEY, `${type}:${key}`);
}

const CLAIM_LUA = `
local due = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1], 'LIMIT', 0, 20)
if #due == 0 then return {} end
for i, member in ipairs(due) do
  redis.call('ZREM', KEYS[1], member)
  local j = cjson.decode(member)
  redis.call('HDEL', KEYS[2], j.type .. ':' .. j.key)
end
return due
`;
/** Atomically claim (pop) every job due at `now`. Exported for tests. */
export async function claimDueJobs(now: number): Promise<Array<{ type: RtJobType; key: string; payload: Record<string, unknown> }>> {
  const raw = (await redis.eval(CLAIM_LUA, 2, ZKEY, HKEY, String(now))) as string[];
  return raw.map((m) => JSON.parse(m));
}

/** Poll every `intervalMs` (default 1000); dispatch each claimed job to its
 *  handler. Handler errors are logged, never thrown (a bad job must not kill
 *  the poller). Returns a stop function. */
export function startJobPoller(handlers: Partial<Record<RtJobType, RtJobHandler>>, intervalMs = 1000): () => void {
  const t = setInterval(() => {
    void (async () => {
      const due = await claimDueJobs(Date.now()).catch(() => []);
      for (const job of due) {
        const h = handlers[job.type];
        if (!h) continue;
        await h(job.payload).catch((e) => console.error("[rt-jobs] handler failed", job.type, job.key, e));
      }
    })();
  }, intervalMs);
  t.unref?.();
  return () => clearInterval(t);
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run test/rt-jobs.test.ts` → PASS (4 tests). NOTE the CLAIM_LUA member/ZREM race: the whole script is atomic, so two concurrent evals cannot both see the same member — the first ZREMs it before the second's ZRANGEBYSCORE runs.
- [ ] **Step 5: Typecheck + commit** — `npx tsc --noEmit && git add src/realtime/jobs.ts test/rt-jobs.test.ts && git commit -m "feat(realtime): exactly-once Redis delayed-job queue"`

---

### Task 3: Domain wrappers (match / queue / room / spectators / presence / user-index)

**Files:**
- Modify: `apps/server/src/realtime/store.ts` (append domain section)
- Test: append to `apps/server/test/rt-store.test.ts`

**Interfaces (Produces — later tasks consume these EXACT signatures):**
```ts
export const RT_TTL = 86_400;
export type StoredMatch = { matchId: string; redId: string | null; blueId: string | null; mode: string; state: import("@dama/shared").GameState; botColor?: import("@dama/shared").PieceColor; version: number };
export async function getMatch(matchId: string): Promise<StoredMatch | null>;
export async function createMatch(m: Omit<StoredMatch, "version">): Promise<void>;          // version 0 -> CAS create; SADD user index for redId/blueId
export async function saveMatch(m: StoredMatch): Promise<boolean>;                          // casJSON; false = version conflict
export async function removeMatch(m: StoredMatch): Promise<void>;                           // DEL match + spectators + SREM user index
export async function matchIdsForUser(userId: string): Promise<string[]>;
export type QueueEntry = { userId: string; joinedAt: number; colorPref: "red" | "blue" | "either" };
export async function queuePush(mode: string, e: QueueEntry): Promise<void>;
export async function queueRemove(mode: string, userId: string): Promise<void>;
export async function queuePopPair(mode: string): Promise<[QueueEntry, QueueEntry] | null>; // atomic Lua: pops 2 only if length >= 2
export async function queueUnshift(mode: string, e: QueueEntry): Promise<void>;             // requeueFront
export async function getQueuedIn(userId: string): Promise<string | null>;
export async function setQueuedIn(userId: string, mode: string | null): Promise<void>;
export async function getRoomJSON<T>(prefix: string, code: string): Promise<T | null>;      // prefix "rt:" | "rt:d:"
export async function putRoomJSON(prefix: string, code: string, room: unknown): Promise<void>;
export async function delRoomJSON(prefix: string, code: string): Promise<void>;
export async function setUserRoom(prefix: string, userId: string, code: string | null): Promise<void>;
export async function getUserRoom(prefix: string, userId: string): Promise<string | null>;
export async function spectatorAdd(matchId: string, userId: string, socketId: string): Promise<number>;    // returns viewer count
export async function spectatorRemove(matchId: string, userId: string, socketId: string): Promise<number>;
export async function spectatorCount(matchId: string): Promise<number>;
export async function spectatorClear(matchId: string): Promise<void>;
export async function spectatorMatchesForSocket(userId: string): Promise<string[]>;
export async function presenceAdd(userId: string, socketId: string): Promise<boolean>;      // true = was offline
export async function presenceRemove(userId: string, socketId: string): Promise<boolean>;   // true = went offline
export async function presenceIsOnline(userId: string): Promise<boolean>;
export async function presenceOnlineIds(): Promise<string[]>;
```

- [ ] **Step 1: Write failing tests** (append to `rt-store.test.ts`): a `describe("rt domain wrappers")` block exercising — match create/get/save-CAS-conflict/remove + `matchIdsForUser` reflects create/remove; `queuePopPair` returns null with 1 entry and the FIFO pair with 2 (and both `queuedIn` cleared by caller semantics — pop does NOT touch queuedIn); `queueRemove` deletes mid-list entries; spectators count unique USERS not sockets (add same user twice with 2 socketIds → count 1); presenceAdd first socket → true, second → false; presenceRemove last socket → true. Keyspace to clean in afterAll: `rt:match:tm1`, `rt:userMatch:*`, `rt:mmq:CASUAL`, `rt:mmqMeta:CASUAL`, `rt:queuedIn:*`, `rt:spect:tm1`, `rt:online`, `rt:onlineSocks:*`.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** (append to `store.ts`):

```ts
// ─── Domain wrappers ────────────────────────────────────────────────────────
import type { GameState, PieceColor } from "@dama/shared";

export const RT_TTL = 86_400; // 24h safety net on match/room JSON

export type StoredMatch = { matchId: string; redId: string | null; blueId: string | null; mode: string; state: GameState; botColor?: PieceColor; version: number };
const matchKey = (id: string) => `rt:match:${id}`;
const userMatchKey = (uid: string) => `rt:userMatch:${uid}`;

export async function getMatch(matchId: string): Promise<StoredMatch | null> {
  return getJSON<StoredMatch>(matchKey(matchId));
}
export async function createMatch(m: Omit<StoredMatch, "version">): Promise<void> {
  await casJSON(matchKey(m.matchId), { ...m, version: 0 }, RT_TTL);
  const p = redis.pipeline();
  if (m.redId) p.sadd(userMatchKey(m.redId), m.matchId);
  if (m.blueId) p.sadd(userMatchKey(m.blueId), m.matchId);
  p.expire(userMatchKey(m.redId ?? ""), RT_TTL);
  await p.exec();
}
export async function saveMatch(m: StoredMatch): Promise<boolean> {
  return casJSON(matchKey(m.matchId), m, RT_TTL);
}
export async function removeMatch(m: StoredMatch): Promise<void> {
  const p = redis.pipeline();
  p.del(matchKey(m.matchId), `rt:spect:${m.matchId}`);
  if (m.redId) p.srem(userMatchKey(m.redId), m.matchId);
  if (m.blueId) p.srem(userMatchKey(m.blueId), m.matchId);
  await p.exec();
}
export async function matchIdsForUser(userId: string): Promise<string[]> {
  return redis.smembers(userMatchKey(userId));
}

// Matchmaking queue: LIST of userIds (FIFO) + HASH userId->QueueEntry JSON.
export type QueueEntry = { userId: string; joinedAt: number; colorPref: "red" | "blue" | "either" };
const qKey = (m: string) => `rt:mmq:${m}`;
const qMeta = (m: string) => `rt:mmqMeta:${m}`;

export async function queuePush(mode: string, e: QueueEntry): Promise<void> {
  await redis.pipeline().rpush(qKey(mode), e.userId).hset(qMeta(mode), e.userId, JSON.stringify(e)).exec();
}
export async function queueUnshift(mode: string, e: QueueEntry): Promise<void> {
  await redis.pipeline().lpush(qKey(mode), e.userId).hset(qMeta(mode), e.userId, JSON.stringify(e)).exec();
}
export async function queueRemove(mode: string, userId: string): Promise<void> {
  await redis.pipeline().lrem(qKey(mode), 0, userId).hdel(qMeta(mode), userId).exec();
}
const POP_PAIR_LUA = `
if redis.call('LLEN', KEYS[1]) < 2 then return nil end
local a = redis.call('LPOP', KEYS[1])
local b = redis.call('LPOP', KEYS[1])
local ma = redis.call('HGET', KEYS[2], a)
local mb = redis.call('HGET', KEYS[2], b)
redis.call('HDEL', KEYS[2], a, b)
return {ma, mb}
`;
export async function queuePopPair(mode: string): Promise<[QueueEntry, QueueEntry] | null> {
  const res = (await redis.eval(POP_PAIR_LUA, 2, qKey(mode), qMeta(mode))) as [string, string] | null;
  if (!res) return null;
  return [JSON.parse(res[0]), JSON.parse(res[1])];
}
export async function getQueuedIn(userId: string): Promise<string | null> {
  return redis.get(`rt:queuedIn:${userId}`);
}
export async function setQueuedIn(userId: string, mode: string | null): Promise<void> {
  if (mode) await redis.set(`rt:queuedIn:${userId}`, mode, "EX", 3600);
  else await redis.del(`rt:queuedIn:${userId}`);
}

// Rooms (generic over prefix so damath reuses: prefix "rt:" or "rt:d:").
export async function getRoomJSON<T>(prefix: string, code: string): Promise<T | null> {
  return getJSON<T>(`${prefix}room:${code}`);
}
export async function putRoomJSON(prefix: string, code: string, room: unknown): Promise<void> {
  await setJSON(`${prefix}room:${code}`, room, RT_TTL);
}
export async function delRoomJSON(prefix: string, code: string): Promise<void> {
  await delKey(`${prefix}room:${code}`);
}
export async function setUserRoom(prefix: string, userId: string, code: string | null): Promise<void> {
  if (code) await redis.set(`${prefix}userRoom:${userId}`, code, "EX", RT_TTL);
  else await redis.del(`${prefix}userRoom:${userId}`);
}
export async function getUserRoom(prefix: string, userId: string): Promise<string | null> {
  return redis.get(`${prefix}userRoom:${userId}`);
}

// Spectators: HASH rt:spect:<matchId> field userId -> JSON string[] of socketIds.
// Count = unique users (HLEN). Also index rt:spectByUser:<userId> -> SET matchIds
// so a disconnecting socket can find its matches without scanning.
export async function spectatorAdd(matchId: string, userId: string, socketId: string): Promise<number> {
  const key = `rt:spect:${matchId}`;
  const cur = JSON.parse((await redis.hget(key, userId)) ?? "[]") as string[];
  if (!cur.includes(socketId)) cur.push(socketId);
  await redis.pipeline().hset(key, userId, JSON.stringify(cur)).expire(key, RT_TTL)
    .sadd(`rt:spectByUser:${userId}`, matchId).expire(`rt:spectByUser:${userId}`, RT_TTL).exec();
  return redis.hlen(key);
}
export async function spectatorRemove(matchId: string, userId: string, socketId: string): Promise<number> {
  const key = `rt:spect:${matchId}`;
  const cur = JSON.parse((await redis.hget(key, userId)) ?? "[]") as string[];
  const next = cur.filter((s) => s !== socketId);
  const p = redis.pipeline();
  if (next.length === 0) { p.hdel(key, userId); p.srem(`rt:spectByUser:${userId}`, matchId); }
  else p.hset(key, userId, JSON.stringify(next));
  await p.exec();
  return redis.hlen(key);
}
export async function spectatorCount(matchId: string): Promise<number> {
  return redis.hlen(`rt:spect:${matchId}`);
}
export async function spectatorClear(matchId: string): Promise<void> {
  await delKey(`rt:spect:${matchId}`);
}
export async function spectatorMatchesForSocket(userId: string): Promise<string[]> {
  return redis.smembers(`rt:spectByUser:${userId}`);
}

// Presence: SET rt:onlineSocks:<userId> of socketIds + SET rt:online of userIds.
export async function presenceAdd(userId: string, socketId: string): Promise<boolean> {
  const n = await redis.sadd(`rt:onlineSocks:${userId}`, socketId);
  await redis.expire(`rt:onlineSocks:${userId}`, RT_TTL);
  if (n === 1 && (await redis.scard(`rt:onlineSocks:${userId}`)) === 1) {
    await redis.sadd("rt:online", userId);
    return true;
  }
  return false;
}
export async function presenceRemove(userId: string, socketId: string): Promise<boolean> {
  await redis.srem(`rt:onlineSocks:${userId}`, socketId);
  const left = await redis.scard(`rt:onlineSocks:${userId}`);
  if (left === 0) { await redis.srem("rt:online", userId); return true; }
  return false;
}
export async function presenceIsOnline(userId: string): Promise<boolean> {
  return (await redis.scard(`rt:onlineSocks:${userId}`)) > 0;
}
export async function presenceOnlineIds(): Promise<string[]> {
  return redis.smembers("rt:online");
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run test/rt-store.test.ts` → PASS (all).
- [ ] **Step 5: Typecheck + commit** — `git commit -m "feat(realtime): Redis domain wrappers (match/queue/room/spectators/presence)"`

---

### Task 4: Adapter wiring + poller start (index.ts)

**Files:**
- Modify: `apps/server/src/index.ts` (io creation at :154) and `apps/server/src/realtime/index.ts`

**Interfaces:**
- Consumes: `makeRedisClient` (Task 1), `startJobPoller` (Task 2), job handlers registered by Tasks 5–6 via a new export from `realtime/index.ts`: `export function rtJobHandlers(io: IOServer): Partial<Record<RtJobType, RtJobHandler>>` (assembled from `match.ts`/`matchmaking.ts`/`damath-match.ts` exports).

- [ ] **Step 1: Wire the adapter** in `apps/server/src/index.ts` (inside the boot path, right after `const io = new IOServer(...)`):

```ts
import { createAdapter } from "@socket.io/redis-adapter";
import { makeRedisClient } from "./realtime/store.js";
import { startJobPoller } from "./realtime/jobs.js";
import { rtJobHandlers } from "./realtime/index.js";
// after: const io = new IOServer(app.server, {...});
const rtPub = makeRedisClient();
const rtSub = makeRedisClient();
io.adapter(createAdapter(rtPub, rtSub));
registerRealtime(io);
startJobPoller(rtJobHandlers(io));
```
(`rtJobHandlers` lands with placeholders `{}` here and is filled by Tasks 5–6; declare it now in `realtime/index.ts` returning `{}` so this compiles: `export function rtJobHandlers(_io: IOServer): Partial<Record<RtJobType, RtJobHandler>> { return {}; }`.)

- [ ] **Step 2: Adapter smoke assertion** — extend `test/rt-two-instance.test.ts` later (Task 7). For THIS task verify: `npx tsc --noEmit` passes and the full suite still passes: `pnpm vitest run` (the existing single-instance socket tests must be green — the adapter changes nothing at one instance).
- [ ] **Step 3: Commit** — `git commit -m "feat(realtime): socket.io Redis adapter + job poller wiring"`

---

### Task 5: Migrate match.ts (moves, settle, abandon, spectators, rematch, forfeit)

**Files:**
- Modify: `apps/server/src/realtime/match.ts` (858 lines — the core migration)
- Modify: `apps/server/src/realtime/index.ts` (fill `rtJobHandlers`)
- Test: existing `test/matches-live-rooms.test.ts`, `test/mm-device.test.ts` must stay green.

**Interfaces:**
- Consumes: `getMatch/createMatch/saveMatch/removeMatch/matchIdsForUser/withLock/LOCK_BUSY/spectator*` (Task 3), `scheduleJob/cancelJob` (Task 2).
- Produces: `export async function handleAbandonForfeit(io, payload: {matchId, userId})`, `export async function handleBotMove(io, payload: {matchId})` — job handlers; `createLiveMatch` becomes `async` (callers in matchmaking.ts/rooms.ts updated in their tasks); `forfeitLiveMatch(io, matchId, winnerColor)` keeps its signature; `maybePlayBotMove(io, matchId)` keeps its signature but schedules a `bot-move` job (delay 900ms) instead of setTimeout.

Conversion table (every in-memory structure in this file):

| Old (file:line) | New |
|---|---|
| `const live = new Map()` (:47) | `getMatch`/`saveMatch`/`removeMatch` |
| `const spectators` (:57) | `spectator*` wrappers |
| `const abandonTimers` (:139) | `scheduleJob("abandon-forfeit", `${matchId}:${userId}`, ABANDON_MS, {matchId,userId})` / `cancelJob` in `clearAbandon` |
| `const rematchOffers` (:164) + `pruneRematchOffers` (:~830) | `rt:rematch:<matchId>` via `setJSON(key, offer, 60)` — native TTL; DELETE pruneRematchOffers entirely |
| `lm.settled` flag (:392,395) | DB gate (below) |
| bot `setTimeout` in `maybePlayBotMove` (:246) | `scheduleJob("bot-move", matchId, 900, {matchId})` |
| disconnect scan `for (const lm of live.values())` (:840) | `for (const matchId of await matchIdsForUser(userId))` |
| disconnect presence check `io.sockets.adapter.rooms.get(...)` (:838) | `const socks = await io.in(`presence:${userId}`).fetchSockets(); if (socks.length > 0) return;` (cluster-wide with adapter) |
| spectator disconnect scan `[...spectators.keys()]` (:825) | `await spectatorMatchesForSocket(userId)` |

- [ ] **Step 1: The mutation template.** EVERY match mutation (matchMove, matchResign, forfeitLiveMatch, abandon handler, bot-move handler, rematch-start) uses this exact shape — write it once as a local helper in match.ts:

```ts
/** Run a validated state mutation on a match with cluster-safe serialization.
 *  mutate() returns the NEXT GameState or null to abort silently. afterSave
 *  runs once the CAS write landed (broadcast + settle). One CAS-conflict retry
 *  (a racer won between our GET and SET while our lock had expired). */
async function mutateMatch(
  io: IOServer,
  matchId: string,
  mutate: (lm: StoredMatch) => GameState | null,
  afterSave: (lm: StoredMatch) => Promise<void>,
): Promise<"ok" | "busy" | "gone" | "aborted"> {
  for (let round = 0; round < 2; round++) {
    const res = await withLock(`match:${matchId}`, async () => {
      const lm = await getMatch(matchId);
      if (!lm) return "gone" as const;
      const next = mutate(lm);
      if (!next) return "aborted" as const;
      const updated = { ...lm, state: next };
      if (!(await saveMatch(updated))) return "conflict" as const;
      await afterSave(updated);
      return "ok" as const;
    });
    if (res === LOCK_BUSY) return "busy";
    if (res !== "conflict") return res;
  }
  return "busy";
}
```

- [ ] **Step 2: Rewrite `EV.matchMove`** (current handler at :584-644) with identical validation order and identical emits:

```ts
socket.on(EV.matchMove, async (payload: { matchId?: unknown; move?: unknown } = {}) => {
  const matchId = typeof payload?.matchId === "string" ? payload.matchId : null;
  const move = payload?.move as Move | undefined;
  if (!matchId || !move) { socket.emit(EV.matchIllegal, { reason: "bad-request" }); return; }

  let applied: StoredMatch | null = null;
  const res = await mutateMatch(io, matchId, (lm) => {
    const myColor = colorOf(lm, userId);
    if (!myColor) { socket.emit(EV.matchIllegal, { matchId, reason: "not-a-player" }); return null; }
    if (lm.state.result) { socket.emit(EV.matchIllegal, { matchId, reason: "match-over" }); return null; }
    if (lm.state.turn !== myColor) { socket.emit(EV.matchIllegal, { matchId, reason: "not-your-turn" }); return null; }
    if (!isLegal(lm.state, move)) { socket.emit(EV.matchIllegal, { matchId, reason: "illegal-move" }); return null; }
    try { return applyMove(lm.state, move); }
    catch { socket.emit(EV.matchIllegal, { matchId, reason: "illegal-move" }); return null; }
  }, async (lm) => {
    applied = lm;
    prisma.match.update({ where: { id: matchId }, data: { moves: lm.state.history as unknown as object } })
      .catch((e) => console.error("[match] move persist failed", matchId, e));
    io.to(matchId).emit(EV.matchMoved, { matchId, move, state: lm.state });
  });

  if (res === "gone") { socket.emit(EV.matchIllegal, { matchId, reason: "no-such-match" }); return; }
  if (res === "busy") { socket.emit(EV.matchIllegal, { matchId, reason: "busy" }); return; }
  if (res !== "ok" || !applied) return;
  const lm = applied as StoredMatch;
  if (lm.state.result) await settleMatch(io, lm);
  else maybePlayBotMove(io, matchId);
});
```

- [ ] **Step 3: DB-gated settle.** In `settleMatch` replace the `if (lm.settled) return; ... lm.settled = true;` guard and the `prisma.match.update` (:438-449) with:

```ts
const result = lm.state.result;
if (!result) return;
const gate = await prisma.match.updateMany({
  where: { id: lm.matchId, endedAt: null },
  data: { winner: result.winner, reason: result.reason, moves: lm.state.history as unknown as object,
          redTrophyDelta: isRankedMode ? redTrophyDelta : null, blueTrophyDelta: isRankedMode ? blueTrophyDelta : null,
          goldReward, endedAt: new Date() },
});
if (gate.count === 0) return; // another instance already settled — no grants, no broadcast
```
(The delta computation stays ABOVE the gate exactly as today; the grants/broadcast/`removeMatch(lm)` + `spectatorClear` + end-hooks run only after `count === 1`.) Delete the `settled` field from the match type.

- [ ] **Step 4: Abandon via jobs.** Replace the disconnect timer block (:833-857) with the conversion-table versions; implement + export the handler:

```ts
export async function handleAbandonForfeit(io: IOServer, payload: Record<string, unknown>): Promise<void> {
  const matchId = String(payload.matchId); const userId = String(payload.userId);
  const socks = await io.in(`presence:${userId}`).fetchSockets();
  if (socks.length > 0) return; // reconnected somewhere in the cluster
  await mutateMatch(io, matchId, (lm) => {
    if (lm.state.result) return null;
    const color = colorOf(lm, userId);
    if (!color) return null;
    const winner: PieceColor = color === "red" ? "blue" : "red";
    return { ...lm.state, result: { winner, reason: "abandon" } };
  }, async (lm) => { await settleMatch(io, lm); });
}
```
`clearAbandon(matchId, userId)` (called from matchResync :684) becomes `void cancelJob("abandon-forfeit", `${matchId}:${userId}`)`.

- [ ] **Step 5: Bot move via jobs.** `maybePlayBotMove(io, matchId)` body becomes `void scheduleJob("bot-move", matchId, 900, { matchId })`; move its current setTimeout body into `export async function handleBotMove(io, payload)` using `mutateMatch` (mutate: re-check `botColor`, `turn === botColor`, no result → `bestMove` + `applyMove`; afterSave: persist-moves + `io.to(matchId).emit(EV.matchMoved, ...)`), then after `"ok"`: settle if result else `maybePlayBotMove(io, matchId)` again (consecutive-turn recursion preserved).
- [ ] **Step 6: The rest of the table** — createLiveMatch → `await createMatch({...})` (async; return the StoredMatch); resync/spectate/chat/rematch handlers read via `getMatch`; rematch offers via `setJSON/getJSON` with TTL 60; `forfeitLiveMatch` through `mutateMatch`. Fill `rtJobHandlers` in `realtime/index.ts`: `{ "abandon-forfeit": (p) => handleAbandonForfeit(io, p), "bot-move": (p) => handleBotMove(io, p) }`.
- [ ] **Step 7: Verify** — `npx tsc --noEmit` then `pnpm vitest run test/mm-device.test.ts test/matches-live-rooms.test.ts test/rooms-mine.test.ts` → PASS unchanged (their event contracts are untouched; they now exercise the Redis path).
- [ ] **Step 8: Commit** — `git commit -m "feat(realtime): match.ts on Redis - lock+CAS moves, DB-gated settle, job-based abandon/bot"`

---

### Task 6: Migrate matchmaking.ts + presence.ts

**Files:**
- Modify: `apps/server/src/realtime/matchmaking.ts`, `apps/server/src/realtime/presence.ts`, `apps/server/src/realtime/index.ts` (add `bot-fill` handler)
- Test: existing `test/mm-device.test.ts` green; extend with a queue-persistence assertion.

Conversion (matchmaking.ts): `queues`/`queuedIn` → `queuePush/queuePopPair/queueRemove/queueUnshift/getQueuedIn/setQueuedIn`; `botTimers` → `scheduleJob("bot-fill", userId, botFillDelay(), { userId, mode, colorPref })` + `cancelJob("bot-fill", userId)` inside `leaveAllQueues` (which becomes async — update both call sites in this file and the `registerMatchmaking` disconnect handler). `tryMatch` loop: `while (true) { const pair = await queuePopPair(mode); if (!pair) break; ... }` — the existing `currentSocketForUser`/`notifyDropped`/`requeueFront` logic carries over with `queueUnshift`. `startBotMatch` drops its poller-independent re-checks? NO — keep every re-check (still-queued guard via `getQueuedIn(userId) === mode`); it becomes the `bot-fill` job handler: `export async function handleBotFill(io, payload)` calling the existing `startBotMatch(io, userId, mode, colorPref)`.
Conversion (presence.ts): `online` Map → `presenceAdd/presenceRemove/presenceIsOnline/presenceOnlineIds`; exported `isOnline`/`onlineUserIds` become async — update their callers (`grep -rn "isOnline\|onlineUserIds" src/` — friends/presence snapshot call sites) to await.

- [ ] **Step 1:** Apply conversions; keep every emit identical.
- [ ] **Step 2:** Extend `mm-device.test.ts` with: enqueue user A only → assert `await getQueuedIn(A)` returns "CASUAL" (queue state is inspectable in Redis, proving externalization).
- [ ] **Step 3: Verify** — `npx tsc --noEmit && pnpm vitest run` (full suite) → green.
- [ ] **Step 4: Commit** — `git commit -m "feat(realtime): matchmaking + presence on Redis, bot-fill as exactly-once job"`

---

### Task 7: Migrate rooms.ts + damath modules

**Files:**
- Modify: `apps/server/src/realtime/rooms.ts` (449 l), `damath-match.ts` (265 l), `damath-matchmaking.ts` (149 l), `damath-rooms.ts` (233 l), `realtime/index.ts` (add `d-bot-move` handler if damath has bot turns — check; if none, drop the type).
- Test: existing `test/rooms-mine.test.ts`, `test/matches-live-rooms.test.ts`, any damath tests — green.

Rooms conversion: the `rooms` Map + `userRoom` Map → `getRoomJSON/putRoomJSON/delRoomJSON` + `setUserRoom/getUserRoom` with prefix `"rt:"`; every multi-step room mutation (join/leave/kick/ban/settings/start) wraps in `withLock(`room:${code}`, ...)` with a single get→mutate→put inside (rooms carry no version field — the lock alone serializes them; they have no expired-lock money risk). `roomForUser` → `getUserRoom`. `Member.sockets: Set<string>` becomes `string[]` in the JSON shape (same semantics). The `matchEndHooks` registration mechanism stays in-process (every instance registers at import; the settling instance fires it; the hook's room mutations go through the Redis store, so the effect is cluster-visible).
Damath: identical treatment with prefix `"rt:d:"` and its own key names — mechanical port of the same three patterns (match CAS via `casJSON` on `rt:d:match:<id>`, rooms via prefix, queue via `rt:d:mmq:<mode>` reusing the queue wrappers with mode strings like `"DAMATH"`). Damath is web-only product-wise but shares the binary — it must not break under replicas.

- [ ] **Step 1:** rooms.ts conversion. **Step 2:** damath-* conversion. **Step 3:** `npx tsc --noEmit && pnpm vitest run` → full suite green. **Step 4:** Commit — `git commit -m "feat(realtime): rooms + damath on Redis"`

---

### Task 8: Two-instance concurrency integration test

**Files:**
- Create: `apps/server/test/rt-two-instance.test.ts` (harness copied from `mm-device.test.ts:37-68`, extended: TWO http+IOServer pairs, EACH with `io.adapter(createAdapter(makeRedisClient(), makeRedisClient()))` and each running `startJobPoller(rtJobHandlers(io), 100)`).

Assertions (each its own `it`, using `seedUser`/`truncateAll` from `./helpers.js`):
1. **Cross-instance pairing + play:** client A → server1, client B → server2; both `mmJoin CASUAL` → both receive `mmFound` with the SAME matchId; A emits `matchMove` (first legal move from `legalMoves(createInitialState(...))`) on server1 → B receives `matchMoved` on server2 with the applied state (cross-instance broadcast + shared state proven).
2. **Double-apply race:** with a live match in Redis, call the exported `handleBotMove`-style path concurrently — simpler and deterministic: fire `casJSON` directly — two concurrent `mutateMatch`-equivalent writers built from `getMatch` + `saveMatch` with the SAME loaded version → exactly one `saveMatch` returns true.
3. **Settle exactly once:** seed a finished `StoredMatch` (state.result set) + its Prisma match row with `endedAt: null`; run `settleMatch(io, lm)` twice concurrently (import from match.ts); assert the match row has `endedAt` set AND `prisma.ledgerEntry.count({ where: { refType: "match", refId: matchId } })` equals the single-settle count (2 rows for a ranked human-v-human: winner trophies + winner gold... use CASUAL: exactly 1 gold row).
4. **Bot-fill exactly once across pollers:** one queued user on server1, both pollers running at 100ms; `scheduleJob("bot-fill", ...)` with delay 0 → within 2s the user receives exactly ONE `mmFound` (count events for 3s).
5. **Job survives instance death:** schedule `abandon-forfeit` with delay 200ms; `stop()` server1's poller (the "arming instance dies"); server2's poller fires it → match settles (row `endedAt` set).

- [ ] **Step 1:** Write the file with the 5 tests (full harness + the exact assertions above).
- [ ] **Step 2:** `pnpm vitest run test/rt-two-instance.test.ts` → PASS ×5.
- [ ] **Step 3:** Full sweep: `npx tsc --noEmit && pnpm vitest run` → entire suite green.
- [ ] **Step 4:** Commit — `git commit -m "test(realtime): two-instance concurrency suite - pairing, CAS race, single settle, exactly-once jobs"`

---

### Task 9: Final verification + PR

- [ ] **Step 1:** `cd apps/server && npx tsc --noEmit && pnpm vitest run` — everything green locally-in-CI-terms.
- [ ] **Step 2:** Grep sweep — no orphaned in-memory state remains: `grep -rn "new Map<" src/realtime/` must return ZERO hits in match.ts/matchmaking.ts/rooms.ts/presence.ts/damath-*.ts (rate-limit.ts's per-socket limiter Map is per-connection and MAY stay).
- [ ] **Step 3:** Push branch `feat/realtime-redis-scale`, open PR to `main` titled `feat(realtime): Redis-authoritative state + adapter — API can run N replicas`, body summarizing spec §1-7 + test evidence. Merge ONLY on green CI and MERGEABLE (standing owner rule).
- [ ] **Step 4:** After merge: prod auto-deploys at replicas=1 (behavior-identical soak). Raising replicas is an OWNER action in Railway — never done by the implementer.

## Self-Review (done at write time)

- **Spec coverage:** adapter (T4), store (T1/T3), lock+CAS (T1/T5), jobs (T2/T5/T6), DB-gated settle (T5), module migrations (T5-T7), 2-instance CI test (T8), rollout gate (T9). Rematch native TTL (T5). connectionStateRecovery trade-off — no task needed (config untouched). ✓
- **Placeholders:** none — every code step has the code or an exact conversion table with named wrapper signatures pinned in Task 3. ✓
- **Type consistency:** `StoredMatch` (T3) consumed by T5/T8; `QueueEntry` by T6; `RtJobType` includes `d-bot-move` — T7 drops it if damath has no bot turns (explicitly instructed). `mutateMatch` is match.ts-local (T5) and referenced only there + mirrored inline in T8's race test. ✓
