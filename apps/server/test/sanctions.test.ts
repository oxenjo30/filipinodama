import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { muteUser, banUser } from "../src/lib/sanctions.js";
import { seedUser, truncateAll } from "./helpers.js";

afterEach(truncateAll);
afterAll(async () => { await prisma.$disconnect(); });

describe("sanctions", () => {
  it("muteUser sets mutedUntil, writes an audit row, returns null email", async () => {
    const actor = await seedUser({ adminRole: "MODERATOR" });
    const target = await seedUser();
    const res = await prisma.$transaction((tx) =>
      muteUser(tx, { targetId: target.id, actorId: actor.id, durationHours: 24, reason: "test" }),
    );
    expect(res.email).toBeNull();
    const after = await prisma.user.findUnique({ where: { id: target.id } });
    expect(after!.mutedUntil!.getTime()).toBeGreaterThan(Date.now());
    const audits = await prisma.auditLog.findMany({ where: { targetId: target.id, action: "user.mute" } });
    expect(audits).toHaveLength(1);
  });

  it("banUser sets bannedUntil + returns email data for a non-guest with an email", async () => {
    const actor = await seedUser({ adminRole: "MODERATOR" });
    const target = await prisma.user.update({ where: { id: (await seedUser()).id }, data: { email: "x@example.com" } });
    const res = await prisma.$transaction((tx) =>
      banUser(tx, { targetId: target.id, actorId: actor.id, reason: "test" }),
    );
    expect(res.email).not.toBeNull();
    expect(res.email!.email).toBe("x@example.com");
    const after = await prisma.user.findUnique({ where: { id: target.id } });
    expect(after!.bannedUntil!.getTime()).toBeGreaterThan(Date.now());
  });
});
