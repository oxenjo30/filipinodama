import type { FastifyInstance } from "fastify";
import type { ItemType } from "@prisma/client";
import { purchaseSchema, checkoutSchema } from "@dama/shared";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { features } from "../config/env.js";
import { requireAuth } from "../auth/guards.js";
import { purchaseItem } from "../economy/ledger.js";
import { sendEmail, receiptEmailHtml } from "../lib/email.js";

/**
 * Diamond top-up packs. PayMongo is not live yet, so these are hardcoded with
 * sensible PH pricing (PHP centavos). Real Payment rows + crediting happen only
 * in the webhook (a later task); this list drives the store UI + checkout intent.
 */
const DIAMOND_PACKS = [
  { id: "pack_diamonds_80", diamonds: 80, bonus: 0, priceCents: 4900, currency: "PHP", label: "Pouch" },
  { id: "pack_diamonds_250", diamonds: 250, bonus: 20, priceCents: 14900, currency: "PHP", label: "Sack" },
  { id: "pack_diamonds_550", diamonds: 550, bonus: 70, priceCents: 29900, currency: "PHP", label: "Chest", popular: true },
  { id: "pack_diamonds_1200", diamonds: 1200, bonus: 200, priceCents: 59900, currency: "PHP", label: "Vault" },
  { id: "pack_diamonds_2600", diamonds: 2600, bonus: 600, priceCents: 119900, currency: "PHP", label: "Hoard", bestValue: true },
] as const;

/** Map raw ledger/purchase Error messages to typed ApiErrors. */
function purchaseError(e: unknown): never {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg === "ALREADY_OWNED") throw err.conflict("ALREADY_OWNED", "You already own this item");
  if (msg === "NOT_PURCHASABLE") throw err.badRequest("NOT_PURCHASABLE", "This item can't be bought here");
  if (msg.startsWith("INSUFFICIENT_")) {
    const cur = msg.slice("INSUFFICIENT_".length).toLowerCase();
    throw err.badRequest("INSUFFICIENT_FUNDS", `Not enough ${cur}`);
  }
  // findUniqueOrThrow on a missing item id
  if (msg.includes("No StoreItem") || msg.includes("Record to")) {
    throw err.notFound("ITEM_NOT_FOUND", "Store item not found");
  }
  throw e;
}

export async function storeRoutes(app: FastifyInstance) {
  // GET /api/store/items — active catalog grouped by ItemType
  app.get("/store/items", async () => {
    const items = await prisma.storeItem.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    const groups: Record<string, typeof items> = {};
    for (const it of items) {
      (groups[it.type] ??= []).push(it);
    }
    // stable, typed group list
    const grouped = (Object.keys(groups) as ItemType[]).map((type) => ({
      type,
      items: groups[type],
    }));
    return ok({ groups: grouped, items });
  });

  // POST /api/store/purchase — server-authoritative spend + grant + ledger + order
  app.post("/store/purchase", { preHandler: requireAuth }, async (req) => {
    const { itemId } = purchaseSchema.parse(req.body);
    try {
      const result = await purchaseItem(prisma, req.userId!, itemId);
      const [user, inventory, item] = await Promise.all([
        prisma.user.findUniqueOrThrow({ where: { id: req.userId! } }),
        prisma.inventoryItem.findUnique({ where: { userId_itemId: { userId: req.userId!, itemId } } }),
        prisma.storeItem.findUnique({ where: { id: itemId }, select: { name: true, priceGold: true, priceDiamonds: true } }),
      ]);
      // Best-effort receipt email — fire-and-forget so a mail failure can never
      // fail the (already-committed) purchase. Only for real accounts with an
      // email; guests have none. `total` is the item's price in the charged
      // currency (what was actually spent).
      if (user.email && !user.isGuest && item) {
        const total = result.currency === "DIAMONDS" ? item.priceDiamonds ?? 0 : item.priceGold ?? 0;
        void sendEmail(
          user.email,
          "Your FilipinoDama Royal receipt",
          receiptEmailHtml({
            username: user.username,
            orderId: itemId,
            items: [{ name: item.name, price: total }],
            total,
            currency: result.currency,
            when: new Date(),
          }),
        ).catch(() => {
          /* non-fatal — purchase already committed */
        });
      }
      return ok({
        itemId,
        currency: result.currency,
        balance: result.balance,
        balances: { gold: user.gold, diamonds: user.diamonds, trophies: user.trophies },
        inventoryItem: inventory,
      });
    } catch (e) {
      purchaseError(e);
    }
  });

  // GET /api/orders — the authed user's FULL purchase history: in-game item
  // purchases (Order rows) AND real-money diamond top-ups (settled Payment rows),
  // merged and sorted newest-first. The prototype lists both, with a "Credited
  // N 💎" line + payment method for top-ups.
  app.get("/orders", { preHandler: requireAuth }, async (req) => {
    const userId = req.userId!;
    const [orders, payments] = await Promise.all([
      prisma.order.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.payment.findMany({
        where: { userId, status: "settled" },
        orderBy: { settledAt: "desc" },
        take: 100,
      }),
    ]);
    // Normalize both into one receipt shape the UI can render uniformly.
    type Receipt = {
      id: string;
      kind: "item" | "topup";
      createdAt: Date;
      currency: string; // GOLD | DIAMONDS | PHP
      total: number; // in-game amount, or PHP centavos for top-ups
      method: string; // "Gold Balance" | "Diamond Balance" | "GCash/Maya/Card"
      items: unknown; // Order.items for purchases
      creditedDiamonds: number | null; // top-ups credited N diamonds
    };
    const itemReceipts: Receipt[] = orders.map((o) => ({
      id: o.id,
      kind: "item",
      createdAt: o.createdAt,
      currency: o.currency,
      total: o.total,
      method: o.currency === "DIAMONDS" ? "Diamond Balance" : "Gold Balance",
      items: o.items,
      creditedDiamonds: null,
    }));
    const topupReceipts: Receipt[] = payments.map((p) => ({
      id: p.id,
      kind: "topup",
      createdAt: p.settledAt ?? p.createdAt,
      currency: p.currencyCode.toUpperCase(),
      total: p.amountCents,
      method: "GCash / Maya / Card",
      items: [{ name: `${p.diamonds} Diamonds — top-up`, price: p.amountCents }],
      creditedDiamonds: p.diamonds,
    }));
    const receipts = [...itemReceipts, ...topupReceipts].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    // `orders` kept for backward-compat with any existing client field usage.
    return ok({ orders: receipts, receipts });
  });
  // Diamond packs + checkout + webhook now live in modules/payments.ts.
}
