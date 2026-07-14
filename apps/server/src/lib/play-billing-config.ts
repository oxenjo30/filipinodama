import { prisma } from "../db/client.js";
import { getConfig, invalidateConfig } from "./config-service.js";
import { encryptSecret, decryptSecret, maskSecret } from "./secrets.js";
import { DIAMOND_PACKS } from "../modules/payments.js";

/**
 * play-billing-config — admin-entered Google Play Billing settings, stored in a
 * Config row (key PLAY_BILLING). The service-account JSON is a high-value
 * credential (it grants Play Developer API access), so it is ENCRYPTED at rest
 * via lib/secrets and NEVER returned to a client — only a "configured" flag +
 * the service-account client_email (safe to show, identifies WHICH account).
 *
 * The owner enters all of this in the admin panel (no env, no hardcoding):
 *  - packageName: the Android app id (com.filipinodama.app)
 *  - serviceAccountJson: the Play Developer API service-account key (encrypted)
 *  - productIds: map of our diamond pack id -> the Play Console product id
 *  - enabled: master switch for the Android real-money top-up
 */

const CONFIG_KEY = "PLAY_BILLING";

export type PlayBillingConfig = {
  enabled: boolean;
  packageName: string;
  /** Encrypted service-account JSON token, or "" if unset. Never sent to clients. */
  serviceAccountEnc: string;
  /** our diamond-pack id -> Play Console product id */
  productIds: Record<string, string>;
};

export const DEFAULT_PLAY_BILLING: PlayBillingConfig = {
  enabled: false,
  packageName: "com.filipinodama.app",
  serviceAccountEnc: "",
  productIds: {},
};

async function readRaw(): Promise<PlayBillingConfig> {
  const raw = await getConfig(CONFIG_KEY);
  if (!raw) return DEFAULT_PLAY_BILLING;
  try {
    const parsed = JSON.parse(raw) as Partial<PlayBillingConfig>;
    return {
      enabled: !!parsed.enabled,
      packageName: parsed.packageName || DEFAULT_PLAY_BILLING.packageName,
      serviceAccountEnc: parsed.serviceAccountEnc || "",
      productIds: parsed.productIds && typeof parsed.productIds === "object" ? parsed.productIds : {},
    };
  } catch {
    return DEFAULT_PLAY_BILLING;
  }
}

async function writeRaw(cfg: PlayBillingConfig): Promise<void> {
  await prisma.config.upsert({
    where: { key: CONFIG_KEY },
    create: {
      key: CONFIG_KEY,
      value: JSON.stringify(cfg),
      type: "json",
      category: "finance",
      label: "Google Play Billing configuration (service-account encrypted at rest)",
    },
    update: { value: JSON.stringify(cfg) },
  });
  invalidateConfig(CONFIG_KEY);
}

/** The decrypted service-account JSON for server-side use (verification). Null if
 *  unset or undecryptable. NEVER expose to a client. */
export async function getServiceAccount(): Promise<{ clientEmail: string; privateKey: string; tokenUri: string } | null> {
  const cfg = await readRaw();
  if (!cfg.serviceAccountEnc) return null;
  const plain = decryptSecret(cfg.serviceAccountEnc);
  if (!plain) return null;
  try {
    const j = JSON.parse(plain) as { client_email?: string; private_key?: string; token_uri?: string };
    if (!j.client_email || !j.private_key) return null;
    return {
      clientEmail: j.client_email,
      privateKey: j.private_key,
      tokenUri: j.token_uri || "https://oauth2.googleapis.com/token",
    };
  } catch {
    return null;
  }
}

/** Full runtime config for the verification path (enabled, package, productIds). */
export async function getPlayBillingRuntime(): Promise<{ enabled: boolean; packageName: string; productIds: Record<string, string> }> {
  const cfg = await readRaw();
  return { enabled: cfg.enabled, packageName: cfg.packageName, productIds: cfg.productIds };
}

/** Given a Play product id, find our diamond pack. Returns null if unmapped. */
export async function packForPlayProduct(productId: string): Promise<(typeof DIAMOND_PACKS)[number] | null> {
  const cfg = await readRaw();
  const packId = Object.entries(cfg.productIds).find(([, pid]) => pid === productId)?.[0];
  if (!packId) return null;
  return DIAMOND_PACKS.find((p) => p.id === packId) ?? null;
}

// ── Admin read/write ─────────────────────────────────────────────────────────

/** Non-secret status for the admin UI — never the raw service-account key. */
export async function getPlayBillingStatus(): Promise<{
  enabled: boolean;
  packageName: string;
  serviceAccount: { configured: boolean; clientEmail: string };
  productIds: Record<string, string>;
  packs: { id: string; label: string; diamonds: number; bonus: number; priceCents: number }[];
}> {
  const cfg = await readRaw();
  const sa = await getServiceAccount();
  return {
    enabled: cfg.enabled,
    packageName: cfg.packageName,
    serviceAccount: { configured: !!sa, clientEmail: sa?.clientEmail ?? "" },
    productIds: cfg.productIds,
    packs: DIAMOND_PACKS.map((p) => ({ id: p.id, label: p.label, diamonds: p.diamonds, bonus: p.bonus, priceCents: p.priceCents })),
  };
}

export async function setPlayBilling(patch: {
  enabled?: boolean;
  packageName?: string;
  /** Raw service-account JSON (validated + encrypted). "" clears it. undefined = unchanged. */
  serviceAccountJson?: string;
  productIds?: Record<string, string>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const cfg = await readRaw();
  if (patch.packageName !== undefined) cfg.packageName = patch.packageName.trim();
  if (patch.enabled !== undefined) cfg.enabled = patch.enabled;
  if (patch.productIds !== undefined) cfg.productIds = patch.productIds;
  if (patch.serviceAccountJson !== undefined) {
    const trimmed = patch.serviceAccountJson.trim();
    if (trimmed === "") {
      cfg.serviceAccountEnc = "";
    } else {
      // Validate it's a real service-account key before storing.
      let parsed: { type?: string; client_email?: string; private_key?: string };
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        return { ok: false, error: "Service-account value is not valid JSON." };
      }
      if (!parsed.client_email || !parsed.private_key) {
        return { ok: false, error: "Service-account JSON is missing client_email or private_key." };
      }
      cfg.serviceAccountEnc = encryptSecret(trimmed);
    }
  }
  await writeRaw(cfg);
  return { ok: true };
}
