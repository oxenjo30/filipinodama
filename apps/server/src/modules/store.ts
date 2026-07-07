import type { FastifyInstance } from "fastify";
import type { ItemType } from "@prisma/client";
import { purchaseSchema, checkoutSchema } from "@dama/shared";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { features } from "../config/env.js";
import { requireAuth } from "../auth/guards.js";
import { purchaseItem } from "../economy/ledger.js";

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
      const [user, inventory] = await Promise.all([
        prisma.user.findUniqueOrThrow({ where: { id: req.userId! } }),
        prisma.inventoryItem.findUnique({ where: { userId_itemId: { userId: req.userId!, itemId } } }),
      ]);
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

  // GET /api/orders — the authed user's purchase history
  app.get("/orders", { preHandler: requireAuth }, async (req) => {
    const orders = await prisma.order.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return ok({ orders });
  });

  // GET /api/payments/packs — diamond top-up packs (hardcoded PH pricing)
  app.get("/payments/packs", async () => {
    return ok({ packs: DIAMOND_PACKS, currency: "PHP", enabled: features.payments });
  });

  // POST /api/payments/checkout — PayMongo checkout (not live yet → honest 503)
  app.post("/payments/checkout", { preHandler: requireAuth }, async (req) => {
    const { packId } = checkoutSchema.parse(req.body);
    const pack = DIAMOND_PACKS.find((p) => p.id === packId);
    if (!pack) throw err.notFound("PACK_NOT_FOUND", "Diamond pack not found");
    if (!features.payments) throw err.notConfigured("Payments");
    // PayMongo checkout session creation lands with the payments webhook task.
    throw err.notConfigured("Payments");
  });
}
