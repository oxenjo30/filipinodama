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
