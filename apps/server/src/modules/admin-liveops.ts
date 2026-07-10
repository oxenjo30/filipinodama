import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { requireAdmin } from "../auth/guards.js";
import { audit } from "../lib/audit.js";

/**
 * Live ops (Seasons + Quests) — /api/admin/liveops/*. Reads/authors the existing
 * Season and Quest models only (no new models). Every mutation is role-gated by
 * requireAdmin() and writes an AuditLog row via audit() with before/after/reason.
 *
 * Roles (guards.ts hierarchy): SUPPORT < MODERATOR < ECONOMY < SUPERADMIN.
 * Reads are SUPPORT; writes are ECONOMY.
 */

// ── shared helpers ───────────────────────────────────────────────────────────

/** Season status derived from startsAt/endsAt vs now (no separate column). */
function seasonStatus(s: { startsAt: Date; endsAt: Date }): "upcoming" | "active" | "ended" {
  const now = Date.now();
  if (now < s.startsAt.getTime()) return "upcoming";
  if (now > s.endsAt.getTime()) return "ended";
  return "active";
}

/** Count of tiers in a `tiers` Json value, tolerant of non-array shapes. */
function tierCount(tiers: unknown): number {
  return Array.isArray(tiers) ? tiers.length : 0;
}

const reasonField = z.string().trim().min(1, "reason required").max(500);

// `tiers` is a free-form Json array authored as raw JSON in the client; validate
// it parses to an array here so a malformed blob never reaches the DB.
const tiersSchema = z
  .array(z.unknown())
  .or(z.string().transform((s, ctx) => {
    try {
      const v = JSON.parse(s);
      if (!Array.isArray(v)) throw new Error("not an array");
      return v as unknown[];
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "tiers must be a JSON array" });
      return z.NEVER;
    }
  }));

export async function adminLiveOpsRoutes(app: FastifyInstance) {
  // ── Seasons: list (SUPPORT) ────────────────────────────────────────────────
  app.get("/admin/liveops/seasons", { preHandler: requireAdmin("SUPPORT") }, async () => {
    const seasons = await prisma.season.findMany({
      orderBy: { startsAt: "desc" },
      select: {
        id: true, name: true, number: true, endsLabel: true, startsAt: true, endsAt: true, tiers: true,
        _count: { select: { progress: true } },
      },
    });
    return ok({
      items: seasons.map((s) => ({
        id: s.id,
        name: s.name,
        number: s.number,
        endsLabel: s.endsLabel,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        tiers: s.tiers,
        tierCount: tierCount(s.tiers),
        status: seasonStatus(s),
        participants: s._count.progress,
      })),
    });
  });

  // ── Seasons: create (ECONOMY) ──────────────────────────────────────────────
  app.post("/admin/liveops/seasons", { preHandler: requireAdmin("ECONOMY") }, async (req) => {
    const body = z
      .object({
        name: z.string().trim().min(1).max(120),
        number: z.number().int().min(1).optional(),
        endsLabel: z.string().trim().max(120).optional(),
        startsAt: z.coerce.date(),
        endsAt: z.coerce.date(),
        tiers: tiersSchema.default([]),
        reason: reasonField,
      })
      .parse(req.body);
    if (body.endsAt <= body.startsAt) throw err.badRequest("BAD_DATES", "endsAt must be after startsAt");
    const created = await prisma.season.create({
      data: {
        id: `S_${Date.now()}`,
        name: body.name,
        number: body.number,
        endsLabel: body.endsLabel,
        startsAt: body.startsAt,
        endsAt: body.endsAt,
        tiers: body.tiers as any,
      },
      select: { id: true, name: true, number: true, endsLabel: true, startsAt: true, endsAt: true, tiers: true },
    });
    await audit(prisma, {
      actorId: req.userId!,
      action: "season.create",
      targetType: "season",
      targetId: created.id,
      after: {
        name: created.name,
        number: created.number,
        endsLabel: created.endsLabel,
        startsAt: created.startsAt,
        endsAt: created.endsAt,
        tierCount: tierCount(created.tiers),
      },
      reason: body.reason,
    });
    return ok({ id: created.id });
  });

  // ── Seasons: edit (ECONOMY) ────────────────────────────────────────────────
  app.patch<{ Params: { id: string } }>("/admin/liveops/seasons/:id", { preHandler: requireAdmin("ECONOMY") }, async (req) => {
    const body = z
      .object({
        name: z.string().trim().min(1).max(120).optional(),
        number: z.number().int().min(1).optional(),
        endsLabel: z.string().trim().max(120).optional(),
        startsAt: z.coerce.date().optional(),
        endsAt: z.coerce.date().optional(),
        tiers: tiersSchema.optional(),
        reason: reasonField,
      })
      .parse(req.body);
    const before = await prisma.season.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, number: true, endsLabel: true, startsAt: true, endsAt: true, tiers: true },
    });
    if (!before) throw err.notFound("NO_SEASON", "Season not found");
    const startsAt = body.startsAt ?? before.startsAt;
    const endsAt = body.endsAt ?? before.endsAt;
    if (endsAt <= startsAt) throw err.badRequest("BAD_DATES", "endsAt must be after startsAt");
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.number !== undefined) data.number = body.number;
    if (body.endsLabel !== undefined) data.endsLabel = body.endsLabel;
    if (body.startsAt !== undefined) data.startsAt = body.startsAt;
    if (body.endsAt !== undefined) data.endsAt = body.endsAt;
    if (body.tiers !== undefined) data.tiers = body.tiers;
    const after = await prisma.season.update({
      where: { id: req.params.id },
      data: data as any,
      select: { id: true, name: true, number: true, endsLabel: true, startsAt: true, endsAt: true, tiers: true },
    });
    await audit(prisma, {
      actorId: req.userId!,
      action: "season.update",
      targetType: "season",
      targetId: after.id,
      before: {
        name: before.name,
        number: before.number,
        endsLabel: before.endsLabel,
        startsAt: before.startsAt,
        endsAt: before.endsAt,
        tierCount: tierCount(before.tiers),
      },
      after: {
        name: after.name,
        number: after.number,
        endsLabel: after.endsLabel,
        startsAt: after.startsAt,
        endsAt: after.endsAt,
        tierCount: tierCount(after.tiers),
      },
      reason: body.reason,
    });
    return ok({ id: after.id });
  });

  // ── Quests: list (SUPPORT) ─────────────────────────────────────────────────
  app.get("/admin/liveops/quests", { preHandler: requireAdmin("SUPPORT") }, async () => {
    const quests = await prisma.quest.findMany({
      orderBy: [{ scope: "asc" }, { rewardGold: "asc" }],
      select: {
        id: true, scope: true, title: true, description: true, goal: true, rewardGold: true, active: true,
        _count: { select: { progress: true } },
      },
    });
    return ok({
      items: quests.map((q) => ({
        id: q.id,
        scope: q.scope,
        title: q.title,
        description: q.description,
        goal: q.goal,
        rewardGold: q.rewardGold,
        active: q.active,
        activeProgress: q._count.progress,
      })),
    });
  });

  // ── Quests: create (ECONOMY) ───────────────────────────────────────────────
  app.post("/admin/liveops/quests", { preHandler: requireAdmin("ECONOMY") }, async (req) => {
    const body = z
      .object({
        id: z.string().trim().min(1).max(120),
        scope: z.string().trim().min(1).max(60),
        title: z.string().trim().min(1).max(160),
        description: z.string().trim().max(500).optional(),
        goal: z.number().int().min(1),
        rewardGold: z.number().int().min(0),
        reason: reasonField,
      })
      .parse(req.body);
    const clash = await prisma.quest.findUnique({ where: { id: body.id }, select: { id: true } });
    if (clash) throw err.conflict("QUEST_EXISTS", "A quest with that id already exists");
    const created = await prisma.quest.create({
      data: {
        id: body.id,
        scope: body.scope,
        title: body.title,
        description: body.description,
        goal: body.goal,
        rewardGold: body.rewardGold,
      },
      select: { id: true, scope: true, title: true, goal: true, rewardGold: true, active: true },
    });
    await audit(prisma, {
      actorId: req.userId!,
      action: "quest.create",
      targetType: "quest",
      targetId: created.id,
      after: created,
      reason: body.reason,
    });
    return ok({ id: created.id });
  });

  // ── Quests: edit (ECONOMY) ─────────────────────────────────────────────────
  app.patch<{ Params: { id: string } }>("/admin/liveops/quests/:id", { preHandler: requireAdmin("ECONOMY") }, async (req) => {
    const body = z
      .object({
        title: z.string().trim().min(1).max(160).optional(),
        description: z.string().trim().max(500).nullable().optional(),
        goal: z.number().int().min(1).optional(),
        rewardGold: z.number().int().min(0).optional(),
        active: z.boolean().optional(),
        reason: reasonField,
      })
      .parse(req.body);
    const before = await prisma.quest.findUnique({
      where: { id: req.params.id },
      select: { id: true, title: true, description: true, goal: true, rewardGold: true, active: true },
    });
    if (!before) throw err.notFound("NO_QUEST", "Quest not found");
    const data: Record<string, unknown> = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.goal !== undefined) data.goal = body.goal;
    if (body.rewardGold !== undefined) data.rewardGold = body.rewardGold;
    if (body.active !== undefined) data.active = body.active;
    const after = await prisma.quest.update({
      where: { id: req.params.id },
      data: data as any,
      select: { id: true, title: true, description: true, goal: true, rewardGold: true, active: true },
    });
    await audit(prisma, {
      actorId: req.userId!,
      action: "quest.update",
      targetType: "quest",
      targetId: after.id,
      before,
      after,
      reason: body.reason,
    });
    return ok({ id: after.id });
  });

  // ── Quests: toggle active (ECONOMY) — convenience over the edit route ──────
  app.post<{ Params: { id: string } }>("/admin/liveops/quests/:id/toggle", { preHandler: requireAdmin("ECONOMY") }, async (req) => {
    const { reason } = z.object({ reason: reasonField }).parse(req.body);
    const before = await prisma.quest.findUnique({ where: { id: req.params.id }, select: { id: true, active: true } });
    if (!before) throw err.notFound("NO_QUEST", "Quest not found");
    const after = await prisma.quest.update({
      where: { id: req.params.id },
      data: { active: !before.active },
      select: { id: true, active: true },
    });
    await audit(prisma, {
      actorId: req.userId!,
      action: "quest.toggle",
      targetType: "quest",
      targetId: after.id,
      before: { active: before.active },
      after: { active: after.active },
      reason,
    });
    return ok({ id: after.id, active: after.active });
  });
}
