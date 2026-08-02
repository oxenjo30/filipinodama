import { describe, it, expect } from "vitest";
import { playAccountToken } from "../src/modules/payments.js";

/**
 * Google Play purchase → account binding.
 *
 * WHY THIS EXISTS: without binding, a Play purchase token is a BEARER
 * credential. `Payment.providerRef` is unique so a token can only ever be
 * credited once — but that made it a MISATTRIBUTION bug rather than a
 * duplication one. Whoever redeems the token first gets the diamonds; the real
 * buyer's client then receives `alreadyProcessed: true` alongside the pack size,
 * reads that as success, CONSUMES the purchase (destroying the entitlement and
 * Play's 3-day auto-refund window) and displays "+N diamonds credited" to
 * someone who received nothing.
 *
 * The server now derives the expected token from the AUTHENTICATED caller and
 * compares it to the value Google echoes back from the purchase, so a token
 * lifted from another account is worthless.
 *
 * FAIL-CLOSED, deliberately: a purchase with NO binding is rejected rather than
 * credited. Diamond top-up is dark today, so nothing legitimate reaches this
 * path; if the flag is flipped before a client ships the binding, top-ups fail
 * loudly with a fixable error instead of quietly misattributing money.
 */

describe("playAccountToken — the cross-language contract", () => {
  it("matches the Android derivation for a known user id", () => {
    // THE CONTRACT. PlayAccountTokenTest.kt asserts this exact string for this
    // exact input. Both sides pin the literal rather than re-deriving it, so a
    // change to either implementation breaks a test instead of silently
    // rejecting every real purchase in production as "not yours".
    expect(playAccountToken("user_abc123")).toBe(
      "5a2e084061eae2209d14bb47650ce453f9b053745e55d0475bb9c3d695193b38",
    );
  });

  it("is 64 hex characters — Google caps obfuscatedAccountId at 64", () => {
    const token = playAccountToken("user_abc123");
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    expect(playAccountToken("u1")).toBe(playAccountToken("u1"));
  });

  it("gives different accounts different tokens", () => {
    expect(playAccountToken("u1")).not.toBe(playAccountToken("u2"));
  });

  it("does not leak the raw user id", () => {
    // Google's guidance: obfuscatedAccountId must not identify the user.
    const token = playAccountToken("player@example.com");
    expect(token).not.toContain("player");
    expect(token).not.toContain("example");
  });
});
