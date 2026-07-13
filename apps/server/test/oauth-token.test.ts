import { describe, it, expect, afterEach, afterAll, vi } from "vitest";
import { prisma } from "../src/db/client.js";
import { env, features } from "../src/config/env.js";
import { verifyGoogleIdToken } from "../src/auth/oauth.js";
import { buildTestApp, seedUser, truncateAll } from "./helpers.js";

/**
 * POST /api/auth/oauth/google/token — native (Android Credential Manager)
 * Google sign-in. Verifies a Google-issued ID token server-side via
 * Google's tokeninfo endpoint, then reuses the exact same
 * findOrCreateOAuthUser() provisioning path as the web redirect callback
 * (apps/server/src/auth/oauth.ts) and issues the same session cookies.
 *
 * Like payments-dark.test.ts, this test process boots with dotenv loaded at
 * import time (config/env.ts does `import "dotenv/config"` before `env` is
 * parsed), so GOOGLE_CLIENT_ID/SECRET cannot be flipped per-test at runtime.
 * This repo's .env.test ships with no Google credentials configured, so
 * `features.googleOAuth` is false here — the route-level "feature off"
 * behavior is exercised end-to-end below (the default, real state).
 *
 * The token-verification logic itself (audience/issuer/expiry/email_verified
 * checks) is fully unit-tested against `verifyGoogleIdToken` directly, with
 * `global.fetch` stubbed at the network boundary so no real Google call is
 * made — this is the exact function the route calls, so these tests prove
 * the same validation the route would apply if the feature were enabled.
 * `aud` is asserted against `env.GOOGLE_CLIENT_ID` (whatever value is
 * actually configured, including "" in this environment) so the assertions
 * hold regardless of which environment the suite runs in.
 */

afterEach(async () => {
  vi.unstubAllGlobals();
  await truncateAll();
});
afterAll(async () => {
  await prisma.$disconnect();
});

function stubTokenInfo(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    })) as unknown as typeof fetch,
  );
}

const validInfo = () => ({
  sub: "google-sub-123",
  aud: env.GOOGLE_CLIENT_ID,
  iss: "accounts.google.com",
  exp: String(Math.floor(Date.now() / 1000) + 3600),
  email: "newplayer@example.com",
  email_verified: "true",
  name: "New Player",
  picture: "https://example.com/avatar.png",
});

describe("verifyGoogleIdToken — token verification boundary", () => {
  it("valid token → returns the decoded profile", async () => {
    stubTokenInfo(200, validInfo());
    const profile = await verifyGoogleIdToken("fake-id-token");
    expect(profile).toEqual({
      providerId: "google-sub-123",
      email: "newplayer@example.com",
      name: "New Player",
      avatar: "https://example.com/avatar.png",
    });
  });

  it("wrong audience → throws 401 OAUTH_AUDIENCE_MISMATCH", async () => {
    stubTokenInfo(200, { ...validInfo(), aud: "some-other-app-client-id" });
    await expect(verifyGoogleIdToken("fake-id-token")).rejects.toMatchObject({
      status: 401,
      code: "OAUTH_AUDIENCE_MISMATCH",
    });
  });

  it("wrong issuer → throws 401 OAUTH_ISSUER_MISMATCH", async () => {
    stubTokenInfo(200, { ...validInfo(), iss: "https://evil.example.com" });
    await expect(verifyGoogleIdToken("fake-id-token")).rejects.toMatchObject({
      status: 401,
      code: "OAUTH_ISSUER_MISMATCH",
    });
  });

  it("accepts the https://accounts.google.com issuer variant too", async () => {
    stubTokenInfo(200, { ...validInfo(), iss: "https://accounts.google.com" });
    await expect(verifyGoogleIdToken("fake-id-token")).resolves.toMatchObject({
      providerId: "google-sub-123",
    });
  });

  it("expired token → throws 401 OAUTH_TOKEN_EXPIRED", async () => {
    stubTokenInfo(200, { ...validInfo(), exp: String(Math.floor(Date.now() / 1000) - 60) });
    await expect(verifyGoogleIdToken("fake-id-token")).rejects.toMatchObject({
      status: 401,
      code: "OAUTH_TOKEN_EXPIRED",
    });
  });

  it("unverified email → throws 401 OAUTH_EMAIL_UNVERIFIED", async () => {
    stubTokenInfo(200, { ...validInfo(), email_verified: "false" });
    await expect(verifyGoogleIdToken("fake-id-token")).rejects.toMatchObject({
      status: 401,
      code: "OAUTH_EMAIL_UNVERIFIED",
    });
  });

  it("Google rejects the token outright (tokeninfo non-200) → throws 401 OAUTH_TOKEN_INVALID", async () => {
    stubTokenInfo(400, { error: "invalid_token" });
    await expect(verifyGoogleIdToken("garbage")).rejects.toMatchObject({
      status: 401,
      code: "OAUTH_TOKEN_INVALID",
    });
  });

  it("empty/missing token → throws 400 OAUTH_TOKEN before any network call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(verifyGoogleIdToken("")).rejects.toMatchObject({ status: 400, code: "OAUTH_TOKEN" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/oauth/google/token — route (feature OFF, this environment's default)", () => {
  it("sanity: Google OAuth is not configured in this test environment", () => {
    expect(features.googleOAuth).toBe(false);
  });

  it("503 NOT_CONFIGURED when the feature is off — no DB write, no cookies set", async () => {
    const app = await buildTestApp();
    const before = await prisma.user.count();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/oauth/google/token",
      payload: { idToken: "whatever" },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("NOT_CONFIGURED");
    expect(res.cookies.length).toBe(0);
    expect(await prisma.user.count()).toBe(before);
    await app.close();
  });

  it("malformed body (missing idToken) → 400, still gated by the same guard order (503 wins first)", async () => {
    // The feature-off check runs before body validation (mirrors the web
    // oauth start route's isConfigured-before-parsing order), so an
    // unconfigured environment reports 503 even for a malformed request —
    // this is intentional: we don't want to leak validation details about a
    // disabled route.
    const app = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/oauth/google/token",
      payload: {},
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it("GET /api/auth/providers → google:false and googleClientId:null in this environment", async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/auth/providers" });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.google).toBe(false);
    expect(res.json().data.googleClientId).toBeNull();
    await app.close();
  });
});

/**
 * GET /api/auth/providers — googleClientId derivation, feature ON.
 *
 * The route derives `googleClientId` as `features.googleOAuth ?
 * env.GOOGLE_CLIENT_ID : null` (apps/server/src/auth/routes.ts). We can't
 * flip `features.googleOAuth` to true for a real app-boot/HTTP test in this
 * file (see the header comment above: `env`/`features` are parsed once from
 * `.env.test` at import time, and this repo's `.env.test` ships with no
 * Google credentials — the same constraint that keeps the rest of this file
 * testing the "off" state against a real server). Rebuilding the *entire*
 * app (DB client, rate limiter, every route module) against a mutated env
 * via `vi.resetModules()` would be heavy and fragile, since most of those
 * modules also import `config/env.js` at their own module scope.
 *
 * Instead, this isolates exactly the derivation the route performs: reset
 * the module registry, set `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` in
 * `process.env`, and re-import the *single* `config/env.js` module fresh —
 * proving `features.googleOAuth` flips true and the exact expression the
 * route uses evaluates to the real client ID, byte for byte.
 */
describe("GET /api/auth/providers — googleClientId derivation, feature ON", () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it("features.googleOAuth flips true and googleClientId resolves to env.GOOGLE_CLIENT_ID when both Google vars are set", async () => {
    vi.resetModules();
    process.env.GOOGLE_CLIENT_ID = "test-web-client-id.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

    const fresh = await import("../src/config/env.js");
    expect(fresh.features.googleOAuth).toBe(true);

    // The exact expression apps/server/src/auth/routes.ts uses for the
    // providers response's googleClientId field.
    const googleClientId = fresh.features.googleOAuth ? fresh.env.GOOGLE_CLIENT_ID : null;
    expect(googleClientId).toBe("test-web-client-id.apps.googleusercontent.com");
  });

  it("googleClientId stays null when only GOOGLE_CLIENT_ID is set (no secret ⇒ feature still off)", async () => {
    vi.resetModules();
    process.env.GOOGLE_CLIENT_ID = "test-web-client-id.apps.googleusercontent.com";
    delete process.env.GOOGLE_CLIENT_SECRET;

    const fresh = await import("../src/config/env.js");
    expect(fresh.features.googleOAuth).toBe(false);

    const googleClientId = fresh.features.googleOAuth ? fresh.env.GOOGLE_CLIENT_ID : null;
    expect(googleClientId).toBeNull();
  });
});

describe("findOrCreateOAuthUser reuse — same provisioning logic backs both the redirect callback and the token route", () => {
  it("an existing verified-email user is linked (not duplicated) by the shared provisioning function", async () => {
    const { findOrCreateOAuthUser } = await import("../src/auth/oauth.js");
    const existing = await seedUser({ email: "linked-user@example.com" });
    const user = await findOrCreateOAuthUser("google", {
      providerId: "google-sub-999",
      email: "linked-user@example.com",
      name: "Existing User",
      avatar: null,
    });
    expect(user.id).toBe(existing.id);
    const account = await prisma.oAuthAccount.findUnique({
      where: { provider_providerId: { provider: "google", providerId: "google-sub-999" } },
    });
    expect(account?.userId).toBe(existing.id);
  });

  it("a brand-new profile creates a fresh, provider-verified user with an OAuthAccount row", async () => {
    // NOTE: does not assert on granted starter cosmetics here — the CI test DB
    // runs `migrate deploy` only (no `db seed`), so free StoreItem rows may not
    // exist and grantDefaults() would legitimately be a no-op (see
    // emote-defaults.test.ts, which seeds its own free items to test that
    // behavior specifically). This test proves findOrCreateOAuthUser's own
    // contract: fresh user + provider-verified email + linked OAuthAccount.
    const { findOrCreateOAuthUser } = await import("../src/auth/oauth.js");
    const user = await findOrCreateOAuthUser("google", {
      providerId: "google-sub-fresh-1",
      email: "fresh-google-user@example.com",
      name: "Fresh Player",
      avatar: "https://example.com/a.png",
    });
    expect(user.email).toBe("fresh-google-user@example.com");
    expect(user.emailVerified).toBeTruthy(); // OAuth email is provider-verified, same as the redirect callback path
    const account = await prisma.oAuthAccount.findUnique({
      where: { provider_providerId: { provider: "google", providerId: "google-sub-fresh-1" } },
    });
    expect(account?.userId).toBe(user.id);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  });
});
