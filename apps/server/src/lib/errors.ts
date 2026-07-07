/**
 * Typed API errors + the standard response envelope. Every route returns
 * `{ ok: true, data }` or `{ ok: false, error: { code, message } }`.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const err = {
  badRequest: (code = "BAD_REQUEST", msg = "Invalid request") => new ApiError(400, code, msg),
  unauthorized: (code = "UNAUTHORIZED", msg = "Not authenticated") => new ApiError(401, code, msg),
  forbidden: (code = "FORBIDDEN", msg = "Not allowed") => new ApiError(403, code, msg),
  notFound: (code = "NOT_FOUND", msg = "Not found") => new ApiError(404, code, msg),
  conflict: (code = "CONFLICT", msg = "Conflict") => new ApiError(409, code, msg),
  tooMany: (code = "RATE_LIMITED", msg = "Too many requests") => new ApiError(429, code, msg),
  notConfigured: (feature: string) => new ApiError(503, "NOT_CONFIGURED", `${feature} is not configured`),
};

export const ok = <T>(data: T) => ({ ok: true as const, data });
export const fail = (code: string, message: string) => ({ ok: false as const, error: { code, message } });
