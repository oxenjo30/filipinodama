import Redis from "ioredis";
import { randomUUID } from "node:crypto";
import type { GameState, PieceColor } from "@dama/shared";
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

// ─── Domain wrappers ────────────────────────────────────────────────────────
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
  if (m.redId) { p.sadd(userMatchKey(m.redId), m.matchId); p.expire(userMatchKey(m.redId), RT_TTL); }
  if (m.blueId) { p.sadd(userMatchKey(m.blueId), m.matchId); p.expire(userMatchKey(m.blueId), RT_TTL); }
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
/**
 * Which queue a user is currently sitting in, tracked PER matchmaking FAMILY.
 *
 * Classic (CASUAL/RANKED) and Damath are independent matchmaking systems that
 * happen to key membership by userId. They MUST NOT share one pointer: if they
 * did, a user queued for Classic then joining Damath would overwrite the Classic
 * pointer, and each family's cancel/gate (leaveAllQueues, leaveDamathQueue, the
 * bot-fill re-check) would read the OTHER family's mode — silently dropping the
 * wrong queue or refusing to fill. The `family` segment isolates them.
 *
 * `family` defaults to "classic" so the key stays `rt:queuedIn:<userId>`
 * verbatim for Classic — no migration for any in-flight Classic waiter. Damath
 * passes "damath", landing on the distinct `rt:queuedIn:damath:<userId>`.
 */
const queuedInKey = (family: string, userId: string) =>
  family === "classic" ? `rt:queuedIn:${userId}` : `rt:queuedIn:${family}:${userId}`;

export async function getQueuedIn(userId: string, family = "classic"): Promise<string | null> {
  return redis.get(queuedInKey(family, userId));
}
export async function setQueuedIn(userId: string, mode: string | null, family = "classic"): Promise<void> {
  if (mode) await redis.set(queuedInKey(family, userId), mode, "EX", 3600);
  else await redis.del(queuedInKey(family, userId));
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

// Spectators: SET rt:spectSocks:<matchId>:<userId> of socketIds (per-user socket
// set, atomic add/remove) + SET rt:spect:<matchId> of userIds currently spectating
// (added on first socket, removed on last). Count = unique users (SCARD rt:spect).
// Also index rt:spectByUser:<userId> -> SET matchIds so a disconnecting socket can
// find its matches without scanning. Add/remove are single Lua scripts so the
// "first/last socket" check and the rt:spect/rt:spectByUser membership updates
// happen atomically — a JSON-array read-modify-write (the old design) silently
// drops a socketId when two adds/removes for the same user race.
const SPECTATOR_ADD_LUA = `
redis.call('SADD', KEYS[1], ARGV[1])
redis.call('EXPIRE', KEYS[1], ARGV[2])
if redis.call('SCARD', KEYS[1]) == 1 then
  redis.call('SADD', KEYS[2], ARGV[3])
  redis.call('SADD', KEYS[3], ARGV[4])
  redis.call('EXPIRE', KEYS[3], ARGV[2])
end
redis.call('EXPIRE', KEYS[2], ARGV[2])
return redis.call('SCARD', KEYS[2])
`;
export async function spectatorAdd(matchId: string, userId: string, socketId: string): Promise<number> {
  return (await redis.eval(
    SPECTATOR_ADD_LUA,
    3,
    `rt:spectSocks:${matchId}:${userId}`,
    `rt:spect:${matchId}`,
    `rt:spectByUser:${userId}`,
    socketId,
    String(RT_TTL),
    userId,
    matchId
  )) as number;
}
const SPECTATOR_REMOVE_LUA = `
redis.call('SREM', KEYS[1], ARGV[1])
if redis.call('SCARD', KEYS[1]) == 0 then
  redis.call('SREM', KEYS[2], ARGV[2])
  redis.call('SREM', KEYS[3], ARGV[3])
  redis.call('DEL', KEYS[1])
end
return redis.call('SCARD', KEYS[2])
`;
export async function spectatorRemove(matchId: string, userId: string, socketId: string): Promise<number> {
  return (await redis.eval(
    SPECTATOR_REMOVE_LUA,
    3,
    `rt:spectSocks:${matchId}:${userId}`,
    `rt:spect:${matchId}`,
    `rt:spectByUser:${userId}`,
    socketId,
    userId,
    matchId
  )) as number;
}
export async function spectatorCount(matchId: string): Promise<number> {
  return redis.scard(`rt:spect:${matchId}`);
}
export async function spectatorClear(matchId: string): Promise<void> {
  // Per-user socket sets (rt:spectSocks:<matchId>:*) are left to expire via their
  // own RT_TTL rather than scanned/deleted here — match end is the common case and
  // this keeps the clear a single O(1) DEL.
  await delKey(`rt:spect:${matchId}`);
}
export async function spectatorMatchesForSocket(userId: string): Promise<string[]> {
  return redis.smembers(`rt:spectByUser:${userId}`);
}

// Presence: SET rt:onlineSocks:<userId> of socketIds + SET rt:online of userIds.
// Add/remove are single Lua scripts so the "is this the first/last socket" check
// and the rt:online membership update happen atomically — otherwise two concurrent
// sockets for the same user can both observe SCARD != 1 and neither one flips
// rt:online (TOCTOU race between the SADD/SREM and the follow-up SCARD).
const PRESENCE_ADD_LUA = `
redis.call('SADD', KEYS[1], ARGV[1])
redis.call('EXPIRE', KEYS[1], ARGV[2])
local n = redis.call('SCARD', KEYS[1])
if n == 1 then
  redis.call('SADD', KEYS[2], ARGV[3])
  return 1
end
return 0
`;
export async function presenceAdd(userId: string, socketId: string): Promise<boolean> {
  const ok = (await redis.eval(
    PRESENCE_ADD_LUA,
    2,
    `rt:onlineSocks:${userId}`,
    "rt:online",
    socketId,
    String(RT_TTL),
    userId
  )) as number;
  return ok === 1;
}
const PRESENCE_REMOVE_LUA = `
redis.call('SREM', KEYS[1], ARGV[1])
local n = redis.call('SCARD', KEYS[1])
if n == 0 then
  redis.call('SREM', KEYS[2], ARGV[2])
  return 1
end
return 0
`;
export async function presenceRemove(userId: string, socketId: string): Promise<boolean> {
  const ok = (await redis.eval(
    PRESENCE_REMOVE_LUA,
    2,
    `rt:onlineSocks:${userId}`,
    "rt:online",
    socketId,
    userId
  )) as number;
  return ok === 1;
}
export async function presenceIsOnline(userId: string): Promise<boolean> {
  return (await redis.scard(`rt:onlineSocks:${userId}`)) > 0;
}
export async function presenceOnlineIds(): Promise<string[]> {
  return redis.smembers("rt:online");
}
