import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { requireAdmin } from "../auth/guards.js";
import { audit } from "../lib/audit.js";
import { muteUser, banUser } from "../lib/sanctions.js";
import { sendEmail, banEmailHtml } from "../lib/email.js";

const listQ = z.object({
  status: z.enum(["OPEN", "RESOLVED", "DISMISSED"]).default("OPEN"),
  reason: z.enum(["HARASSMENT", "HATE_SPEECH", "CHEATING", "INAPPROPRIATE", "SPAM", "OTHER"]).optional(),
  accusedId: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const reasonBody = z.object({ reason: z.string().trim().min(1).max(500) });
const sanctionBody = z.object({ durationHours: z.number().int().min(0).max(24 * 365).optional(), reason: z.string().trim().min(1).max(500) });

export async function adminReportsRoutes(app: FastifyInstance) {
  app.get("/admin/reports", { preHandler: requireAdmin("MODERATOR") }, async (req) => {
    const q = listQ.parse(req.query);
    const where: Prisma.ReportWhereInput = { status: q.status, ...(q.reason ? { reason: q.reason } : {}), ...(q.accusedId ? { accusedId: q.accusedId } : {}) };
    const rows = await prisma.report.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: {
        reporter: { select: { id: true, username: true, tag: true, avatarUrl: true } },
        accused: { select: { id: true, username: true, tag: true, avatarUrl: true } },
      },
    });
    const hasMore = rows.length > q.limit;
    const items = (hasMore ? rows.slice(0, q.limit) : rows).map((r) => ({
      id: r.id, reason: r.reason, note: r.note, context: r.context, channelId: r.channelId, messageId: r.messageId,
      excerpt: r.excerpt, profileSnapshot: r.profileSnapshot, status: r.status, createdAt: r.createdAt,
      accusedGone: r.accusedId === null,
      reporter: r.reporter ?? { username: r.reporterName, tag: "", avatarUrl: null, id: null },
      accused: r.accused ?? { username: r.accusedName, tag: "", avatarUrl: null, id: null },
    }));
    return ok({ items, nextCursor: hasMore ? items[items.length - 1]!.id : null });
  });

  // Player-facing summaries for the reporter's outcome notification. Deliberately
  // vague — no accused name, no specific sanction/duration, no moderator identity —
  // so the notification can never leak moderation-sensitive detail.
  const REPORTER_SUMMARY: Record<"dismissed" | "muted" | "banned", string> = {
    dismissed: "Thanks for your report — after review, no action was needed.",
    muted: "Thanks for your report — our team has reviewed it and taken appropriate action.",
    banned: "Thanks for your report — our team has reviewed it and taken appropriate action.",
  };

  // Shared claim: atomically flip OPEN→target and set resolution fields. Returns
  // the report's reporterId (for the outcome notification below) if we won the
  // claim, or undefined if it was already resolved by someone else.
  async function claim(tx: Prisma.TransactionClient, id: string, targetStatus: "RESOLVED" | "DISMISSED", resolution: string, actorId: string) {
    const res = await tx.report.updateMany({ where: { id, status: "OPEN" }, data: { status: targetStatus, resolvedById: actorId, resolvedAt: new Date(), resolution } });
    if (res.count === 0) return undefined;
    const rep = await tx.report.findUnique({ where: { id }, select: { reporterId: true } });
    return rep ?? { reporterId: null };
  }

  // Notify the reporter of the outcome, INSIDE the same transaction as the
  // claim — guarded: reporterId is null if the reporter's account was later
  // deleted, in which case there's nobody to notify.
  async function notifyReporter(tx: Prisma.TransactionClient, reporterId: string | null, resolution: "dismissed" | "muted" | "banned") {
    if (!reporterId) return;
    await tx.notification.create({
      data: { userId: reporterId, type: "report_resolved", title: "Your report was reviewed", body: REPORTER_SUMMARY[resolution] },
    });
  }

  app.post<{ Params: { id: string } }>("/admin/reports/:id/dismiss", { preHandler: requireAdmin("MODERATOR") }, async (req) => {
    const { reason } = reasonBody.parse(req.body);
    await prisma.$transaction(async (tx) => {
      const claimed = await claim(tx, req.params.id, "DISMISSED", "dismissed", req.userId!);
      if (!claimed) throw err.conflict("REPORT_RESOLVED", "Report already resolved");
      await audit(tx, { actorId: req.userId!, action: "report.dismiss", targetType: "report", targetId: req.params.id, before: { status: "OPEN" }, after: { status: "DISMISSED", resolution: "dismissed" }, reason });
      await notifyReporter(tx, claimed.reporterId, "dismissed");
    });
    return ok({ status: "DISMISSED" });
  });

  for (const kind of ["mute", "ban"] as const) {
    app.post<{ Params: { id: string } }>(`/admin/reports/:id/${kind}`, { preHandler: requireAdmin("MODERATOR") }, async (req) => {
      const { durationHours, reason } = sanctionBody.parse(req.body);
      const rep = await prisma.report.findUnique({ where: { id: req.params.id }, select: { accusedId: true } });
      if (!rep) throw err.notFound("NO_REPORT", "Report not found");
      if (rep.accusedId === null) throw err.conflict("ACCUSED_GONE", "The reported account no longer exists");
      // A moderator resolving a report can't be turned into a back door around the
      // "only a superadmin can sanction another admin" rule the direct routes enforce.
      if (rep.accusedId === req.userId) throw err.badRequest(kind === "mute" ? "SELF_MUTE" : "SELF_BAN", `You can't ${kind} yourself`);
      const accused = await prisma.user.findUnique({ where: { id: rep.accusedId }, select: { adminRole: true } });
      if (accused?.adminRole && req.adminRole !== "SUPERADMIN")
        throw err.forbidden(kind === "mute" ? "MUTE_ADMIN" : "BAN_ADMIN", `Only a superadmin can ${kind} another admin`);
      const resolution = kind === "mute" ? "muted" : "banned";
      const email = await prisma.$transaction(async (tx) => {
        const claimed = await claim(tx, req.params.id, "RESOLVED", resolution, req.userId!);
        if (!claimed) throw err.conflict("REPORT_RESOLVED", "Report already resolved");
        const sanction = kind === "mute"
          ? await muteUser(tx, { targetId: rep.accusedId!, actorId: req.userId!, durationHours, reason })
          : await banUser(tx, { targetId: rep.accusedId!, actorId: req.userId!, durationHours, reason });
        await audit(tx, { actorId: req.userId!, action: `report.resolve.${kind}`, targetType: "report", targetId: req.params.id, before: { status: "OPEN" }, after: { status: "RESOLVED", resolution }, reason });
        await notifyReporter(tx, claimed.reporterId, resolution);
        return sanction.email;
      });
      if (email) void sendEmail(email.email, "Your FilipinoDama Royal account has been suspended", banEmailHtml({ username: email.username, reason, until: email.until })).catch(() => {});
      return ok({ status: "RESOLVED" });
    });
  }
}
