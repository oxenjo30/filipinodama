import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { env, features } from "../src/config/env.js";
import { buildTestApp, seedUser, authFor, truncateAll } from "./helpers.js";

/**
 * Monetization dark-launch — the whole diamond top-up feature is built, but
 * ships DARK behind the single master switch `DIAMOND_TOPUP_ENABLED`
 * (config/env.ts), combined with PayMongo key presence into `features.payments`
 * (see modules/payments.ts header comment for the full runbook).
 *
 * The test process boots with dotenv loaded at import time (config/env.ts does
 * `import "dotenv/config"` before `env` is parsed), so `DIAMOND_TOPUP_ENABLED`
 * cannot be flipped per-test at runtime — these tests exercise the OFF state,
 * which is the default and the state this repo ships in. The ON state (real
 * PayMongo checkout session creation, webhook crediting) is exercised via the
 * pre-existing manual/staging verification described in the payments-webhook
 * lessons (paymongo-webhook-modes) from when this flow was last live; there is
 * no separate server-side branch for "on" beyond skipping the guard clauses
 * asserted here, so those guard clauses are the entire surface this file needs
 * to prove.
 */
afterEach(async () => { await prisma.config.deleteMany({}); await truncateAll(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("payments dark-launch (DIAMOND_TOPUP_ENABLED off, the default)", () => {
  it("sanity: the master switch is off in this test environment", () => {
    expect(env.DIAMOND_TOPUP_ENABLED).toBe(false);
    expect(features.payments).toBe(false);
  });

  it("POST /api/payments/checkout → 503 NOT_CONFIGURED before any DB write or PayMongo call", async () => {
    const app = await buildTestApp();
    const user = await seedUser();
    const before = await prisma.payment.count();
    const res = await app.inject({
      method: "POST",
      url: "/api/payments/checkout",
      headers: { cookie: authFor({ sub: user.id }) },
      payload: { packId: "pack_diamonds_80" },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("NOT_CONFIGURED");
    // The gate is the first line of the handler — no pending Payment row should
    // have been created, and no outbound PayMongo call attempted.
    expect(await prisma.payment.count()).toBe(before);
    await app.close();
  });

  it("POST /api/payments/checkout still requires auth even while disabled (401, not 503, when unauthenticated)", async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/payments/checkout",
      payload: { packId: "pack_diamonds_80" },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("GET /api/payments/packs → 200 with enabled:false (packs still listed read-only; no charge risk)", async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/payments/packs" });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.enabled).toBe(false);
    expect(Array.isArray(body.packs)).toBe(true);
    expect(body.packs.length).toBeGreaterThan(0);
    await app.close();
  });

  it("GET /api/auth/providers → diamondTopUp:false", async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/auth/providers" });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.diamondTopUp).toBe(false);
    await app.close();
  });

  it("GET /api/config/public includes DIAMOND_TOPUP_ENABLED:\"false\" (env-governed, not a Config row)", async () => {
    const app = await buildTestApp();
    // Deliberately seed NO Config row for this key — it must still appear,
    // sourced from env, unlike the allow-listed Config-row keys.
    const res = await app.inject({ method: "GET", url: "/api/config/public" });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.DIAMOND_TOPUP_ENABLED).toBe("false");
    await app.close();
  });

  it("PATCH /api/admin/config/DIAMOND_TOPUP_ENABLED stays locked (no admin runtime toggle exists)", async () => {
    const app = await buildTestApp();
    const su = await seedUser({ adminRole: "SUPERADMIN" });
    const res = await app.inject({
      method: "PATCH",
      url: "/api/admin/config/DIAMOND_TOPUP_ENABLED",
      headers: { cookie: authFor({ sub: su.id, adminRole: "SUPERADMIN" }) },
      payload: { value: "true", reason: "attempt to bypass the env master switch" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("LOCKED_FLAG");
    await app.close();
  });
});
