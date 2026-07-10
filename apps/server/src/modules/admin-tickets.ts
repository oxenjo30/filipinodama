import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { requireAdmin } from "../auth/guards.js";
import { audit } from "../lib/audit.js";

/**
 * Support tickets admin queue — /api/admin/tickets* (SUPPORT-gated). Mirrors the
 * Reports-queue architecture: cursor-paginated list, thread detail, a transactional
 * staff reply that also notifies the player, and an atomic OPEN-claim resolve.
 * All mutations are audited (ADMIN_DASHBOARD.md §1).
 */

const listQ = z.object({
  status: z.enum(["OPEN", "RESOLVED"]).default("OPEN"),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const replyBody = z.object({ body: z.string().trim().min(1).max(4000) });
const resolveBody = z.object({ reason: z.string().trim().min(1).max(500) });
const priorityBody = z.object({ priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]) });
const reopenBody = z.object({ reason: z.string().trim().min(1).max(500).optional() });

export async function adminTicketsRoutes(app: FastifyInstance) {
  app.get("/admin/tickets", { preHandler: requireAdmin("SUPPORT") }, async (req) => {
    const q = listQ.parse(req.query);
    const where: Prisma.TicketWhereInput = { status: q.status };
    const rows = await prisma.ticket.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: {
        user: { select: { id: true, username: true, tag: true, avatarUrl: true } },
        _count: { select: { messages: true } },
      },
    });
    const hasMore = rows.length > q.limit;
    const items = (hasMore ? rows.slice(0, q.limit) : rows).map((t) => ({
      id: t.id,
      category: t.category,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      msgCount: t._count.messages,
      user: t.user ?? { username: t.userName, tag: "", avatarUrl: null, id: null },
      userName: t.userName,
      userEmail: t.userEmail,
      userGone: t.userId === null,
    }));
    return ok({ items, nextCursor: hasMore ? items[items.length - 1]!.id : null });
  });

  app.get<{ Params: { id: string } }>("/admin/tickets/:id", { preHandler: requireAdmin("SUPPORT") }, async (req) => {
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { id: true, username: true, tag: true, avatarUrl: true } },
        messages: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { id: true, username: true, tag: true, avatarUrl: true } } },
        },
      },
    });
    if (!ticket) throw err.notFound("NO_TICKET", "Ticket not found");
    return ok({
      ticket: {
        id: ticket.id,
        category: ticket.category,
        subject: ticket.subject,
        status: ticket.status,
        priority: ticket.priority,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        userGone: ticket.userId === null,
        user: ticket.user ?? { username: ticket.userName, tag: "", avatarUrl: null, id: null },
        userName: ticket.userName,
        userEmail: ticket.userEmail,
        tag: ticket.user?.tag ?? "",
        resolvedAt: ticket.resolvedAt,
        canResolve: ticket.status === "OPEN",
        canReopen: ticket.status === "RESOLVED",
      },
      thread: ticket.messages.map((m) => ({
        id: m.id,
        isStaff: m.isStaff,
        authorName: m.authorName,
        author: m.author,
        body: m.body,
        createdAt: m.createdAt,
      })),
    });
  });

  app.post<{ Params: { id: string } }>("/admin/tickets/:id/reply", { preHandler: requireAdmin("SUPPORT") }, async (req) => {
    const { body } = replyBody.parse(req.body);
    const actorId = req.userId!;
    const result = await prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findUnique({ where: { id: req.params.id }, select: { id: true, status: true, userId: true } });
      if (!ticket) throw err.notFound("NO_TICKET", "Ticket not found");
      if (ticket.status !== "OPEN") throw err.conflict("TICKET_RESOLVED", "Reopen isn't supported; this ticket is resolved");

      const staff = await tx.user.findUnique({ where: { id: actorId }, select: { username: true, tag: true } });
      const staffName = `${staff!.username}${staff!.tag}`;

      const msg = await tx.ticketMessage.create({
        data: { ticketId: ticket.id, authorId: actorId, authorName: staffName, isStaff: true, body },
      });
      await tx.ticket.update({ where: { id: ticket.id }, data: { updatedAt: new Date() } });

      const notified = ticket.userId !== null;
      if (notified) {
        await tx.notification.create({
          data: {
            userId: ticket.userId!,
            type: "support_reply",
            title: "Support replied to your ticket",
            body: body.slice(0, 140),
            data: { ticketId: ticket.id },
          },
        });
      }

      await audit(tx, {
        actorId,
        action: "ticket.reply",
        targetType: "ticket",
        targetId: ticket.id,
        after: { messageId: msg.id, notified },
        reason: body.slice(0, 120),
      });

      return { notified };
    });

    req.log.info({ evt: "ticket.reply", ticketId: req.params.id, staffId: actorId, notified: result.notified });
    return ok({ id: req.params.id });
  });

  app.post<{ Params: { id: string } }>("/admin/tickets/:id/resolve", { preHandler: requireAdmin("SUPPORT") }, async (req) => {
    const { reason } = resolveBody.parse(req.body);
    const actorId = req.userId!;
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.ticket.updateMany({
        where: { id: req.params.id, status: "OPEN" },
        data: { status: "RESOLVED", resolvedById: actorId, resolvedAt: new Date(), updatedAt: new Date() },
      });
      if (claimed.count === 0) throw err.conflict("TICKET_RESOLVED", "Ticket already resolved");

      await audit(tx, {
        actorId,
        action: "ticket.resolve",
        targetType: "ticket",
        targetId: req.params.id,
        before: { status: "OPEN" },
        after: { status: "RESOLVED" },
        reason,
      });

      const ticket = await tx.ticket.findUnique({ where: { id: req.params.id }, select: { userId: true, subject: true } });
      if (ticket?.userId) {
        await tx.notification.create({
          data: {
            userId: ticket.userId,
            type: "support_resolved",
            title: "Your support ticket was resolved",
            body: ticket.subject,
            data: { ticketId: req.params.id },
          },
        });
      }
    });
    return ok({ status: "RESOLVED" });
  });

  app.patch<{ Params: { id: string } }>("/admin/tickets/:id/priority", { preHandler: requireAdmin("SUPPORT") }, async (req) => {
    const { priority } = priorityBody.parse(req.body);
    const actorId = req.userId!;
    const result = await prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findUnique({ where: { id: req.params.id }, select: { id: true, priority: true } });
      if (!ticket) throw err.notFound("NO_TICKET", "Ticket not found");

      await tx.ticket.update({ where: { id: ticket.id }, data: { priority, updatedAt: new Date() } });

      await audit(tx, {
        actorId,
        action: "ticket.priority",
        targetType: "ticket",
        targetId: ticket.id,
        before: { priority: ticket.priority },
        after: { priority },
      });

      return { id: ticket.id };
    });
    return ok({ id: result.id, priority });
  });

  app.post<{ Params: { id: string } }>("/admin/tickets/:id/reopen", { preHandler: requireAdmin("SUPPORT") }, async (req) => {
    const { reason } = reopenBody.parse(req.body ?? {});
    const actorId = req.userId!;
    await prisma.$transaction(async (tx) => {
      const reopened = await tx.ticket.updateMany({
        where: { id: req.params.id, status: "RESOLVED" },
        data: { status: "OPEN", resolvedById: null, resolvedAt: null, updatedAt: new Date() },
      });
      if (reopened.count === 0) throw err.conflict("TICKET_NOT_RESOLVED", "Ticket is not resolved");

      await audit(tx, {
        actorId,
        action: "ticket.reopen",
        targetType: "ticket",
        targetId: req.params.id,
        before: { status: "RESOLVED" },
        after: { status: "OPEN" },
        reason,
      });
    });
    return ok({ status: "OPEN" });
  });
}
