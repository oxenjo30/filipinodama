import { prisma } from "../db/client.js";

type Entry = { value: string | null; at: number };
const TTL_MS = 15_000;
const cache = new Map<string, Entry>();

export function invalidateConfig(key?: string): void {
  if (key) cache.delete(key);
  else cache.clear();
}

export async function getConfig(key: string): Promise<string | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const row = await prisma.config.findUnique({ where: { key }, select: { value: true } });
  const value = row ? row.value : null;
  cache.set(key, { value, at: Date.now() });
  return value;
}

export async function getBool(key: string, fallback: boolean): Promise<boolean> {
  const v = await getConfig(key);
  if (v == null) return fallback;
  return v === "true";
}

export async function getInt(key: string, fallback: number): Promise<number> {
  const v = await getConfig(key);
  if (v == null) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}
