import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { env } from "../config/env.js";

export type AccessClaims = { sub: string; isGuest: boolean; adminRole?: string | null };

export function signAccess(claims: AccessClaims): string {
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_TTL as any });
}
export function verifyAccess(token: string): AccessClaims {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessClaims;
}

/** Refresh tokens are opaque random strings stored (hashed) in Session. */
export function newRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

export function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}
export function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

/** A short opaque token for email verification / password reset. */
export function opaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

/** A #1234-style discriminator so usernames can repeat. */
export function randomTag(): string {
  return "#" + String(Math.floor(1000 + Math.random() * 9000));
}

/** ms helper for cookie maxAge from a TTL string like "15m" / "30d". */
export function ttlToMs(ttl: string): number {
  const m = /^(\d+)([smhd])$/.exec(ttl);
  if (!m) return 0;
  const n = Number(m[1]);
  return n * { s: 1e3, m: 6e4, h: 36e5, d: 864e5 }[m[2] as "s" | "m" | "h" | "d"];
}

export const COOKIE = {
  access: "fd_access",
  refresh: "fd_refresh",
} as const;

export function cookieOpts(maxAgeMs: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(maxAgeMs / 1000),
  };
}
