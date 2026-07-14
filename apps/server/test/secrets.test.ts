import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret, isEncrypted, maskSecret } from "../src/lib/secrets.js";

describe("secrets encryption", () => {
  it("round-trips a plaintext secret", () => {
    const plain = "sk_live_abc123DEF456ghi789";
    const token = encryptSecret(plain);
    expect(isEncrypted(token)).toBe(true);
    expect(token).not.toContain(plain); // ciphertext must not leak the plaintext
    expect(decryptSecret(token)).toBe(plain);
  });

  it("round-trips a large multi-line JSON secret (Play service-account)", () => {
    const json = JSON.stringify({ type: "service_account", private_key: "-----BEGIN PRIVATE KEY-----\n" + "x".repeat(1600) + "\n-----END PRIVATE KEY-----\n", client_email: "svc@proj.iam.gserviceaccount.com" });
    const token = encryptSecret(json);
    expect(decryptSecret(token)).toBe(json);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encryptSecret("same-input");
    const b = encryptSecret("same-input");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("same-input");
    expect(decryptSecret(b)).toBe("same-input");
  });

  it("fails closed (null) on a tampered token", () => {
    const token = encryptSecret("secret");
    const tampered = token.slice(0, -4) + "AAAA"; // corrupt the ciphertext tail
    expect(decryptSecret(tampered)).toBeNull();
  });

  it("passes legacy plaintext through unchanged (env-migration safety)", () => {
    expect(isEncrypted("sk_live_plain")).toBe(false);
    expect(decryptSecret("sk_live_plain")).toBe("sk_live_plain");
  });

  it("handles null/empty", () => {
    expect(decryptSecret(null)).toBeNull();
    expect(decryptSecret(undefined)).toBeNull();
    expect(maskSecret(null)).toBe("");
    expect(maskSecret("")).toBe("");
  });

  it("masks without revealing the middle", () => {
    expect(maskSecret("sk_live_abcdef123456")).toBe("sk_l…3456");
    expect(maskSecret("short")).toBe("•••••");
  });
});
