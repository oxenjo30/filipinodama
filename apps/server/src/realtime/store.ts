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
