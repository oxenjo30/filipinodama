import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { grantDefaults } from "../src/auth/service.js";
import { seedUser, truncateAll } from "./helpers.js";

// The test seeds its OWN free-emote store items (prefix "t_item_emote_") rather
// than assuming the DB is seeded — the CI test DB runs `migrate deploy` only
// (no `db seed`), so store items don't exist there. Clean them + inventory +
// test users after each test so no rows leak into the next file.
const TEST_EMOTE_IDS = ["t_item_emote_a", "t_item_emote_b", "t_item_emote_c"];

afterEach(async () => {
  await prisma.inventoryItem.deleteMany({});
  await prisma.storeItem.deleteMany({ where: { id: { startsWith: "t_item_emote_" } } });
  await truncateAll();
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("grantDefaults emote loadout", () => {
  it("equips up to 6 free emotes and grants EMOTE inventory rows", async () => {
    // Arrange: seed free EMOTE store items (grantDefaults equips free emotes it
    // finds; without these the loadout is legitimately empty).
    await prisma.storeItem.createMany({
      data: TEST_EMOTE_IDS.map((id, i) => ({
        id,
        type: "EMOTE" as const,
        name: `Test Emote ${i}`,
        assetKey: "emote",
        previewKey: `emote:${["😀", "😎", "🎉"][i]}`,
        priceGold: 0,
        priceDiamonds: null,
        active: true,
        sortOrder: 100 + i,
      })),
    });

    // A bare user with no cosmetics.
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
