import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { requireAdmin } from "../auth/guards.js";
import { audit } from "../lib/audit.js";

/**
 * Live ops — Scheduled Events — /api/admin/events/*. Authors the LiveEvent
 * model (double-gold windows, tournaments, fiestas, sales, etc. shown on the
 * Live-ops "Scheduled Events" panel). Every mutation is role-gated by
 * requireAdmin() and writes an AuditLog row via audit() with before/after/reason.
 *
 * Roles (guards.ts hierarchy): SUPPORT < MODERATOR < ECONOMY < SUPERADMIN.
 * Reads are kept at ECONOMY to match the nav min-role for Live ops.
 */

const reasonField = z.string().trim().min(1, "reason required").max(500);

const eventSelect = {
  id: true,
  name: true,
  type: true,
  status: true,
  scope: true,
  reward: true,
  startsLabel: true,
  endsLabel: true,
  color: true,
  createdById: true,
  createdByName: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function adminEventsRoutes(app: FastifyInstance) {
  // ── list (ECONOMY) ──────────────────────────────────────────────────────
  app.get("/admin/events", { preHandler: requireAdmin("ECONOMY") }, async () => {
    const items = await prisma.liveEvent.findMany({
      orderBy: { createdAt: "desc" },
      select: eventSelect,
    });
    return ok({ items });
  });

  // ── create (ECONOMY) ────────────────────────────────────────────────────
  app.post("/admin/events", { preHandler: requireAdmin("ECONOMY") }, async (req) => {
    const body = z
      .object({
        name: z.string().trim().min(1).max(160),
        type: z.string().trim().min(1).max(60),
        status: z.string().trim().min(1).max(20).default("scheduled"),
        scope: z.string().trim().min(1).max(60),
        reward: z.string().trim().min(1).max(500),
        startsLabel: z.string().trim().max(60).optional(),
        endsLabel: z.string().trim().max(60).optional(),
        color: z.string().trim().max(20).optional(),
        reason: reasonField,
      })
      .parse(req.body);

    const actor = await prisma.user.findUnique({ where: { id: req.userId! }, select: { username: true, tag: true } });
    const createdByName = `${actor!.username}${actor!.tag}`;

    const created = await prisma.liveEvent.create({
      data: {
        name: body.name,
        type: body.type,
        status: body.status,
        scope: body.scope,
        reward: body.reward,
        startsLabel: body.startsLabel,
        endsLabel: body.endsLabel,
        color: body.color,
        createdById: req.userId!,
        createdByName,
      },
      select: eventSelect,
    });

    await audit(prisma, {
      actorId: req.userId!,
      action: "event.create",
      targetType: "liveEvent",
      targetId: created.id,
      after: created,
      reason: body.reason,
    });

    return ok({ id: created.id });
  });

  // ── update (ECONOMY) ────────────────────────────────────────────────────
  app.patch<{ Params: { id: string } }>("/admin/events/:id", { preHandler: requireAdmin("ECONOMY") }, async (req) => {
    const body = z
      .object({
        name: z.string().trim().min(1).max(160).optional(),
        type: z.string().trim().min(1).max(60).optional(),
        status: z.string().trim().min(1).max(20).optional(),
        scope: z.string().trim().min(1).max(60).optional(),
        reward: z.string().trim().min(1).max(500).optional(),
        startsLabel: z.string().trim().max(60).nullable().optional(),
        endsLabel: z.string().trim().max(60).nullable().optional(),
        color: z.string().trim().max(20).nullable().optional(),
        reason: reasonField,
      })
      .parse(req.body);

    const before = await prisma.liveEvent.findUnique({ where: { id: req.params.id }, select: eventSelect });
    if (!before) throw err.notFound("NO_EVENT", "Event not found");

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.type !== undefined) data.type = body.type;
    if (body.status !== undefined) data.status = body.status;
    if (body.scope !== undefined) data.scope = body.scope;
    if (body.reward !== undefined) data.reward = body.reward;
    if (body.startsLabel !== undefined) data.startsLabel = body.startsLabel;
    if (body.endsLabel !== undefined) data.endsLabel = body.endsLabel;
    if (body.color !== undefined) data.color = body.color;

    const after = await prisma.liveEvent.update({
      where: { id: req.params.id },
      data: data as any,
      select: eventSelect,
    });

    await audit(prisma, {
      actorId: req.userId!,
      action: "event.update",
      targetType: "liveEvent",
      targetId: after.id,
      before,
      after,
      reason: body.reason,
    });

    return ok({ id: after.id });
  });

  // ── cancel (ECONOMY) — sets status "ended" ──────────────────────────────
  app.post<{ Params: { id: string } }>("/admin/events/:id/cancel", { preHandler: requireAdmin("ECONOMY") }, async (req) => {
    const { reason } = z.object({ reason: reasonField }).parse(req.body);

    const before = await prisma.liveEvent.findUnique({ where: { id: req.params.id }, select: { id: true, status: true } });
    if (!before) throw err.notFound("NO_EVENT", "Event not found");

    const after = await prisma.liveEvent.update({
      where: { id: req.params.id },
      data: { status: "ended" },
      select: { id: true, status: true },
    });

    await audit(prisma, {
      actorId: req.userId!,
      action: "event.cancel",
      targetType: "liveEvent",
      targetId: after.id,
      before: { status: before.status },
      after: { status: after.status },
      reason,
    });

    return ok({ id: after.id, status: after.status });
  });
}
