import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { invalidateConfig } from "../src/lib/config-service.js";
import { DEFAULT_GATEWAYS, CONFIG_KEY } from "../src/modules/admin-gateways.js";
import { buildTestApp, seedUser, authFor, truncateAll } from "./helpers.js";

/**
 * Cluster A1 — Settings → Payment gateways tab (handoffv3 rows 1-7).
 * SUPERADMIN-only, money-inert while DIAMOND_TOPUP_ENABLED=false. No env
 * PayMongo keys are set in the test environment, so the "real ping" branch is
 * exercised only as a not-configured honest result here (see task brief: do
 * NOT hit the real PayMongo API in tests).
 */

afterEach(async () => {
  await prisma.config.deleteMany({});
  await truncateAll();
  invalidateConfig();
});
afterAll(async () => {
  await prisma.$disconnect();
});

const VALID_PAYLOAD = {
  gateways: {
    paypal: { enabled: true, feePct: 3.9 },
    stripe: { enabled: false, feePct: 2.9 },
    paymongo: { enabled: true, feePct: 2.5 },
    xendit: { enabled: false, feePct: 2.7 },
  },
  environment: "sandbox" as const,
  reason: "owner-approved gateway config",
};

describe("GET /api/admin/gateways", () => {
  it("returns disabled-all sandbox defaults when no config saved", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });

    const res = await app.inject({
      method: "GET",
      url: "/api/admin/gateways",
      headers: { cookie: authFor({ sub: support.id, adminRole: "SUPPORT" }) },
    });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.environment).toBe(DEFAULT_GATEWAYS.environment);
    expect(d.environment).toBe("sandbox");
    for (const g of d.gateways) {
      expect(g.enabled).toBe(false);
    }
    expect(d.gateways.map((g: any) => g.id).sort()).toEqual(["paymongo", "paypal", "stripe", "xendit"]);
    expect(d.moneyInert).toBe(true);
    expect(typeof d.moneyInertNote).toBe("string");
    expect(d.moneyInertNote.length).toBeGreaterThan(0);
    await app.close();
  });

  it("includes real credential status (no fabricated secrets) and real diamond packs", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });

    const res = await app.inject({
      method: "GET",
      url: "/api/admin/gateways",
      headers: { cookie: authFor({ sub: support.id, adminRole: "SUPPORT" }) },
    });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    // No PayMongo env keys set in test env -> honestly "not configured".
    expect(d.credentials.paymongo.configured).toBe(false);
    expect(d.credentials.paypal.configured).toBe(false);
    expect(d.credentials.stripe.configured).toBe(false);
    expect(d.credentials.xendit.configured).toBe(false);
    // Never expose secret values — each field is a non-secret status object
    // { configured: boolean, source: "admin"|"env"|"none", preview: string }.
    // The preview is masked (never a full secret); no raw secret is present.
    for (const cred of Object.values(d.credentials) as any[]) {
      for (const v of Object.values(cred.fields) as any[]) {
        expect(typeof v.configured).toBe("boolean");
        expect(["admin", "env", "none"]).toContain(v.source);
        expect(typeof v.preview).toBe("string");
        // A masked preview never contains a full-length secret — for a
        // not-configured field (test env) it must be empty.
        if (!v.configured) expect(v.preview).toBe("");
      }
      expect(typeof cred.webhookUrl).toBe("string");
      expect(cred.webhookUrl).toMatch(/^https:\/\/api\.filipinodama\.com\/webhooks\//);
    }
    expect(Array.isArray(d.diamondPacks)).toBe(true);
    expect(d.diamondPacks.length).toBeGreaterThan(0);
    for (const p of d.diamondPacks) {
      expect(typeof p.id).toBe("string");
      expect(typeof p.priceCents).toBe("number");
      expect(typeof p.diamonds).toBe("number");
    }
    await app.close();
  });

  it("unauthenticated → 401", async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/admin/gateways" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe("POST /api/admin/gateways", () => {
  it("SUPERADMIN save persists toggle+fee+env with audit rows", async () => {
    const app = await buildTestApp();
    const su = await seedUser({ adminRole: "SUPERADMIN" });
    const cookie = authFor({ sub: su.id, adminRole: "SUPERADMIN" });

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/gateways",
      headers: { cookie },
      payload: VALID_PAYLOAD,
    });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.environment).toBe("sandbox");
    const paypal = d.gateways.find((g: any) => g.id === "paypal");
    expect(paypal.enabled).toBe(true);
    expect(paypal.feePct).toBe(3.9);

    const row = await prisma.config.findUnique({ where: { key: CONFIG_KEY } });
    expect(row).toBeTruthy();
    const saved = JSON.parse(row!.value);
    expect(saved.gateways.paypal.enabled).toBe(true);
    expect(saved.gateways.paymongo.enabled).toBe(true);
    expect(saved.gateways.stripe.enabled).toBe(false);
    expect(saved.environment).toBe("sandbox");

    // Audit rows written for each changed gateway (paypal + paymongo enabled).
    const auditRows = await prisma.auditLog.findMany({
      where: { action: "finance.gateway", actorId: su.id },
      orderBy: { createdAt: "asc" },
    });
    expect(auditRows.length).toBeGreaterThanOrEqual(2);
    const paypalAudit = auditRows.find((a) => a.targetId === "paypal");
    expect(paypalAudit).toBeTruthy();
    expect(paypalAudit!.reason).toBe("Enabled gateway");

    // GET now reflects the saved config.
    const getRes = await app.inject({ method: "GET", url: "/api/admin/gateways", headers: { cookie } });
    const getData = getRes.json().data;
    expect(getData.gateways.find((g: any) => g.id === "paypal").enabled).toBe(true);

    await app.close();
  });

  it("toggling a gateway off writes reason 'Disabled gateway'", async () => {
    const app = await buildTestApp();
    const su = await seedUser({ adminRole: "SUPERADMIN" });
    const cookie = authFor({ sub: su.id, adminRole: "SUPERADMIN" });

    // First enable paypal.
    await app.inject({ method: "POST", url: "/api/admin/gateways", headers: { cookie }, payload: VALID_PAYLOAD });

    // Now disable it.
    const disablePayload = {
      ...VALID_PAYLOAD,
      gateways: { ...VALID_PAYLOAD.gateways, paypal: { enabled: false, feePct: 3.9 } },
      reason: "shutting off paypal",
    };
    const res = await app.inject({ method: "POST", url: "/api/admin/gateways", headers: { cookie }, payload: disablePayload });
    expect(res.statusCode).toBe(200);

    const auditRows = await prisma.auditLog.findMany({
      where: { action: "finance.gateway", actorId: su.id, targetId: "paypal" },
      orderBy: { createdAt: "desc" },
    });
    expect(auditRows[0]!.reason).toBe("Disabled gateway");
    await app.close();
  });

  it("non-SUPERADMIN save → 403; unauthenticated → 401", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const cookie = authFor({ sub: econ.id, adminRole: "ECONOMY" });

    const forbidden = await app.inject({
      method: "POST",
      url: "/api/admin/gateways",
      headers: { cookie },
      payload: VALID_PAYLOAD,
    });
    expect(forbidden.statusCode).toBe(403);

    const unauth = await app.inject({
      method: "POST",
      url: "/api/admin/gateways",
      payload: VALID_PAYLOAD,
    });
    expect(unauth.statusCode).toBe(401);

    // No config row written by rejected attempts.
    const row = await prisma.config.findUnique({ where: { key: CONFIG_KEY } });
    expect(row).toBeNull();

    await app.close();
  });

  it("fee validation rejects negative and >100 values", async () => {
    const app = await buildTestApp();
    const su = await seedUser({ adminRole: "SUPERADMIN" });
    const cookie = authFor({ sub: su.id, adminRole: "SUPERADMIN" });

    const negative = { ...VALID_PAYLOAD, gateways: { ...VALID_PAYLOAD.gateways, paypal: { enabled: true, feePct: -5 } } };
    let res = await app.inject({ method: "POST", url: "/api/admin/gateways", headers: { cookie }, payload: negative });
    expect(res.statusCode).toBe(400);

    const tooHigh = { ...VALID_PAYLOAD, gateways: { ...VALID_PAYLOAD.gateways, stripe: { enabled: true, feePct: 150 } } };
    res = await app.inject({ method: "POST", url: "/api/admin/gateways", headers: { cookie }, payload: tooHigh });
    expect(res.statusCode).toBe(400);

    const junkEnv = { ...VALID_PAYLOAD, environment: "not-real" };
    res = await app.inject({ method: "POST", url: "/api/admin/gateways", headers: { cookie }, payload: junkEnv });
    expect(res.statusCode).toBe(400);

    const missingReason = { ...VALID_PAYLOAD, reason: "" };
    res = await app.inject({ method: "POST", url: "/api/admin/gateways", headers: { cookie }, payload: missingReason });
    expect(res.statusCode).toBe(400);

    // No config row was written by any rejected attempt.
    const row = await prisma.config.findUnique({ where: { key: CONFIG_KEY } });
    expect(row).toBeNull();

    await app.close();
  });
});

describe("POST /api/admin/gateways/:provider/test", () => {
  it("disabled gateway → 400 'is disabled — enable it first.'", async () => {
    const app = await buildTestApp();
    const su = await seedUser({ adminRole: "SUPERADMIN" });
    const cookie = authFor({ sub: su.id, adminRole: "SUPERADMIN" });

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/gateways/paypal/test",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toMatch(/disabled — enable it first/i);

    const audit = await prisma.auditLog.findFirst({ where: { action: "finance.gateway.test", targetId: "paypal" } });
    expect(audit).toBeTruthy();

    await app.close();
  });

  it("enabled but unconfigured provider returns honest not_configured (never fake success)", async () => {
    const app = await buildTestApp();
    const su = await seedUser({ adminRole: "SUPERADMIN" });
    const cookie = authFor({ sub: su.id, adminRole: "SUPERADMIN" });

    // Enable paymongo (no env keys are set in the test environment).
    await app.inject({
      method: "POST",
      url: "/api/admin/gateways",
      headers: { cookie },
      payload: { ...VALID_PAYLOAD, gateways: { ...VALID_PAYLOAD.gateways, paymongo: { enabled: true, feePct: 2.5 } } },
    });

    const res = await app.inject({ method: "POST", url: "/api/admin/gateways/paymongo/test", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.status).toBe("not_configured");
    expect(d.provider).toBe("paymongo");

    const audit = await prisma.auditLog.findFirst({ where: { action: "finance.gateway.test", targetId: "paymongo" }, orderBy: { createdAt: "desc" } });
    expect(audit).toBeTruthy();
    expect((audit!.after as any).status).toBe("not_configured");

    await app.close();
  });

  it("PayPal/Stripe/Xendit always return not_configured when enabled (no server integration exists)", async () => {
    const app = await buildTestApp();
    const su = await seedUser({ adminRole: "SUPERADMIN" });
    const cookie = authFor({ sub: su.id, adminRole: "SUPERADMIN" });

    await app.inject({
      method: "POST",
      url: "/api/admin/gateways",
      headers: { cookie },
      payload: {
        gateways: {
          paypal: { enabled: true, feePct: 3.9 },
          stripe: { enabled: true, feePct: 2.9 },
          paymongo: { enabled: false, feePct: 2.5 },
          xendit: { enabled: true, feePct: 2.7 },
        },
        environment: "sandbox",
        reason: "enable all for test",
      },
    });

    for (const provider of ["paypal", "stripe", "xendit"]) {
      const res = await app.inject({ method: "POST", url: `/api/admin/gateways/${provider}/test`, headers: { cookie } });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe("not_configured");
    }

    await app.close();
  });

  it("unknown provider → 404", async () => {
    const app = await buildTestApp();
    const su = await seedUser({ adminRole: "SUPERADMIN" });
    const cookie = authFor({ sub: su.id, adminRole: "SUPERADMIN" });

    const res = await app.inject({ method: "POST", url: "/api/admin/gateways/not-a-gateway/test", headers: { cookie } });
    expect(res.statusCode).toBe(404);

    await app.close();
  });

  it("non-SUPERADMIN → 403; unauthenticated → 401", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });

    const forbidden = await app.inject({
      method: "POST",
      url: "/api/admin/gateways/paymongo/test",
      headers: { cookie: authFor({ sub: econ.id, adminRole: "ECONOMY" }) },
    });
    expect(forbidden.statusCode).toBe(403);

    const unauth = await app.inject({ method: "POST", url: "/api/admin/gateways/paymongo/test" });
    expect(unauth.statusCode).toBe(401);

    await app.close();
  });
});
