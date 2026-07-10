import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { rankTierSchema } from "@dama/shared";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { requireAdmin } from "../auth/guards.js";
import { audit } from "../lib/audit.js";

/**
 * Campaigns section — /api/admin/campaigns* (ECONOMY-gated).
 *
 * Segments are validated STRICTLY server-side via `segmentSchema` (a zod union
 * that pipes `rank:<key>` through the shared `rankTierSchema` enum) — never
 * char-validated or split on "-" (the tier key "star-guardian" itself contains
 * a hyphen), and never resolved from client-supplied user ids. The resolved
 * `where` always excludes bots/guests/deleted users.
 */

const segmentSchema = z.union([
  z.literal("all"),
  z.literal("active7d"),
  z.string().startsWith("rank:").transform((s) => s.slice(5)).pipe(rankTierSchema).transform((k) => `rank:${k}` as const),
]);

function segmentWhere(segment: string): Prisma.UserWhereInput {
  const base: Prisma.UserWhereInput = { isBot: false, isGuest: false, deletedAt: null };
  if (segment === "all") return base;
  if (segment === "active7d") return { ...base, lastSeenAt: { gte: new Date(Date.now() - 7 * 86_400_000) } };
  return { ...base, rankTier: segment.slice(5) };
}

const CHUNK = 1000;

export async function adminCampaignsRoutes(app: FastifyInstance) {
  app.get("/admin/campaigns", { preHandler: requireAdmin("ECONOMY") }, async () => {
    const items = await prisma.campaign.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
    return ok({ items });
  });

  app.post("/admin/campaigns/preview", { preHandler: requireAdmin("ECONOMY") }, async (req) => {
    const seg = parseSegment(req.body);
    const count = await prisma.user.count({ where: segmentWhere(seg) });
    return ok({ count });
  });

  app.post("/admin/campaigns/send", { preHandler: requireAdmin("ECONOMY") }, async (req) => {
    const body = z.object({ title: z.string().trim().min(1).max(120), body: z.string().trim().min(1).max(1000), reason: z.string().trim().min(1).max(500) }).parse(req.body);
    const seg = parseSegment(req.body);
    const targets = await prisma.user.findMany({ where: segmentWhere(seg), select: { id: true } });
    if (targets.length === 0) throw err.badRequest("EMPTY_SEGMENT", "No players match this segment");
    const actor = await prisma.user.findUnique({ where: { id: req.userId! }, select: { username: true, tag: true } });
    const sentByName = `${actor!.username}${actor!.tag}`;
    let reach = 0;
    for (let i = 0; i < targets.length; i += CHUNK) {
      const slice = targets.slice(i, i + CHUNK);
      const res = await prisma.notification.createMany({ data: slice.map((u) => ({ userId: u.id, type: "announcement", title: body.title, body: body.body })) });
      reach += res.count;
    }
    const camp = await prisma.campaign.create({ data: { title: body.title, body: body.body, segment: seg, status: "sent", reach, sentById: req.userId!, sentByName } });
    await audit(prisma, { actorId: req.userId!, action: "campaign.send", targetType: "campaign", targetId: camp.id, after: { segment: seg, reach }, reason: body.title });
    return ok({ id: camp.id, reach });
  });
}

function parseSegment(reqBody: unknown): string {
  const raw = (reqBody as { segment?: unknown })?.segment;
  const parsed = segmentSchema.safeParse(raw);
  if (!parsed.success) throw err.badRequest("BAD_SEGMENT", "Invalid audience segment");
  return parsed.data;
}
