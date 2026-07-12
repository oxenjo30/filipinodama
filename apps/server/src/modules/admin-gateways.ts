import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { requireAdmin } from "../auth/guards.js";
import { audit } from "../lib/audit.js";
import { getConfig, invalidateConfig } from "../lib/config-service.js";
import { env } from "../config/env.js";
import { DIAMOND_PACKS } from "./payments.js";

/**
 * Admin — Settings → Payment gateways tab (handoffv3 rows 1-7 / v3-delta
 * Cluster A1). SUPERADMIN-only, money-inert: this config has NO effect on
 * real money flows while DIAMOND_TOPUP_ENABLED=false (gold-only economy —
 * see lib/env.ts). It exists so an operator can prepare gateway settings
 * ahead of a future top-up re-enable, with an honest, non-fabricated UI.
 *
 * Storage: one Config row, key PAYMENT_GATEWAYS, type "json" — same pattern
 * as DAILY_REWARDS_LADDER (lib/daily-rewards.ts). Falls back to
 * DEFAULT_GATEWAYS (all disabled, Sandbox) whenever unsaved.
 *
 * Only PayMongo has real production credentials (env.PAYMONGO_*) — PayPal,
 * Stripe, and Xendit have NO server-side integration at all. Per the task's
 * decided policy: "Test connection" performs a REAL PayMongo API ping when a
 * key is configured; the other three gateways always report "Not configured"
 * (never a fabricated success). Credential cards likewise show real
 * Configured/Not-configured status only — no stored or displayed secrets.
 */

export const CONFIG_KEY = "PAYMENT_GATEWAYS";

export type GatewayId = "paypal" | "stripe" | "paymongo" | "xendit";
export const GATEWAY_IDS: GatewayId[] = ["paypal", "stripe", "paymongo", "xendit"];
export const GATEWAY_NAMES: Record<GatewayId, string> = {
  paypal: "PayPal",
  stripe: "Stripe",
  paymongo: "PayMongo",
  xendit: "Xendit",
};

export type GatewaysConfig = {
  gateways: Record<GatewayId, { enabled: boolean; feePct: number }>;
  environment: "live" | "sandbox";
};

// Defaults: ALL gateways disabled, Sandbox — money-inert reality (do NOT copy
// the prototype's enabled-by-default demo state). Fee values are the
// prototype's displayed numbers, kept as neutral config defaults only.
export const DEFAULT_GATEWAYS: GatewaysConfig = {
  gateways: {
    paypal: { enabled: false, feePct: 3.9 },
    stripe: { enabled: false, feePct: 2.9 },
    paymongo: { enabled: false, feePct: 2.5 },
    xendit: { enabled: false, feePct: 2.7 },
  },
  environment: "sandbox",
};

const gatewaysConfigSchema = z.object({
  gateways: z.object({
    paypal: z.object({ enabled: z.boolean(), feePct: z.number().min(0).max(100) }),
    stripe: z.object({ enabled: z.boolean(), feePct: z.number().min(0).max(100) }),
    paymongo: z.object({ enabled: z.boolean(), feePct: z.number().min(0).max(100) }),
    xendit: z.object({ enabled: z.boolean(), feePct: z.number().min(0).max(100) }),
  }),
  environment: z.enum(["live", "sandbox"]),
});

const reasonField = z.string().trim().min(1, "reason required").max(500);

/** Read the configured gateways, falling back to DEFAULT_GATEWAYS if absent/invalid. */
export async function getGatewaysConfig(): Promise<GatewaysConfig> {
  const raw = await getConfig(CONFIG_KEY);
  if (!raw) return DEFAULT_GATEWAYS;
  try {
    return gatewaysConfigSchema.parse(JSON.parse(raw));
  } catch {
    return DEFAULT_GATEWAYS;
  }
}

async function saveGatewaysConfig(cfg: GatewaysConfig): Promise<void> {
  await prisma.config.upsert({
    where: { key: CONFIG_KEY },
    create: { key: CONFIG_KEY, value: JSON.stringify(cfg), type: "json", category: "finance", label: "Payment gateways — status, fees & environment" },
    update: { value: JSON.stringify(cfg) },
  });
  invalidateConfig(CONFIG_KEY);
}

/** Real, non-fabricated credential-presence flags — never the secret values themselves. */
function credentialStatus() {
  const webhookBase = "https://api.filipinodama.com/webhooks";
  return {
    paypal: {
      configured: false, // no PayPal integration exists server-side
      fields: { clientId: false, secret: false, webhookId: false },
      webhookUrl: `${webhookBase}/paypal`,
    },
    stripe: {
      configured: false, // no Stripe integration exists server-side
      fields: { publishableKey: false, secretKey: false, webhookSecret: false },
      webhookUrl: `${webhookBase}/stripe`,
    },
    paymongo: {
      configured: !!(env.PAYMONGO_SECRET_KEY && env.PAYMONGO_WEBHOOK_SECRET),
      fields: {
        publicKey: !!env.PAYMONGO_PUBLIC_KEY,
        secretKey: !!env.PAYMONGO_SECRET_KEY,
        webhookSecret: !!env.PAYMONGO_WEBHOOK_SECRET,
      },
      webhookUrl: `${webhookBase}/paymongo`,
    },
    xendit: {
      configured: false, // no Xendit integration exists server-side
      fields: { publicKey: false, secretKey: false, webhookToken: false },
      webhookUrl: `${webhookBase}/xendit`,
    },
  };
}

/** Real diamond-pack → gateway product mapping, sourced from payments.ts (no fabricated SKUs). */
function diamondPackRows() {
  return DIAMOND_PACKS.map((p) => ({
    id: p.id,
    label: p.label,
    diamonds: p.diamonds,
    bonus: p.bonus,
    priceCents: p.priceCents,
    currencyCode: "php",
  }));
}

/** Lightweight authenticated PayMongo ping — GET /v1/checkout_sessions is a real,
 *  cheap, key-scoped endpoint; a 401 means the key is bad, 2xx/other 4xx means the
 *  key authenticated. We only care whether the credential itself is valid. */
async function pingPayMongo(): Promise<{ status: "ok" | "fail"; latencyMs: number; detail?: string }> {
  const started = Date.now();
  try {
    const res = await fetch("https://api.paymongo.com/v1/checkout_sessions?limit=1", {
      method: "GET",
      headers: { Authorization: "Basic " + Buffer.from(`${env.PAYMONGO_SECRET_KEY}:`).toString("base64") },
    });
    const latencyMs = Date.now() - started;
    if (res.status === 401 || res.status === 403) return { status: "fail", latencyMs, detail: "Authentication rejected by PayMongo" };
    return { status: "ok", latencyMs };
  } catch (e) {
    return { status: "fail", latencyMs: Date.now() - started, detail: e instanceof Error ? e.message : "Network error" };
  }
}

export async function adminGatewaysRoutes(app: FastifyInstance) {
  // ── GET /admin/gateways — read config + real credential status + pack mapping ──
  app.get("/admin/gateways", { preHandler: requireAdmin("SUPPORT") }, async () => {
    const cfg = await getGatewaysConfig();
    return ok({
      gateways: GATEWAY_IDS.map((id) => ({
        id,
        name: GATEWAY_NAMES[id],
        enabled: cfg.gateways[id].enabled,
        feePct: cfg.gateways[id].feePct,
      })),
      environment: cfg.environment,
      credentials: credentialStatus(),
      diamondPacks: diamondPackRows(),
      moneyInert: true,
      moneyInertNote:
        "Top-ups are currently disabled platform-wide. Gateway settings take effect only when top-ups are enabled.",
    });
  });

  // ── POST /admin/gateways — SUPERADMIN save (toggle/fee/env), audited ───────
  app.post("/admin/gateways", { preHandler: requireAdmin("SUPERADMIN") }, async (req) => {
    const body = gatewaysConfigSchema.extend({ reason: reasonField }).parse(req.body);
    const before = await getGatewaysConfig();
    const after: GatewaysConfig = { gateways: body.gateways, environment: body.environment };
    await saveGatewaysConfig(after);

    // One audit row per meaningfully-changed gateway (enable/disable/fee) plus
    // the environment, so the log reads like the mockup's per-action entries
    // ("Enabled gateway"/"Disabled gateway") rather than one opaque blob.
    for (const id of GATEWAY_IDS) {
      const b = before.gateways[id];
      const a = after.gateways[id];
      if (b.enabled !== a.enabled || b.feePct !== a.feePct) {
        await audit(prisma, {
          actorId: req.userId!,
          action: "finance.gateway",
          targetType: "gateway",
          targetId: id,
          before: b,
          after: a,
          reason: b.enabled !== a.enabled ? (a.enabled ? "Enabled gateway" : "Disabled gateway") : body.reason,
        });
      }
    }
    if (before.environment !== after.environment) {
      await audit(prisma, {
        actorId: req.userId!,
        action: "finance.gateway",
        targetType: "gateway",
        targetId: "environment",
        before: { environment: before.environment },
        after: { environment: after.environment },
        reason: body.reason,
      });
    }

    return ok({
      gateways: GATEWAY_IDS.map((id) => ({ id, name: GATEWAY_NAMES[id], enabled: after.gateways[id].enabled, feePct: after.gateways[id].feePct })),
      environment: after.environment,
    });
  });

  // ── POST /admin/gateways/:provider/test — SUPERADMIN, real check only ──────
  app.post<{ Params: { provider: string } }>("/admin/gateways/:provider/test", { preHandler: requireAdmin("SUPERADMIN") }, async (req) => {
    const provider = req.params.provider as GatewayId;
    if (!GATEWAY_IDS.includes(provider)) throw err.notFound("UNKNOWN_GATEWAY", "Unknown payment gateway");

    const cfg = await getGatewaysConfig();
    const name = GATEWAY_NAMES[provider];
    if (!cfg.gateways[provider].enabled) {
      await audit(prisma, {
        actorId: req.userId!,
        action: "finance.gateway.test",
        targetType: "gateway",
        targetId: provider,
        after: { result: "disabled" },
      });
      throw err.badRequest("GATEWAY_DISABLED", `${name} is disabled — enable it first.`);
    }

    let result: { status: "ok" | "fail" | "not_configured"; latencyMs?: number; detail?: string };
    if (provider === "paymongo") {
      const cred = credentialStatus().paymongo;
      result = cred.configured ? await pingPayMongo() : { status: "not_configured" };
    } else {
      // No server-side credentials exist for PayPal/Stripe/Xendit — always honest.
      result = { status: "not_configured" };
    }

    await audit(prisma, {
      actorId: req.userId!,
      action: "finance.gateway.test",
      targetType: "gateway",
      targetId: provider,
      after: result,
    });

    return ok({ provider, name, ...result });
  });
}
