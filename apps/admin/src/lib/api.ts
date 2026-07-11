/**
 * Admin API client. Same-origin session cookie is the auth (reused from the
 * player login) — every request sends credentials; the server's requireAdmin
 * guard rejects non-admins with 403. VITE_API_URL points at the API origin
 * (api.filipinodama.com in prod; empty/dev proxy locally).
 *
 * On a 401 (short-lived access token expired) it transparently refreshes once
 * via POST /api/auth/refresh (longer-lived refresh cookie) and retries — same
 * behaviour as the player web client. Without this, an expired access token
 * 401'd EVERY admin call (list/create/etc.) until a manual re-login.
 */
const BASE = (import.meta.env.VITE_API_URL as string) || "";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

// Single-flight refresh: concurrent 401s share ONE /auth/refresh call.
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
    headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
  });

  // Expired access token → refresh once (using the refresh cookie) and retry.
  // Never retry the auth endpoints themselves (avoids an infinite loop).
  if (res.status === 401 && retry && !path.startsWith("/api/auth/")) {
    if (await tryRefresh()) return request<T>(path, opts, false);
  }

  let body: Envelope<T>;
  try {
    body = await res.json();
  } catch {
    throw new ApiError(res.status, "BAD_RESPONSE", `Server returned ${res.status}`);
  }
  if (!body.ok) throw new ApiError(res.status, body.error.code, body.error.message);
  return body.data;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(data ?? {}) }),
  patch: <T>(path: string, data?: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(data ?? {}) }),
  del: <T>(path: string, data?: unknown) => request<T>(path, { method: "DELETE", body: JSON.stringify(data ?? {}) }),
};
