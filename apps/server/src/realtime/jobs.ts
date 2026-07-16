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
