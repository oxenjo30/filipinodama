import type { FastifyInstance } from "fastify";
import type { AdminRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { requireAdmin } from "../auth/guards.js";
import { err, ok } from "../lib/errors.js";

const limitQuery = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) });
const rank: Record<AdminRole, number> = { SUPPORT: 1, MODERATOR: 2, ECONOMY: 3, SUPERADMIN: 4 };

type TimelineItem = {
  id: string;
  kind: "match" | "purchase" | "ledger" | "ticket" | "report" | "audit";
  title: string;
  detail: string;
  actor: string | null;
  createdAt: Date;
  href?: string;
};

/** Read-only data for the admin command-center additions. Every record comes from
 * the existing operational tables and is filtered again at the server boundary. */
export async function adminWorkspaceRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/admin/users/:id/timeline", { preHandler: requireAdmin("SUPPORT") }, async (req) => {
    const { limit } = limitQuery.parse(req.query);
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, username: true, tag: true } });
    if (!user) throw err.notFound("NO_USER", "Player not found");

    const canModerate = rank[req.adminRole!] >= rank.MODERATOR;
    const canEconomy = rank[req.adminRole!] >= rank.ECONOMY;
    const canAudit = req.adminRole === "SUPERADMIN";
    const [matches, orders, payments, ledger, tickets, reports, audits] = await Promise.all([
      prisma.match.findMany({
        where: { OR: [{ redId: user.id }, { blueId: user.id }] }, orderBy: { startedAt: "desc" }, take: limit,
        select: { id: true, mode: true, winner: true, startedAt: true, redId: true, red: { select: { username: true } }, blue: { select: { username: true } } },
      }),
      canEconomy ? prisma.order.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: limit, select: { id: true, total: true, currency: true, createdAt: true } }) : Promise.resolve([]),
      canEconomy ? prisma.payment.findMany({ where: { userId: user.id, status: "settled" }, orderBy: { settledAt: "desc" }, take: limit, select: { id: true, diamonds: true, amountCents: true, currencyCode: true, createdAt: true, settledAt: true } }) : Promise.resolve([]),
      canEconomy ? prisma.ledgerEntry.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: limit, select: { id: true, currency: true, amount: true, reason: true, createdAt: true } }) : Promise.resolve([]),
      prisma.ticket.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, take: limit, select: { id: true, subject: true, status: true, updatedAt: true } }),
      canModerate ? prisma.report.findMany({ where: { accusedId: user.id }, orderBy: { createdAt: "desc" }, take: limit, select: { id: true, reason: true, status: true, createdAt: true } }) : Promise.resolve([]),
      canAudit ? prisma.auditLog.findMany({ where: { targetType: "user", targetId: user.id }, orderBy: { createdAt: "desc" }, take: limit, select: { id: true, action: true, actorId: true, reason: true, createdAt: true } }) : Promise.resolve([]),
    ]);

    const items: TimelineItem[] = [
      ...matches.map((m): TimelineItem => {
        const isRed = m.redId === user.id;
        const opponent = (isRed ? m.blue?.username : m.red?.username) ?? "Unknown opponent";
        const side = isRed ? "red" : "blue";
        const result = m.winner === "draw" ? "Draw" : m.winner === side ? "Win" : m.winner ? "Loss" : "In progress";
        return { id: `match:${m.id}`, kind: "match", title: `${m.mode} match`, detail: `${result} vs ${opponent}`, actor: "Game server", createdAt: m.startedAt };
      }),
      ...orders.map((o): TimelineItem => ({ id: `order:${o.id}`, kind: "purchase", title: "Store purchase", detail: `${o.total.toLocaleString()} ${o.currency}`, actor: user.username, createdAt: o.createdAt })),
      ...payments.map((p): TimelineItem => ({ id: `payment:${p.id}`, kind: "purchase", title: "Diamond top-up", detail: `${p.diamonds.toLocaleString()} diamonds · ${p.currencyCode.toUpperCase()} ${(p.amountCents / 100).toFixed(2)}`, actor: user.username, createdAt: p.settledAt ?? p.createdAt })),
      ...ledger.map((l): TimelineItem => ({ id: `ledger:${l.id}`, kind: "ledger", title: "Balance change", detail: `${l.amount > 0 ? "+" : ""}${l.amount.toLocaleString()} ${l.currency} · ${l.reason}`, actor: null, createdAt: l.createdAt })),
      ...tickets.map((t): TimelineItem => ({ id: `ticket:${t.id}`, kind: "ticket", title: `Support ticket · ${t.status.toLowerCase()}`, detail: t.subject, actor: user.username, createdAt: t.updatedAt, href: `/support?open=${encodeURIComponent(t.id)}` })),
      ...reports.map((r): TimelineItem => ({ id: `report:${r.id}`, kind: "report", title: `Moderation report · ${r.status.toLowerCase()}`, detail: r.reason.replaceAll("_", " ").toLowerCase(), actor: null, createdAt: r.createdAt, href: `/moderation?open=${encodeURIComponent(r.id)}&status=${r.status}` })),
      ...audits.map((a): TimelineItem => ({ id: `audit:${a.id}`, kind: "audit", title: a.action, detail: a.reason ?? "Administrative action", actor: a.actorId, createdAt: a.createdAt, href: `/audit?actor=${encodeURIComponent(a.actorId)}` })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);

    return ok({ player: user, items, roleFiltered: { economy: canEconomy, reports: canModerate, audit: canAudit } });
  });

  app.get("/admin/notifications", { preHandler: requireAdmin("SUPPORT") }, async (req) => {
    const { limit } = limitQuery.parse(req.query);
    const canModerate = rank[req.adminRole!] >= rank.MODERATOR;
    const [tickets, reports] = await Promise.all([
      prisma.ticket.findMany({ where: { status: "OPEN" }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: limit, select: { id: true, subject: true, priority: true, updatedAt: true } }),
      canModerate ? prisma.report.findMany({ where: { status: "OPEN" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit, select: { id: true, reason: true, accusedName: true, createdAt: true } }) : Promise.resolve([]),
    ]);
    const items = [
      ...tickets.map((t) => ({ id: `ticket:${t.id}`, kind: "ticket" as const, title: t.subject, detail: `${t.priority.toLowerCase()} priority support ticket`, createdAt: t.updatedAt, href: `/support?open=${encodeURIComponent(t.id)}` })),
      ...reports.map((r) => ({ id: `report:${r.id}`, kind: "report" as const, title: `${r.reason.replaceAll("_", " ").toLowerCase()} report`, detail: `Reported player: ${r.accusedName}`, createdAt: r.createdAt, href: `/moderation?open=${encodeURIComponent(r.id)}&status=OPEN` })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
    return ok({ items });
  });
}
