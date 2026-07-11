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

export function segmentWhere(segment: string): Prisma.UserWhereInput {
  const base: Prisma.UserWhereInput = { isBot: false, isGuest: false, deletedAt: null };
  if (segment === "all") return base;
  if (segment === "active7d") return { ...base, lastSeenAt: { gte: new Date(Date.now() - 7 * 86_400_000) } };
  return { ...base, rankTier: segment.slice(5) };
}

const CHUNK = 1000;

const channelSchema = z.enum(["push", "email", "in-app"]);
const contentSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(1000),
  reason: z.string().trim().min(1).max(500),
});

/**
 * Resolve the segment and fan out one "announcement" notification per target
 * in CHUNKs. Shared by sendCampaign() (new Campaign) and the campaign
 * scheduler (an already-claimed, existing Campaign row) so both fan out
 * identically. Throws EMPTY_SEGMENT (400) if no players match.
 */
export async function fanOutNotifications(seg: string, title: string, body: string): Promise<number> {
  const targets = await prisma.user.findMany({ where: segmentWhere(seg), select: { id: true } });
  if (targets.length === 0) throw err.badRequest("EMPTY_SEGMENT", "No players match this segment");
  let reach = 0;
  for (let i = 0; i < targets.length; i += CHUNK) {
    const slice = targets.slice(i, i + CHUNK);
    const res = await prisma.notification.createMany({ data: slice.map((u) => ({ userId: u.id, type: "announcement", title, body })) });
    reach += res.count;
  }
  return reach;
}

/**
 * Fan out + persist a "sent" Campaign + audit row. Shared by the legacy
 * POST /admin/campaigns/send route and the new create endpoint's send action so
 * both behave identically. Throws EMPTY_SEGMENT (400) if no players match.
 */
async function sendCampaign(actorId: string, content: z.infer<typeof contentSchema>, seg: string, channel: string) {
  const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { username: true, tag: true } });
  const sentByName = `${actor!.username}${actor!.tag}`;
  const reach = await fanOutNotifications(seg, content.title, content.body);
  const camp = await prisma.campaign.create({ data: { title: content.title, body: content.body, segment: seg, status: "sent", channel, reach, sentById: actorId, sentByName } });
  await audit(prisma, { actorId, action: "campaign.send", targetType: "campaign", targetId: camp.id, after: { segment: seg, channel, reach }, reason: content.title });
  return { id: camp.id, reach, status: "sent" as const };
}

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

  // Unified create endpoint: draft | schedule | send.
  app.post("/admin/campaigns", { preHandler: requireAdmin("ECONOMY") }, async (req) => {
    const content = contentSchema.parse(req.body);
    const { action, channel, scheduledFor } = z
      .object({
        action: z.enum(["draft", "schedule", "send"]).default("send"),
        channel: channelSchema.default("in-app"),
        scheduledFor: z.string().datetime().optional(),
      })
      .parse(req.body);
    const seg = parseSegment(req.body);
    const actor = await prisma.user.findUnique({ where: { id: req.userId! }, select: { username: true, tag: true } });
    const sentByName = `${actor!.username}${actor!.tag}`;

    if (action === "draft") {
      const camp = await prisma.campaign.create({ data: { title: content.title, body: content.body, segment: seg, status: "draft", channel, reach: 0, scheduledFor: null, sentById: req.userId!, sentByName } });
      await audit(prisma, { actorId: req.userId!, action: "campaign.draft", targetType: "campaign", targetId: camp.id, after: { segment: seg, channel }, reason: content.title });
      return ok({ id: camp.id, status: "draft" });
    }

    if (action === "schedule") {
      if (!scheduledFor) throw err.badRequest("SCHEDULE_REQUIRED", "A scheduledFor time is required to schedule a campaign");
      const camp = await prisma.campaign.create({ data: { title: content.title, body: content.body, segment: seg, status: "scheduled", channel, reach: 0, scheduledFor: new Date(scheduledFor), sentById: req.userId!, sentByName } });
      await audit(prisma, { actorId: req.userId!, action: "campaign.schedule", targetType: "campaign", targetId: camp.id, after: { segment: seg, channel, scheduledFor }, reason: content.title });
      return ok({ id: camp.id, status: "scheduled" });
    }

    return ok(await sendCampaign(req.userId!, content, seg, channel));
  });

  // Legacy send route — kept for back-compat. Delegates to the shared send logic.
  app.post("/admin/campaigns/send", { preHandler: requireAdmin("ECONOMY") }, async (req) => {
    const content = contentSchema.parse(req.body);
    const seg = parseSegment(req.body);
    const { id, reach } = await sendCampaign(req.userId!, content, seg, "in-app");
    return ok({ id, reach });
  });
}

function parseSegment(reqBody: unknown): string {
  const raw = (reqBody as { segment?: unknown })?.segment;
  const parsed = segmentSchema.safeParse(raw);
  if (!parsed.success) throw err.badRequest("BAD_SEGMENT", "Invalid audience segment");
  return parsed.data;
}
