import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "../src/db/client.js";
import { buildTestApp, seedUser, authFor, truncateAll } from "./helpers.js";
import { hashPassword } from "../src/auth/tokens.js";
import { accountState, requestEmailChange, confirmEmailChange } from "../src/auth/service.js";

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

  it("refuses for a guest, and specifically BECAUSE they are a guest", async () => {
    // Review finding: the original assertion could not fail — a guest also has
    // no password, so the password guard threw first and the test passed even
    // if the guest check were deleted. Give the guest a password so only the
    // guest branch can be responsible for the rejection.
    const g = await seedUser({ isGuest: true, email: "guest@example.com" });
    await prisma.user.update({ where: { id: g.id }, data: { passwordHash: await hashPassword(PASSWORD) } });

    // Assert the CODE, not the message: the copy says "Create an account…" and
    // never contains the word "guest", so a message regex silently matched
    // nothing useful. The code is what pins which branch rejected.
    await expect(requestEmailChange(prisma, g.id, "new@example.com", PASSWORD)).rejects.toMatchObject({
      code: "GUEST_ACCOUNT",
    });
    expect((await accountState(prisma, g.id)).canChangeEmail).toBe(false);
  });

  it("refuses an OAuth-only account outright — the confirmation link is NOT proof", async () => {
    // Review finding. The first cut let a passwordless account through on the
    // reasoning that the emailed link proves ownership; that is circular,
    // because the ATTACKER supplies the address and so receives the link. One
    // stolen session was a full takeover of any Google-signup account.
    const u = await seedUser({ email: "oauth-only@example.com" }); // no passwordHash

    // Supply a password DELIBERATELY. Calling with none would be rejected by the
    // "you didn't send a password" branch instead, and the test would pass even
    // with this guard deleted — verified by mutation: disabling the guard left
    // the old assertion green.
    await expect(requestEmailChange(prisma, u.id, "attacker@evil.com", "anything")).rejects.toMatchObject({
      code: "PASSWORD_NOT_SET",
    });

    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.pendingEmail).toBeNull();
    // …and the UI is told not to offer it in the first place.
    expect((await accountState(prisma, u.id)).canChangeEmail).toBe(false);
  });
});

/**
 * Route level, not service level. The tests above call the service directly and
 * so skip the request schema entirely — which is exactly where a real bug hid:
 * an empty password field failed zod's `.min(1)` BEFORE the service ran, so the
 * player saw "String must contain at least 1 character(s)" instead of the
 * intended "Enter your current password to change your email." Found by
 * submitting the form on the emulator with the password left blank.
 */
describe("POST /api/auth/email/change — what the clients actually send", () => {
  it("treats a blank password as ABSENT, so the coded message survives", async () => {
    const app = await buildTestApp();
    const u = await seedWithPassword("blank@example.com");

    // Both clients send the input verbatim; an untouched field is "".
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/email/change",
      headers: { cookie: authFor({ sub: u.id }) },
      payload: { newEmail: "next@example.com", currentPassword: "" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("PASSWORD_REQUIRED");
    expect(res.json().error.message).not.toMatch(/at least 1 character/i);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).pendingEmail).toBeNull();
    await app.close();
  });

  it("treats an explicit null the same way — kotlinx serialises absent fields as null", async () => {
    const app = await buildTestApp();
    const u = await seedWithPassword("nullpw@example.com");

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/email/change",
      headers: { cookie: authFor({ sub: u.id }) },
      payload: { newEmail: "next@example.com", currentPassword: null },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("PASSWORD_REQUIRED");
    await app.close();
  });

  it("still rejects a WRONG password with BAD_PASSWORD, and stages nothing", async () => {
    const app = await buildTestApp();
    const u = await seedWithPassword("wrong@example.com");

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/email/change",
      headers: { cookie: authFor({ sub: u.id }) },
      payload: { newEmail: "next@example.com", currentPassword: "not-my-password" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("BAD_PASSWORD");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).pendingEmail).toBeNull();
    await app.close();
  });

  it("accepts the correct password and stages without touching the live address", async () => {
    const app = await buildTestApp();
    const u = await seedWithPassword("good@example.com");

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/email/change",
      headers: { cookie: authFor({ sub: u.id }) },
      payload: { newEmail: "Next@Example.com", currentPassword: PASSWORD },
    });

    expect(res.statusCode).toBe(200);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.email).toBe("good@example.com");
    expect(after.pendingEmail).toBe("next@example.com");
    await app.close();
  });
});

describe("accountState — the shape both clients render from", () => {
  it("reports linkage, password and pending email so web and Android agree", async () => {
    const u = await seedWithPassword("state@example.com");
    await requestEmailChange(prisma, u.id, "next@example.com", PASSWORD);

    const s = await accountState(prisma, u.id);
    expect(s.email).toBe("state@example.com");
    expect(s.hasPassword).toBe(true);
    expect(s.pendingEmail).toBe("next@example.com");
    expect(s.canChangeEmail).toBe(true);
  });

  it("hides an EXPIRED pending email so the UI never shows a dead 'awaiting confirmation'", async () => {
    const u = await seedWithPassword("state2@example.com");
    await requestEmailChange(prisma, u.id, "stale@example.com", PASSWORD);
    await prisma.user.update({ where: { id: u.id }, data: { pendingEmailExpires: new Date(Date.now() - 1000) } });

    expect((await accountState(prisma, u.id)).pendingEmail).toBeNull();
  });

});
