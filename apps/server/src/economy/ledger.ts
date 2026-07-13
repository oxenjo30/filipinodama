import type { PrismaClient, Prisma, Currency } from "@prisma/client";
import { rankTierFor } from "@dama/shared";

type Grant = { userId: string; currency: Currency; amount: number; reason: string; refType?: string; refId?: string };
/** A Prisma transaction client (what $transaction(cb) hands the callback). */
type Tx = Prisma.TransactionClient;

const COL: Record<Currency, "gold" | "diamonds" | "trophies"> = {
  GOLD: "gold",
  DIAMONDS: "diamonds",
  TROPHIES: "trophies",
} as any;

/**
 * Balance mutation + ledger row INSIDE an existing transaction. Same rules as
 * applyLedger (signed amount, no negative GOLD/DIAMONDS, keeps rankTier synced)
 * but reuses the caller's tx so the whole operation is atomic with it. Use this
 * whenever crediting must commit-or-rollback together with another write (e.g.
 * flipping a Payment to settled and crediting diamonds in one shot).
 */
export async function applyLedgerTx(tx: Tx, g: Grant): Promise<number> {
  const user = await tx.user.findUniqueOrThrow({ where: { id: g.userId } });
  const col = COL[g.currency];
  const current = (user as any)[col] as number;
  const balance = current + g.amount;
  if (g.currency !== "TROPHIES" && balance < 0) {
    throw new Error(`INSUFFICIENT_${g.currency}`);
  }
  const extra = g.currency === "TROPHIES" ? { rankTier: rankTierFor(balance).key } : {};
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
}

/**
 * The ONLY sanctioned way to change a currency balance.
 * Writes an append-only LedgerEntry and updates the cached balance in ONE
 * transaction. `amount` is signed (+grant / -spend). Throws on insufficient
 * spendable funds (GOLD/DIAMONDS cannot go negative; TROPHIES may).
 */
export async function applyLedger(prisma: PrismaClient, g: Grant) {
  try {
    return await prisma.$transaction((tx) => applyLedgerTx(tx, g));
  } catch (e) {
    // Idempotency backstop: the (user, currency, reason, ref) unique index means
    // a duplicate ref'd grant (e.g. a re-delivered webhook / retried settle)
    // fails with P2002 — treat it as already-applied and return the live balance
    // instead of erroring or double-crediting. Only ref'd grants can hit this.
    if (
      typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002" &&
      g.refId != null && g.refType != null
    ) {
      const col = COL[g.currency];
      const user = await prisma.user.findUniqueOrThrow({ where: { id: g.userId } });
      return (user as unknown as Record<string, number>)[col];
    }
    throw e;
  }
}

/** Spend gold/diamonds on a store item + grant the item, atomically. */
export async function purchaseItem(prisma: PrismaClient, userId: string, itemId: string) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.storeItem.findUniqueOrThrow({ where: { id: itemId } });
    // The season pass is NOT a generic inventory item — granting it here would
    // charge diamonds without ever setting hasPass. It must be bought via
    // POST /api/season/pass. Refuse it (and any inactive item) on this path.
    if (item.type === "SEASON_PASS") throw new Error("NOT_PURCHASABLE");
    if (!item.active) throw new Error("NOT_PURCHASABLE");
    const owned = await tx.inventoryItem.findUnique({ where: { userId_itemId: { userId, itemId } } });
    if (owned) throw new Error("ALREADY_OWNED");
    const useDiamonds = item.priceDiamonds != null && item.priceGold == null;
    const currency: Currency = useDiamonds ? "DIAMONDS" : "GOLD";
    const basePrice = useDiamonds ? item.priceDiamonds! : item.priceGold ?? 0;
    // Daily Deals: the client computes and displays item.salePrice when
    // item.onSale is true (StoreAssets.kt storeItemPrice / apps/web equivalent)
    // — charge that SAME price here, not the struck-through base price, or the
    // user is silently overcharged relative to what they saw and confirmed.
    const price =
      item.onSale && item.salePrice != null && item.salePrice > 0 && item.salePrice < basePrice
        ? item.salePrice
        : basePrice;
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
