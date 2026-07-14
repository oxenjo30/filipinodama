import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { purchaseItem } from "../src/economy/ledger.js";
import { seedUser, truncateAll } from "./helpers.js";

/**
 * Regression test for the Phase 8 Android golden-path bug: the Store's Daily
 * Deals show a discounted `salePrice` (client: StoreAssets.kt storeItemPrice /
 * web equivalent) and the purchase confirm sheet shows that SAME discounted
 * price — but purchaseItem() charged the full priceGold/priceDiamonds,
 * silently overcharging the player relative to what they saw and confirmed.
 *
 * Repro (from the field): Store showed "Crimson Legion Pieces — 1800 gold"
 * (its -40% Daily Deal price) in both the catalog card and the confirm sheet.
 * Confirming actually charged 3000 gold (item.priceGold) — a 1200-gold silent
 * overcharge with zero test coverage catching it.
 */
describe("purchaseItem — Daily Deals sale price", () => {
  afterEach(async () => {
    // truncateAll() intentionally does NOT clear StoreItem (durable seed data),
    // but this suite creates StoreItem rows with fixed ids (t_*). Without this
    // cleanup those rows leak and the NEXT run collides on the unique id
    // ("Unique constraint failed on the fields: (id)"). Scope the delete to the
    // test-only "t_" ids so real seeded store items are never touched.
    await prisma.storeItem.deleteMany({ where: { id: { startsWith: "t_" } } });
    await truncateAll();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("charges the discounted salePrice, not the struck-through base price, when the item is on sale", async () => {
    const user = await seedUser({ gold: 5000 });
    const item = await prisma.storeItem.create({
      data: {
        id: "t_sale_item",
        type: "SKIN",
        name: "Test Sale Skin",
        assetKey: "test",
        priceGold: 3000,
        onSale: true,
        salePrice: 1800,
        active: true,
      },
    });

    const result = await purchaseItem(prisma, user.id, item.id);

    expect(result.balance).toBe(5000 - 1800);
    const entry = await prisma.ledgerEntry.findFirst({ where: { userId: user.id, refId: item.id } });
    expect(entry?.amount).toBe(-1800);
    const order = await prisma.order.findFirst({ where: { userId: user.id } });
    expect(order?.total).toBe(1800);
  });

  it("charges the full base price when the item is not on sale", async () => {
    const user = await seedUser({ gold: 5000 });
    const item = await prisma.storeItem.create({
      data: {
        id: "t_full_price_item",
        type: "SKIN",
        name: "Test Full Price Skin",
        assetKey: "test",
        priceGold: 2000,
        onSale: false,
        active: true,
      },
    });

    const result = await purchaseItem(prisma, user.id, item.id);

    expect(result.balance).toBe(5000 - 2000);
    const entry = await prisma.ledgerEntry.findFirst({ where: { userId: user.id, refId: item.id } });
    expect(entry?.amount).toBe(-2000);
  });

  it("ignores a stale/invalid salePrice that is not below the base price", async () => {
    const user = await seedUser({ gold: 5000 });
    const item = await prisma.storeItem.create({
      data: {
        id: "t_bad_sale_item",
        type: "SKIN",
        name: "Test Bad Sale Skin",
        assetKey: "test",
        priceGold: 1000,
        onSale: true,
        salePrice: 1500, // higher than base — must not be used as a discount
        active: true,
      },
    });

    const result = await purchaseItem(prisma, user.id, item.id);

    expect(result.balance).toBe(5000 - 1000);
  });
});
