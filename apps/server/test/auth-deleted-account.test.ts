import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { prisma } from "../src/db/client.js";
import { seedUser, truncateAll } from "./helpers.js";
import { login } from "../src/auth/service.js";
import { hashPassword } from "../src/auth/tokens.js";

/**
 * A soft-deleted account must not be able to sign in during its grace period.
 *
 * This was never an authorization bypass — requireAuth, the realtime socket
 * guard and rotateSession all already reject on `deletedAt`. The defect was that
 * `login()` checked the password and ban state but NOT `deletedAt`, so it issued
 * fresh session cookies for an account every other layer would immediately deny:
 * the client reported a successful sign-in and then behaved as signed-out, with
 * no recovery path (refreshMe cannot fix it, because the failure is not expiry).
 *
 * It was also a credential-verification oracle — an attacker could confirm that
 * a password was correct for a deleted account.
 */

beforeEach(async () => {
  await truncateAll();
});
afterEach(async () => {
  await truncateAll();
});

async function seedWithPassword(email: string, password: string, deletedAt: Date | null) {
  const u = await seedUser({ email, deletedAt });
  await prisma.user.update({
    where: { id: u.id },
    data: { passwordHash: await hashPassword(password) },
  });
  return u;
}

describe("login vs a soft-deleted account", () => {
  it("rejects the CORRECT password for a deleted account", async () => {
    await seedWithPassword("gone@test.dama", "correct-horse", new Date());

    await expect(login(prisma, { email: "gone@test.dama", password: "correct-horse" })).rejects.toMatchObject({
      // Same generic code as a wrong password — a distinct "account deleted"
      // response would confirm the address was registered.
      code: "BAD_CREDENTIALS",
    });
  });

  it("is indistinguishable from a wrong password (no oracle)", async () => {
    await seedWithPassword("gone2@test.dama", "correct-horse", new Date());

    const right = await login(prisma, { email: "gone2@test.dama", password: "correct-horse" }).catch((e) => e);
    const wrong = await login(prisma, { email: "gone2@test.dama", password: "nope" }).catch((e) => e);

    expect(right.code).toBe(wrong.code);
    expect(right.message).toBe(wrong.message);
  });

  it("still lets a LIVE account sign in", async () => {
    const u = await seedWithPassword("live@test.dama", "correct-horse", null);

    const got = await login(prisma, { email: "live@test.dama", password: "correct-horse" });

    expect(got.id).toBe(u.id);
  });
});
