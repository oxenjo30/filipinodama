import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client.js";
import { ok } from "../lib/errors.js";
import { requireAuth } from "../auth/guards.js";

/**
 * Player-facing Scheduled Events — /api/events. Read-only view onto the
 * LiveEvent rows authored by admins in admin-events.ts (double-gold windows,
 * fiestas, sales, tournaments, etc.). Only surfaces events that are currently
 * relevant to a player: "scheduled" (coming up) or "live" (happening now).
 * "ended" events are excluded — they're historical and admin-only.
 */

const eventDisplaySelect = {
  id: true,
  name: true,
  type: true,
  status: true,
  scope: true,
  reward: true,
  startsLabel: true,
  endsLabel: true,
  color: true,
} as const;

export async function eventsRoutes(app: FastifyInstance) {
  // GET /api/events — currently-relevant scheduled/live events, newest first
  app.get("/events", { preHandler: requireAuth }, async () => {
    const items = await prisma.liveEvent.findMany({
      where: { status: { in: ["scheduled", "live"] } },
      orderBy: { createdAt: "desc" },
      select: eventDisplaySelect,
    });
    return ok({ items });
  });
}
