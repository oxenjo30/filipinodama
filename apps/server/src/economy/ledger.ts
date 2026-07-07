import type { PrismaClient, Currency } from "@prisma/client";
import { rankTierFor } from "@dama/shared";

type Grant = { userId: string; currency: Currency; amount: number; reason: string; refType?: string; refId?: string };

const COL: Record<Currency, "gold" | "diamonds" | "trophies"> = {
  GOLD: "gold",
  DIAMONDS: "diamonds",
  TROPHIES: "trophies",
} as any;

/**
 * The ONLY sanctioned way to change a currency balance.
 * Writes an append-only LedgerEntry and updates the cached balance in ONE
 * transaction. `amount` is signed (+grant / -spend). Throws on insufficient
 * spendable funds (GOLD/DIAMONDS cannot go negative; TROPHIES may).
 */
export async function applyLedger(prisma: PrismaClient, g: Grant) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: g.userId } });
    const col = COL[g.currency];
    const current = (user as any)[col] as number;
    const balance = current + g.amount;
    if (g.currency !== "TROPHIES" && balance < 0) {
      throw new Error(`INSUFFICIENT_${g.currency}`);
    }
    // When trophies change, keep the denormalized rankTier cache in sync so it
    // never drifts from the authoritative trophy count.
    const extra =
      g.currency === "TROPHIES" ? { rankTier: rankTierFor(balance).key } : {};
    await tx.user.update({ where: { id: g.userId }, data: { [col]: balance, ...extra } as any });
    await tx.ledgerEntry.create({
      data: {
        userId: g.userId,
        currency: g.currency,
        amount: g.amount,
        balance,
        reason: g.reason,
        refType: g.refType,
        refId: g.refId,
      },
    });
    return balance;
  });
}

/** Spend gold/diamonds on a store item + grant the item, atomically. */
export async function purchaseItem(prisma: PrismaClient, userId: string, itemId: string) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.storeItem.findUniqueOrThrow({ where: { id: itemId } });
    const owned = await tx.inventoryItem.findUnique({ where: { userId_itemId: { userId, itemId } } });
    if (owned) throw new Error("ALREADY_OWNED");
    const useDiamonds = item.priceDiamonds != null && item.priceGold == null;
    const currency: Currency = useDiamonds ? "DIAMONDS" : "GOLD";
    const price = useDiamonds ? item.priceDiamonds! : item.priceGold ?? 0;
    // spend (reuses the same tx by calling primitives inline)
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const col = COL[currency];
    const balance = (user as any)[col] - price;
    if (balance < 0) throw new Error(`INSUFFICIENT_${currency}`);
    await tx.user.update({ where: { id: userId }, data: { [col]: balance } as any });
    await tx.ledgerEntry.create({
      data: { userId, currency, amount: -price, balance, reason: "purchase", refType: "item", refId: itemId },
    });
    await tx.inventoryItem.create({ data: { userId, itemId } });
    await tx.order.create({
      data: { userId, currency, total: price, items: [{ itemId, name: item.name, price }] },
    });
    // bundles grant their contents too
    if (item.type === "BUNDLE" && item.bundleItems.length) {
      for (const bId of item.bundleItems) {
        const has = await tx.inventoryItem.findUnique({ where: { userId_itemId: { userId, itemId: bId } } });
        if (!has) await tx.inventoryItem.create({ data: { userId, itemId: bId } });
      }
    }
    return { balance, currency };
  });
}
