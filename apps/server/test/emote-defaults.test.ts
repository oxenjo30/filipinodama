import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { grantDefaults } from "../src/auth/service.js";
import { seedUser, truncateAll } from "./helpers.js";

// InventoryItem cascades on User delete, but clear it explicitly (mirrors
// admin-analytics.test.ts) so a failed run never leaves rows behind for the
// next file. truncateAll() removes the t_user_ rows seedUser() creates.
afterEach(async () => {
  await prisma.inventoryItem.deleteMany({});
  await truncateAll();
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("grantDefaults emote loadout", () => {
  it("equips up to 6 free emotes and grants EMOTE inventory rows", async () => {
    // Arrange: a bare user with no cosmetics.
    const user = await seedUser();

    // Act
    await grantDefaults(prisma, user.id);

    // Assert: equippedEmotes populated, capped at 6, all free EMOTE ids.
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.equippedEmotes.length).toBeGreaterThan(0);
    expect(after.equippedEmotes.length).toBeLessThanOrEqual(6);

    const freeEmotes = await prisma.storeItem.findMany({
      where: { type: "EMOTE", priceGold: 0, priceDiamonds: null, active: true },
      select: { id: true },
    });
    const freeIds = new Set(freeEmotes.map((e) => e.id));
    for (const id of after.equippedEmotes) expect(freeIds.has(id)).toBe(true);

    // Inventory ownership for every free emote.
    const owned = await prisma.inventoryItem.findMany({
      where: { userId: user.id, itemId: { in: [...freeIds] } },
      select: { itemId: true },
    });
    expect(owned.length).toBe(freeIds.size);
  });
});
