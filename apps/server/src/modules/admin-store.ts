import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { requireAdmin } from "../auth/guards.js";
import { audit } from "../lib/audit.js";

/**
 * Store & economy catalog — /api/admin/store/*. CRUD over the StoreItem model
 * (the player-facing shop catalog: boards, skins, avatars, frames, emotes,
 * bundles, season passes). SUPPORT can VIEW; every write requires ECONOMY and
 * writes an AuditLog row via audit() with before/after. Reuses the existing
 * StoreItem model only — no new models, no migrations, no payments (gold-only).
 *
 * NOTE: this is CATALOG management. Player grants + the ledger live in admin.ts.
 *
 * Roles (hierarchy in guards.ts): SUPPORT < MODERATOR < ECONOMY < SUPERADMIN.
 */

// StoreItem.type enum — mirrors ItemType in schema.prisma exactly.
const itemTypeEnum = z.enum(["BOARD", "SKIN", "AVATAR", "FRAME", "EMOTE", "BUNDLE", "SEASON_PASS"]);

// Optional non-negative int price; null clears it. Coerces "" → undefined upstream.
const priceField = z.number().int().min(0).nullable().optional();

const createSchema = z.object({
  id: z.string().trim().min(1, "id required").max(80).regex(/^[a-z0-9][a-z0-9_-]*$/i, "id must be a slug (letters/digits/-/_)"),
  type: itemTypeEnum,
  name: z.string().trim().min(1, "name required").max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  priceGold: priceField,
  priceDiamonds: priceField,
  assetKey: z.string().trim().min(1, "assetKey required").max(300),
  previewKey: z.string().trim().max(300).nullable().optional(),
  tag: z.string().trim().max(24).nullable().optional(),
  isPremium: z.boolean().optional(),
  active: z.boolean().optional(),
  salePrice: priceField,
  onSale: z.boolean().optional(),
  featured: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1_000_000).optional(),
  reason: z.string().trim().min(1, "reason required").max(500),
});

// Edit: every field optional (patch); reason still required + audited.
const patchSchema = z
  .object({
    type: itemTypeEnum.optional(),
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    priceGold: priceField,
    priceDiamonds: priceField,
    assetKey: z.string().trim().min(1).max(300).optional(),
    previewKey: z.string().trim().max(300).nullable().optional(),
    tag: z.string().trim().max(24).nullable().optional(),
    isPremium: z.boolean().optional(),
    active: z.boolean().optional(),
    salePrice: priceField,
    onSale: z.boolean().optional(),
    featured: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(1_000_000).optional(),
    reason: z.string().trim().min(1, "reason required").max(500),
  })
  .refine(
    (b) => Object.keys(b).some((k) => k !== "reason"),
    "no fields to update",
  );

const reasonSchema = z.object({ reason: z.string().trim().min(1, "reason required").max(500) });

// Fields returned to the admin console (the whole catalog row).
const storeSelect = {
  id: true,
  type: true,
  name: true,
  description: true,
  priceGold: true,
  priceDiamonds: true,
  assetKey: true,
  previewKey: true,
  tag: true,
  isPremium: true,
  active: true,
  salePrice: true,
  onSale: true,
  featured: true,
  sortOrder: true,
  createdAt: true,
} satisfies Prisma.StoreItemSelect;

export async function adminStoreRoutes(app: FastifyInstance) {
  // ── List the catalog (SUPPORT can view) ────────────────────────────────────
  app.get("/admin/store", { preHandler: requireAdmin("SUPPORT") }, async (req) => {
    const q = z
      .object({
        type: itemTypeEnum.optional(),
        active: z.enum(["true", "false"]).optional(),
        onSale: z.enum(["true", "false"]).optional(),
        featured: z.enum(["true", "false"]).optional(),
        q: z.string().trim().optional(),
      })
      .parse(req.query);
    const where: Prisma.StoreItemWhereInput = {
      ...(q.type ? { type: q.type } : {}),
      ...(q.active ? { active: q.active === "true" } : {}),
      ...(q.onSale ? { onSale: q.onSale === "true" } : {}),
      ...(q.featured ? { featured: q.featured === "true" } : {}),
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: "insensitive" } }, { id: { contains: q.q, mode: "insensitive" } }] } : {}),
    };
    const rows = await prisma.storeItem.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      select: { ...storeSelect, _count: { select: { inventory: true } } },
    });
    const items = rows.map(({ _count, ...it }) => ({ ...it, ownedCount: _count.inventory }));
    return ok({ items, total: items.length });
  });

  // ── Create a catalog item (ECONOMY) ────────────────────────────────────────
  app.post("/admin/store", { preHandler: requireAdmin("ECONOMY") }, async (req) => {
    const { reason, ...data } = createSchema.parse(req.body);
    const exists = await prisma.storeItem.findUnique({ where: { id: data.id }, select: { id: true } });
    if (exists) throw err.conflict("ID_TAKEN", `A store item with id "${data.id}" already exists.`);
    const created = await prisma.storeItem.create({
      data: {
        id: data.id,
        type: data.type,
        name: data.name,
        description: data.description ?? null,
        priceGold: data.priceGold ?? null,
        priceDiamonds: data.priceDiamonds ?? null,
        assetKey: data.assetKey,
        previewKey: data.previewKey ?? null,
        tag: data.tag ?? null,
        isPremium: data.isPremium ?? false,
        active: data.active ?? true,
        salePrice: data.salePrice ?? null,
        onSale: data.onSale ?? false,
        featured: data.featured ?? false,
        sortOrder: data.sortOrder ?? 0,
      },
      select: storeSelect,
    });
    await audit(prisma, { actorId: req.userId!, action: "store.item.create", targetType: "storeItem", targetId: created.id, after: created, reason });
    return ok(created);
  });

  // ── Edit fields (ECONOMY) — audited with before/after ──────────────────────
  app.patch<{ Params: { id: string } }>("/admin/store/:id", { preHandler: requireAdmin("ECONOMY") }, async (req) => {
    const { reason, ...fields } = patchSchema.parse(req.body);
    const before = await prisma.storeItem.findUnique({ where: { id: req.params.id }, select: storeSelect });
    if (!before) throw err.notFound("NO_ITEM", "Store item not found");
    // Build the update from only the provided keys (null clears nullable fields).
    const data: Prisma.StoreItemUpdateInput = {};
    if (fields.type !== undefined) data.type = fields.type;
    if (fields.name !== undefined) data.name = fields.name;
    if (fields.description !== undefined) data.description = fields.description;
    if (fields.priceGold !== undefined) data.priceGold = fields.priceGold;
    if (fields.priceDiamonds !== undefined) data.priceDiamonds = fields.priceDiamonds;
    if (fields.assetKey !== undefined) data.assetKey = fields.assetKey;
    if (fields.previewKey !== undefined) data.previewKey = fields.previewKey;
    if (fields.tag !== undefined) data.tag = fields.tag;
    if (fields.isPremium !== undefined) data.isPremium = fields.isPremium;
    if (fields.active !== undefined) data.active = fields.active;
    if (fields.salePrice !== undefined) data.salePrice = fields.salePrice;
    if (fields.onSale !== undefined) data.onSale = fields.onSale;
    if (fields.featured !== undefined) data.featured = fields.featured;
    if (fields.sortOrder !== undefined) data.sortOrder = fields.sortOrder;
    const after = await prisma.storeItem.update({ where: { id: req.params.id }, data, select: storeSelect });
    await audit(prisma, { actorId: req.userId!, action: "store.item.update", targetType: "storeItem", targetId: req.params.id, before, after, reason });
    return ok(after);
  });

  // ── Quick toggle active (ECONOMY) — convenience, audited ───────────────────
  app.post<{ Params: { id: string } }>("/admin/store/:id/toggle", { preHandler: requireAdmin("ECONOMY") }, async (req) => {
    const { reason } = reasonSchema.parse(req.body);
    const before = await prisma.storeItem.findUnique({ where: { id: req.params.id }, select: { active: true } });
    if (!before) throw err.notFound("NO_ITEM", "Store item not found");
    const active = !before.active;
    await prisma.storeItem.update({ where: { id: req.params.id }, data: { active } });
    await audit(prisma, { actorId: req.userId!, action: active ? "store.item.activate" : "store.item.deactivate", targetType: "storeItem", targetId: req.params.id, before, after: { active }, reason });
    return ok({ active });
  });

  // ── Delete (ECONOMY) — soft-delete when owned, hard-delete when unowned ─────
  // Referential integrity: InventoryItem rows point at StoreItem; a hard delete
  // would orphan players' owned items. So if anyone owns it we set active=false
  // instead; only zero-inventory items are actually removed.
  app.delete<{ Params: { id: string } }>("/admin/store/:id", { preHandler: requireAdmin("ECONOMY") }, async (req) => {
    const { reason } = reasonSchema.parse(req.body);
    const before = await prisma.storeItem.findUnique({
      where: { id: req.params.id },
      select: { ...storeSelect, _count: { select: { inventory: true } } },
    });
    if (!before) throw err.notFound("NO_ITEM", "Store item not found");
    const owned = before._count.inventory;
    if (owned > 0) {
      // Soft-delete: keep the row (players own it), just pull it from the shop.
      const { _count, ...beforeItem } = before;
      await prisma.storeItem.update({ where: { id: req.params.id }, data: { active: false, onSale: false, featured: false } });
      await audit(prisma, {
        actorId: req.userId!,
        action: "store.item.softDelete",
        targetType: "storeItem",
        targetId: req.params.id,
        before: beforeItem,
        after: { active: false, onSale: false, featured: false, ownedCount: owned },
        reason,
      });
      return ok({ deleted: false, softDeleted: true, ownedCount: owned });
    }
    // Hard delete: nobody owns it, safe to remove.
    const { _count, ...beforeItem } = before;
    await prisma.storeItem.delete({ where: { id: req.params.id } });
    await audit(prisma, { actorId: req.userId!, action: "store.item.delete", targetType: "storeItem", targetId: req.params.id, before: beforeItem, reason });
    return ok({ deleted: true, softDeleted: false, ownedCount: 0 });
  });
}
