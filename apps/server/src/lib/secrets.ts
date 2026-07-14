import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { env } from "../config/env.js";

/**
 * secrets — symmetric encryption for admin-entered secrets (payment-gateway
 * API keys, the Play Billing service-account JSON) stored at rest in the Config
 * table. Nothing in this file ever returns a plaintext secret to a client; it
 * is used only server-side, at the moment a secret is actually needed (e.g.
 * signing a PayMongo request or verifying a Play purchase).
 *
 * Scheme: AES-256-GCM. The 32-byte key is derived once (scrypt) from
 * `SECRETS_KEY` (falling back to `JWT_ACCESS_SECRET` so it works out of the
 * box). Each ciphertext carries its own random IV and the GCM auth tag, so a
 * tampered value fails to decrypt rather than yielding garbage.
 *
 * Wire format (a single opaque string safe to store as JSON): the token is
 * prefixed `enc:v1:` followed by base64(iv) . base64(tag) . base64(ciphertext)
 * joined by ':'. The prefix lets callers distinguish an encrypted value from a
 * legacy plaintext one and lets us version the scheme later.
 */

const PREFIX = "enc:v1:";
// Fixed application salt for key derivation — the secrecy lives in SECRETS_KEY,
// not the salt, so a constant salt is fine and keeps the derived key stable
// across restarts (a random salt would make every process key different).
const KDF_SALT = "filipinodama.secrets.v1";

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const material = env.SECRETS_KEY || env.JWT_ACCESS_SECRET;
  cachedKey = scryptSync(material, KDF_SALT, 32);
  return cachedKey;
}

/** True if a stored value is one of our encrypted tokens (vs legacy plaintext). */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/** Encrypt a plaintext secret into an opaque, storable token. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12); // 96-bit IV, GCM standard
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

/**
 * Decrypt a token produced by [encryptSecret]. Returns null on any failure
 * (wrong key after a SECRETS_KEY rotation, tampering, malformed token) so
 * callers degrade gracefully — a bad stored secret behaves like "not
 * configured" rather than throwing deep in a payment path. A legacy plaintext
 * value (no prefix) is returned as-is, so pre-existing env-migrated values keep
 * working until they're re-saved through the encrypting write path.
 */
export function decryptSecret(token: string | null | undefined): string | null {
  if (token == null) return null;
  if (!isEncrypted(token)) return token; // legacy plaintext passthrough
  try {
    const body = token.slice(PREFIX.length);
    const [ivB64, tagB64, dataB64] = body.split(":");
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const plain = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
    return plain.toString("utf8");
  } catch {
    return null;
  }
}

/**
 * A short, non-reversible preview of a secret for display in admin — e.g.
 * "sk_live_…4f9a". Never reveals enough to reconstruct the key; used only so an
 * operator can recognise WHICH key is stored. Returns "" for empty input.
 */
export function maskSecret(plaintext: string | null | undefined): string {
  if (!plaintext) return "";
  const s = plaintext.trim();
  if (s.length <= 8) return "•".repeat(s.length);
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}
