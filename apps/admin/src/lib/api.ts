/**
 * Admin API client. Same-origin session cookie is the auth (reused from the
 * player login) — every request sends credentials; the server's requireAdmin
 * guard rejects non-admins with 403. VITE_API_URL points at the API origin
 * (api.filipinodama.com in prod; empty/dev proxy locally).
 */
const BASE = (import.meta.env.VITE_API_URL as string) || "";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
  });
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
