import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "../src/db/client.js";
import { isBlockedBetween } from "../src/modules/blocks.js";
import { seedUser, truncateAll } from "./helpers.js";

afterEach(async () => { await truncateAll(); });

describe("block", () => {
  it("upsert is idempotent + isBlockedBetween is symmetric", async () => {
    const a = await seedUser(); const b = await seedUser();
    await prisma.block.upsert({ where: { blockerId_blockedId: { blockerId: a.id, blockedId: b.id } }, update: {}, create: { blockerId: a.id, blockedId: b.id } });
    await prisma.block.upsert({ where: { blockerId_blockedId: { blockerId: a.id, blockedId: b.id } }, update: {}, create: { blockerId: a.id, blockedId: b.id } }); // no throw
    expect(await isBlockedBetween(a.id, b.id)).toBe(true);
    expect(await isBlockedBetween(b.id, a.id)).toBe(true); // symmetric
    const c = await seedUser();
    expect(await isBlockedBetween(a.id, c.id)).toBe(false);
  });
  it("deleteMany friendship on a non-friend does not throw", async () => {
    const a = await seedUser(); const b = await seedUser();
    const [aId, bId] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
    await expect(prisma.friendship.deleteMany({ where: { aId, bId } })).resolves.toBeDefined();
  });
});
