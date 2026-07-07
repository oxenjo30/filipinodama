/**
 * api.ts — the single HTTP client for talking to the game server.
 *
 * All calls go to VITE_API_URL (default http://localhost:4000), send cookies
 * (httpOnly JWT session), and unwrap the server's `{ ok, data }` / `{ ok, error }`
 * envelope. On a 401 it transparently tries a refresh once, then retries.
 */

const BASE = (import.meta.env.VITE_API_URL as string) || "http://localhost:4000";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch(`${BASE}/api/auth/refresh`, { method: "POST", credentials: "include" })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

async function request<T>(path: string, opts: RequestInit = {}, retry = true): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    credentials: "include",
    headers: {
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(opts.headers || {}),
    },
  });

  if (res.status === 401 && retry && !path.startsWith("/api/auth/")) {
    if (await tryRefresh()) return request<T>(path, opts, false);
  }

  let body: Envelope<T>;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    throw new ApiError(res.status, "BAD_RESPONSE", `Server returned ${res.status}`);
  }
  if (!body.ok) throw new ApiError(res.status, body.error.code, body.error.message);
  return body.data;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "POST", body: data ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "PATCH", body: data ? JSON.stringify(data) : undefined }),
  del: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "DELETE", body: data ? JSON.stringify(data) : undefined }),
  base: BASE,
};

/** The user shape the server's publicUser() returns. */
export type Me = {
  id: string;
  email: string | null;
  emailVerified: boolean;
  isGuest: boolean;
  username: string;
  displayName: string;
  tag: string;
  bio: string | null;
  avatarUrl: string | null;
  countryCode: string | null;
  trophies: number;
  gold: number;
  diamonds: number;
  rankTier: string;
  equippedBoard: string | null;
  equippedSkin: string | null;
  frameId: string | null;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  adminRole: string | null;
};
