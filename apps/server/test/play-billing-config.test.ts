import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Config persistence + config-service so this test needs no DB.
const store: Record<string, string> = {};
vi.mock("../src/db/client.js", () => ({
  prisma: {
    config: {
      upsert: vi.fn(async ({ where, create, update }: any) => {
        store[where.key] = (update?.value ?? create?.value) as string;
      }),
    },
  },
}));
vi.mock("../src/lib/config-service.js", () => ({
  getConfig: vi.fn(async (key: string) => store[key] ?? null),
  invalidateConfig: vi.fn(),
}));

import { setPlayBilling, getServiceAccount, getPlayBillingStatus, packForPlayProduct } from "../src/lib/play-billing-config.js";

const VALID_SA = JSON.stringify({
  type: "service_account",
  client_email: "svc@proj.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nMIIfake\n-----END PRIVATE KEY-----\n",
  token_uri: "https://oauth2.googleapis.com/token",
});

describe("play-billing-config", () => {
  beforeEach(() => { for (const k of Object.keys(store)) delete store[k]; });

  it("rejects non-JSON service-account", async () => {
    const r = await setPlayBilling({ serviceAccountJson: "not json" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not valid JSON/);
  });

  it("rejects JSON missing client_email/private_key", async () => {
    const r = await setPlayBilling({ serviceAccountJson: JSON.stringify({ type: "service_account" }) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/client_email or private_key/);
  });

  it("stores a valid service account ENCRYPTED and never in plaintext", async () => {
    const r = await setPlayBilling({ serviceAccountJson: VALID_SA });
    expect(r.ok).toBe(true);
    // The raw private_key must NOT appear in the stored config blob.
    const stored = store["PLAY_BILLING"];
    expect(stored).toBeTruthy();
    expect(stored).not.toContain("BEGIN PRIVATE KEY");
    expect(stored).toContain("enc:v1:"); // encrypted token present
    // But it decrypts back for server-side use.
    const sa = await getServiceAccount();
    expect(sa?.clientEmail).toBe("svc@proj.iam.gserviceaccount.com");
    expect(sa?.privateKey).toContain("BEGIN PRIVATE KEY");
  });

  it("status never exposes the private key, only client_email + configured", async () => {
    await setPlayBilling({ serviceAccountJson: VALID_SA, packageName: "com.filipinodama.app", enabled: true });
    const status = await getPlayBillingStatus();
    expect(status.enabled).toBe(true);
    expect(status.packageName).toBe("com.filipinodama.app");
    expect(status.serviceAccount.configured).toBe(true);
    expect(status.serviceAccount.clientEmail).toBe("svc@proj.iam.gserviceaccount.com");
    expect(JSON.stringify(status)).not.toContain("BEGIN PRIVATE KEY");
    // Includes the 5 real diamond packs for mapping.
    expect(status.packs.length).toBe(5);
  });

  it("maps a Play product id back to the right diamond pack", async () => {
    await setPlayBilling({ productIds: { pack_diamonds_250: "com.filipinodama.diamonds.sack" } });
    const pack = await packForPlayProduct("com.filipinodama.diamonds.sack");
    expect(pack?.id).toBe("pack_diamonds_250");
    expect(await packForPlayProduct("com.unmapped.product")).toBeNull();
  });

  it("clears the service account with empty string", async () => {
    await setPlayBilling({ serviceAccountJson: VALID_SA });
    expect((await getServiceAccount())).not.toBeNull();
    await setPlayBilling({ serviceAccountJson: "" });
    expect(await getServiceAccount()).toBeNull();
  });
});
