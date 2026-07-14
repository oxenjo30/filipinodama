import { prisma } from "../db/client.js";
import { getConfig, invalidateConfig } from "./config-service.js";
import { env } from "../config/env.js";
import { encryptSecret, decryptSecret, maskSecret } from "./secrets.js";

/**
 * gateway-credentials — the single source of truth for payment-gateway API
 * keys, entered by an admin in the console and stored ENCRYPTED at rest in a
 * Config row (key GATEWAY_CREDENTIALS). Resolution is "admin overrides env":
 * a credential entered in the admin panel wins; if none is stored, we fall back
 * to the corresponding environment variable so existing env-configured
 * deployments keep working with no migration.
 *
 * The raw plaintext of a stored secret is NEVER returned to any client — the
 * admin API surfaces only a boolean "configured" and a short masked preview.
 * Decrypted values are read only server-side, at the point a request is signed.
 */

const CONFIG_KEY = "GATEWAY_CREDENTIALS";

/** Every credential field we know how to store, keyed provider.field. */
export type CredentialKey =
  | "paymongo.secretKey"
  | "paymongo.webhookSecret"
  | "paymongo.publicKey";

// Which env var backs each field when nothing is stored (admin overrides env).
const ENV_FALLBACK: Record<CredentialKey, string> = {
  "paymongo.secretKey": env.PAYMONGO_SECRET_KEY,
  "paymongo.webhookSecret": env.PAYMONGO_WEBHOOK_SECRET,
  "paymongo.publicKey": env.PAYMONGO_PUBLIC_KEY,
};

export const CREDENTIAL_KEYS = Object.keys(ENV_FALLBACK) as CredentialKey[];

// Stored shape: { [CredentialKey]: <encrypted token> }. Missing key = not set.
type StoredCredentials = Partial<Record<CredentialKey, string>>;

async function readStored(): Promise<StoredCredentials> {
  const raw = await getConfig(CONFIG_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as StoredCredentials) : {};
  } catch {
    return {};
  }
}

async function writeStored(next: StoredCredentials): Promise<void> {
  await prisma.config.upsert({
    where: { key: CONFIG_KEY },
    create: {
      key: CONFIG_KEY,
      value: JSON.stringify(next),
      type: "json",
      category: "finance",
      label: "Payment gateway credentials (encrypted at rest)",
    },
    update: { value: JSON.stringify(next) },
  });
  invalidateConfig(CONFIG_KEY);
}

/**
 * Resolve a credential's PLAINTEXT value for server-side use (signing a request,
 * verifying a webhook). Prefers the admin-stored (decrypted) value; falls back
 * to env. Returns "" when neither is set. NEVER expose the result to a client.
 */
export async function getCredential(key: CredentialKey): Promise<string> {
  const stored = await readStored();
  const token = stored[key];
  if (token) {
    const plain = decryptSecret(token);
    if (plain) return plain;
    // A stored-but-undecryptable secret (e.g. after a SECRETS_KEY rotation) is
    // treated as absent so we fall back to env rather than signing with garbage.
  }
  return ENV_FALLBACK[key] ?? "";
}

/** Save (encrypt) a credential entered by an admin. Empty string clears it. */
export async function setCredential(key: CredentialKey, plaintext: string): Promise<void> {
  const stored = await readStored();
  const trimmed = plaintext.trim();
  if (trimmed === "") {
    delete stored[key];
  } else {
    stored[key] = encryptSecret(trimmed);
  }
  await writeStored(stored);
}

/** Remove a stored credential (revert to env fallback). */
export async function clearCredential(key: CredentialKey): Promise<void> {
  const stored = await readStored();
  if (key in stored) {
    delete stored[key];
    await writeStored(stored);
  }
}

/**
 * Non-secret status for the admin UI: for each field, whether a value resolves
 * (stored or env), where it came from, and a masked preview — never the raw
 * value. This is what the admin panel renders.
 */
export async function credentialStatusFor(
  keys: CredentialKey[],
): Promise<Record<string, { configured: boolean; source: "admin" | "env" | "none"; preview: string }>> {
  const stored = await readStored();
  const out: Record<string, { configured: boolean; source: "admin" | "env" | "none"; preview: string }> = {};
  for (const key of keys) {
    const token = stored[key];
    if (token) {
      const plain = decryptSecret(token);
      out[key] = plain
        ? { configured: true, source: "admin", preview: maskSecret(plain) }
        : { configured: false, source: "none", preview: "" }; // undecryptable
    } else if (ENV_FALLBACK[key]) {
      out[key] = { configured: true, source: "env", preview: maskSecret(ENV_FALLBACK[key]) };
    } else {
      out[key] = { configured: false, source: "none", preview: "" };
    }
  }
  return out;
}
