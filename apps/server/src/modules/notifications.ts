import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { requireAuth } from "../auth/guards.js";

const listQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  // NB: z.coerce.boolean() is wrong for query strings — it Boolean()-coerces, so
  // "false" → true. Match the literal string instead: only "true"/"1" mean true.
  unread: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => v === "true" || v === "1"),
});

const resolveBodySchema = z.object({
  status: z.enum(["accepted", "declined"]),
});

/** Bucket a timestamp into a coarse date group for UI section headers. */
function groupFor(date: Date, now: Date): "today" | "yesterday" | "earlier" {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayMs = 86_400_000;
  const diff = startOfDay(now) - startOfDay(date);
  if (diff <= 0) return "today";
  if (diff === dayMs) return "yesterday";
  return "earlier";
}

export async function notificationRoutes(app: FastifyInstance) {
  // GET /api/notifications — grouped + paginated (cursor over createdAt/id)
  app.get<{ Querystring: Record<string, string> }>(
    "/notifications",
    { preHandler: requireAuth },
    async (req) => {
      const me = req.userId!;
      const { cursor, limit, unread } = listQuerySchema.parse(req.query);

      const rows = await prisma.notification.findMany({
        // Dismissed rows are hidden everywhere.
        where: { userId: me, dismissedAt: null, ...(unread ? { readAt: null } : {}) },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? page[page.length - 1]!.id : null;

      const now = new Date();
      const groups: Record<"today" | "yesterday" | "earlier", typeof page> = {
        today: [],
        yesterday: [],
        earlier: [],
      };
      for (const n of page) groups[groupFor(n.createdAt, now)].push(n);

      const shape = (n: (typeof page)[number]) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        data: n.data,
        readAt: n.readAt,
        createdAt: n.createdAt,
      });

      const unreadCount = await prisma.notification.count({
        where: { userId: me, readAt: null, dismissedAt: null },
      });

      return ok({
        notifications: page.map(shape),
        groups: {
          today: groups.today.map(shape),
          yesterday: groups.yesterday.map(shape),
          earlier: groups.earlier.map(shape),
        },
        unreadCount,
        nextCursor,
        hasMore,
      });
    },
  );

  // POST /api/notifications/read-all
  app.post("/notifications/read-all", { preHandler: requireAuth }, async (req) => {
    const me = req.userId!;
    const result = await prisma.notification.updateMany({
      where: { userId: me, readAt: null, dismissedAt: null },
      data: { readAt: new Date() },
    });
    return ok({ updated: result.count });
  });

  // POST /api/notifications/:id/dismiss — soft-hide a row (sets dismissedAt=now).
  // Dismissed rows are excluded from GET /notifications and the unread count.
  app.post<{ Params: { id: string } }>(
    "/notifications/:id/dismiss",
    { preHandler: requireAuth },
    async (req) => {
      const me = req.userId!;
      const notif = await prisma.notification.findUnique({ where: { id: req.params.id } });
      if (!notif || notif.userId !== me) throw err.notFound("NOTIF_NOT_FOUND", "Notification not found");

      if (!notif.dismissedAt) {
        await prisma.notification.update({
          where: { id: notif.id },
          data: { dismissedAt: new Date() },
        });
      }
      return ok({ dismissed: true });
    },
  );

  // POST /api/notifications/:id/resolve  { status }
  // Records the outcome of an actionable notification (e.g. a friend request that
  // was accepted/declined) by merging `status` into data and marking it read, so
  // the row can show "✓ Accepted" / "Declined" instead of Accept/Decline buttons.
  app.post<{ Params: { id: string }; Body: unknown }>(
    "/notifications/:id/resolve",
    { preHandler: requireAuth },
    async (req) => {
      const me = req.userId!;
      const { status } = resolveBodySchema.parse(req.body);
      const notif = await prisma.notification.findUnique({ where: { id: req.params.id } });
      if (!notif || notif.userId !== me) throw err.notFound("NOTIF_NOT_FOUND", "Notification not found");

      const baseData =
        notif.data && typeof notif.data === "object" && !Array.isArray(notif.data)
          ? (notif.data as Record<string, unknown>)
          : {};

      await prisma.notification.update({
        where: { id: notif.id },
        data: {
          data: { ...baseData, status },
          readAt: notif.readAt ?? new Date(),
        },
      });
      return ok({ status });
    },
  );

  // POST /api/notifications/:id/read
  app.post<{ Params: { id: string } }>(
    "/notifications/:id/read",
    { preHandler: requireAuth },
    async (req) => {
      const me = req.userId!;
      const notif = await prisma.notification.findUnique({ where: { id: req.params.id } });
      if (!notif || notif.userId !== me) throw err.notFound("NOTIF_NOT_FOUND", "Notification not found");

      if (!notif.readAt) {
        await prisma.notification.update({ where: { id: notif.id }, data: { readAt: new Date() } });
      }
      return ok({ read: true });
    },
  );
}
