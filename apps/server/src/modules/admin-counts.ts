import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client.js";
import { ok } from "../lib/errors.js";
import { requireAdmin } from "../auth/guards.js";

/**
 * Sidebar badge counts for the admin console — /api/admin/counts (SUPPORT-gated).
 * Powers the red count-bubbles on the Moderation and Support nav items (like a
 * notification bell's unread count): OPEN reports and OPEN tickets awaiting an
 * admin. Gated at SUPPORT (the lowest tier that sees those queues) so every admin
 * gets their badges; the individual queue routes still enforce their own gate.
 */
export async function adminCountsRoutes(app: FastifyInstance) {
  app.get("/admin/counts", { preHandler: requireAdmin("SUPPORT") }, async () => {
    const [openReports, openTickets] = await Promise.all([
      prisma.report.count({ where: { status: "OPEN" } }),
      prisma.ticket.count({ where: { status: "OPEN" } }),
    ]);
    return ok({ openReports, openTickets });
  });
}
