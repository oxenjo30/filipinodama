import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "../src/db/client.js";
import { seedUser, truncateAll } from "./helpers.js";
import { hashPassword } from "../src/auth/tokens.js";
import {
  accountState,
  requestEmailChange,
  confirmEmailChange,
  linkOAuthAccount,
  unlinkOAuthAccount,
} from "../src/auth/service.js";

/**
 * Account self-service: change your email, connect/disconnect Google.
 *
 * Both are credential-adjacent, so the tests here are mostly about the REFUSALS
 * — the paths that must never succeed:
 *   - applying a new email before its owner proves they hold it
 *   - re-pointing someone else's Google identity at your account
 *   - unlinking the only way you can still sign in
 *
 * Email delivery is not asserted; sendEmail is a no-op without RESEND_API_KEY
 * (lib/email.ts), and what matters is the DB transition either way.
 */

const PASSWORD = "CorrectHorse!9";

async function seedWithPassword(email: string) {
  const u = await seedUser({ email });
  return prisma.user.update({
    where: { id: u.id },
    data: { passwordHash: await hashPassword(PASSWORD), emailVerified: new Date() },
  });
}

beforeEach(async () => {
  await truncateAll();
});
afterEach(async () => {
  await truncateAll();
});

describe("email change", () => {
  it("stages the address instead of applying it, and only the confirm swaps it", async () => {
    const u = await seedWithPassword("old@example.com");

    await requestEmailChange(prisma, u.id, "New@Example.com", PASSWORD);

    const staged = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    // The live address is untouched — this is the whole point of staging.
    expect(staged.email).toBe("old@example.com");
    expect(staged.pendingEmail).toBe("new@example.com"); // normalised to lowercase
    expect(staged.pendingEmailToken).toBeTruthy();

    await confirmEmailChange(prisma, staged.pendingEmailToken!);

    const done = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(done.email).toBe("new@example.com");
    expect(done.emailVerified).toBeTruthy(); // clicking the link IS the verification
    expect(done.pendingEmail).toBeNull();
    expect(done.pendingEmailToken).toBeNull();
  });

  it("rejects a wrong or missing password so a stolen session alone cannot start the move", async () => {
    const u = await seedWithPassword("old@example.com");

    await expect(requestEmailChange(prisma, u.id, "new@example.com", "wrong-password")).rejects.toThrow();
    await expect(requestEmailChange(prisma, u.id, "new@example.com")).rejects.toThrow();

    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.pendingEmail).toBeNull();
  });

  it("refuses an address another account already holds", async () => {
    const u = await seedWithPassword("old@example.com");
    await seedUser({ email: "taken@example.com" });

    await expect(requestEmailChange(prisma, u.id, "taken@example.com", PASSWORD)).rejects.toThrow();
  });

  it("re-checks at CONFIRM time, so a race cannot hand two accounts one address", async () => {
    const u = await seedWithPassword("old@example.com");
    await requestEmailChange(prisma, u.id, "contested@example.com", PASSWORD);
    const staged = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });

    // Someone else claims it during the hour the link is valid.
    await seedUser({ email: "contested@example.com" });

    await expect(confirmEmailChange(prisma, staged.pendingEmailToken!)).rejects.toThrow();

    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.email).toBe("old@example.com"); // unchanged
    expect(after.pendingEmail).toBeNull(); // and the dead staging is cleared
  });

  it("rejects an expired token", async () => {
    const u = await seedWithPassword("old@example.com");
    await requestEmailChange(prisma, u.id, "new@example.com", PASSWORD);
    const staged = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    await prisma.user.update({
      where: { id: u.id },
      data: { pendingEmailExpires: new Date(Date.now() - 1000) },
    });

    await expect(confirmEmailChange(prisma, staged.pendingEmailToken!)).rejects.toThrow();
  });

  it("refuses for a guest, who has no account to move", async () => {
    const g = await seedUser({ isGuest: true, email: null });
    await expect(requestEmailChange(prisma, g.id, "new@example.com")).rejects.toThrow();
  });

  it("refuses an OAuth-only account outright — the confirmation link is NOT proof", async () => {
    // Review finding. The first cut let a passwordless account through on the
    // reasoning that the emailed link proves ownership; that is circular,
    // because the ATTACKER supplies the address and so receives the link. One
    // stolen session was a full takeover of any Google-signup account.
    const u = await seedUser({ email: "oauth-only@example.com" }); // no passwordHash
    await linkOAuthAccount(prisma, u.id, "google", "google-sub-email");

    await expect(requestEmailChange(prisma, u.id, "attacker@evil.com")).rejects.toThrow();

    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.pendingEmail).toBeNull();
    // …and the UI is told not to offer it in the first place.
    expect((await accountState(prisma, u.id)).canChangeEmail).toBe(false);
  });
});

describe("google link / unlink", () => {
  it("links, and is idempotent when the same identity is re-linked", async () => {
    const u = await seedWithPassword("a@example.com");

    const first = await linkOAuthAccount(prisma, u.id, "google", "google-sub-1");
    expect(first.alreadyLinked).toBe(false);

    const again = await linkOAuthAccount(prisma, u.id, "google", "google-sub-1");
    expect(again.alreadyLinked).toBe(true);

    expect(await prisma.oAuthAccount.count({ where: { userId: u.id } })).toBe(1);
  });

  it("refuses to re-point a Google identity already owned by someone else", async () => {
    const owner = await seedWithPassword("owner@example.com");
    const attacker = await seedWithPassword("attacker@example.com");
    await linkOAuthAccount(prisma, owner.id, "google", "google-sub-shared");

    // This is account takeover, not linking.
    await expect(linkOAuthAccount(prisma, attacker.id, "google", "google-sub-shared")).rejects.toThrow();

    const still = await prisma.oAuthAccount.findFirstOrThrow({ where: { providerId: "google-sub-shared" } });
    expect(still.userId).toBe(owner.id);
  });

  it("refuses a SECOND identity for a provider already connected", async () => {
    // Otherwise a stolen session could quietly attach the attacker's Google
    // account to a victim who already had one — and Settings, which only renders
    // "connected or not", would look identical before and after.
    const u = await seedWithPassword("dup@example.com");
    await linkOAuthAccount(prisma, u.id, "google", "google-sub-first");

    await expect(linkOAuthAccount(prisma, u.id, "google", "google-sub-second")).rejects.toThrow();
    expect(await prisma.oAuthAccount.count({ where: { userId: u.id } })).toBe(1);
  });

  it("refuses to link for a guest, who could never unlink or claim the identity", async () => {
    const g = await seedUser({ isGuest: true, email: null });
    await expect(linkOAuthAccount(prisma, g.id, "google", "google-sub-guest")).rejects.toThrow();
  });

  it("refuses to unlink the LAST sign-in method (OAuth-only account)", async () => {
    // No password: Google is the only way in.
    const u = await seedUser({ email: "oauth-only@example.com" });
    await linkOAuthAccount(prisma, u.id, "google", "google-sub-2");

    await expect(unlinkOAuthAccount(prisma, u.id, "google")).rejects.toThrow();
    expect(await prisma.oAuthAccount.count({ where: { userId: u.id } })).toBe(1);
  });

  it("allows unlinking when a password remains as a way back in", async () => {
    const u = await seedWithPassword("both@example.com");
    await linkOAuthAccount(prisma, u.id, "google", "google-sub-3");

    await unlinkOAuthAccount(prisma, u.id, "google");
    expect(await prisma.oAuthAccount.count({ where: { userId: u.id } })).toBe(0);
  });
});

describe("accountState — the shape both clients render from", () => {
  it("reports linkage, password and pending email so web and Android agree", async () => {
    const u = await seedWithPassword("state@example.com");
    await linkOAuthAccount(prisma, u.id, "google", "google-sub-4");
    await requestEmailChange(prisma, u.id, "next@example.com", PASSWORD);

    const s = await accountState(prisma, u.id);
    expect(s.email).toBe("state@example.com");
    expect(s.hasPassword).toBe(true);
    expect(s.linkedProviders).toContain("google");
    expect(s.pendingEmail).toBe("next@example.com");
    expect(s.canUnlink).toBe(true); // password is a fallback
    expect(s.canChangeEmail).toBe(true);
  });

  it("hides an EXPIRED pending email so the UI never shows a dead 'awaiting confirmation'", async () => {
    const u = await seedWithPassword("state2@example.com");
    await requestEmailChange(prisma, u.id, "stale@example.com", PASSWORD);
    await prisma.user.update({ where: { id: u.id }, data: { pendingEmailExpires: new Date(Date.now() - 1000) } });

    expect((await accountState(prisma, u.id)).pendingEmail).toBeNull();
  });

  it("marks canUnlink false for an OAuth-only account", async () => {
    const u = await seedUser({ email: "oauth2@example.com" });
    await linkOAuthAccount(prisma, u.id, "google", "google-sub-5");

    const s = await accountState(prisma, u.id);
    expect(s.hasPassword).toBe(false);
    expect(s.canUnlink).toBe(false);
    // No password means no way to re-authenticate an email change either.
    expect(s.canChangeEmail).toBe(false);
  });
});
