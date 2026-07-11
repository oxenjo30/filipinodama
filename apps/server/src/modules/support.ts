import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { requireAuth } from "../auth/guards.js";

const bodySchema = z.object({
  category: z.enum(["General", "Account", "Bug Report", "Billing"]),
  subject: z.string().trim().min(1).max(160),
  message: z.string().trim().min(10).max(4000),
});

const RATE = 5;

function cuid() { return `tk_${randomUUID()}`; }

export async function supportRoutes(app: FastifyInstance) {
  app.post("/support/tickets", { preHandler: requireAuth }, async (req) => {
    if (req.isGuest) throw err.forbidden("GUEST_CANNOT_FILE", "Guests can't file support tickets");
    const b = bodySchema.parse(req.body);
    const userId = req.userId!;

    const filer = await prisma.user.findUnique({ where: { id: userId }, select: { username: true, tag: true, email: true } });
    const userName = `${filer!.username}${filer!.tag}`;
    const userEmail = filer!.email ?? null;

    // Atomic rate-limited insert: same advisory-lock pattern as reports.ts — a bare
    // INSERT...SELECT...WHERE count<N is NOT atomic under concurrency at READ COMMITTED
    // (concurrent requests from the same filer all read the same pre-insert count and
    // all pass the guard). Taking a transaction-scoped advisory lock keyed on userId
    // serializes same-user requests so each one's count reflects all prior commits.
    const id = cuid();
    const inserted: number = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
      const n = await tx.$executeRaw`
        INSERT INTO "Ticket" ("id","userId","userName","userEmail","category","subject","status","createdAt","updatedAt")
        SELECT ${id}, ${userId}, ${userName}, ${userEmail}, ${b.category}, ${b.subject}, 'OPEN'::"TicketStatus", now(), now()
        WHERE (SELECT count(*) FROM "Ticket" WHERE "userId" = ${userId} AND "createdAt" >= now() - interval '1 hour') < ${RATE}
      `;
      if (n === 1) {
        await tx.ticketMessage.create({ data: { ticketId: id, authorId: userId, authorName: userName, isStaff: false, body: b.message } });
      }
      return n;
    });
    if (inserted === 0) throw err.tooMany("RATE_LIMITED", "You're filing tickets too fast — try again later");

    req.log.info({ evt: "ticket.create", userId, ticketId: id, category: b.category });
    return ok({ id });
  });

  // GET /support/tickets — the authed player's own tickets (read-only; staff actions stay admin-only)
  app.get("/support/tickets", { preHandler: requireAuth }, async (req) => {
    if (req.isGuest) throw err.forbidden("GUEST_CANNOT_FILE", "Guests can't file support tickets");
    const userId = req.userId!;

    const rows = await prisma.ticket.findMany({
      where: { userId },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      include: { _count: { select: { messages: true } } },
    });

    return ok({
      items: rows.map((t) => ({
        id: t.id,
        subject: t.subject,
        category: t.category,
        status: t.status,
        priority: t.priority,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        msgCount: t._count.messages,
      })),
    });
  });

  // GET /support/tickets/:id — ticket + thread, ownership-guarded. Mismatched owner → 404
  // (not 403) so we don't leak whether a given ticket id exists, matching notifications.ts.
  app.get<{ Params: { id: string } }>("/support/tickets/:id", { preHandler: requireAuth }, async (req) => {
    const userId = req.userId!;
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!ticket || ticket.userId !== userId) throw err.notFound("NO_TICKET", "Ticket not found");

    return ok({
      ticket: {
        id: ticket.id,
        subject: ticket.subject,
        category: ticket.category,
        status: ticket.status,
        priority: ticket.priority,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
      },
      thread: ticket.messages.map((m) => ({
        id: m.id,
        isStaff: m.isStaff,
        authorName: m.authorName,
        body: m.body,
        createdAt: m.createdAt,
      })),
    });
  });
}
