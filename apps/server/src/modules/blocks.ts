import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { requireAuth } from "../auth/guards.js";
import { err } from "../lib/errors.js";

const blockSchema = z.object({ userId: z.string().min(1) });

/** True if EITHER user has blocked the other (used by dm/friends gates). */
export async function isBlockedBetween(a: string, b: string): Promise<boolean> {
  const row = await prisma.block.findFirst({
    where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
    select: { id: true },
  });
  return !!row;
}

/** The ids the viewer has blocked (for hiding their chat). */
export async function blockedIdsFor(viewerId: string): Promise<string[]> {
  const rows = await prisma.block.findMany({ where: { blockerId: viewerId }, select: { blockedId: true } });
  return rows.map((r) => r.blockedId);
}

export async function blockRoutes(app: FastifyInstance) {
  // POST /api/blocks { userId } — block a user (idempotent); removes friendship + pending requests.
  app.post("/blocks", { preHandler: requireAuth }, async (req) => {
    const me = req.userId!;
    if (req.isGuest) throw err.forbidden("GUEST_CANNOT_BLOCK", "Guests can't block players");
    const { userId } = blockSchema.parse(req.body);
    if (userId === me) throw err.badRequest("SELF_BLOCK", "You can't block yourself");
    const target = await prisma.user.findFirst({ where: { id: userId, deletedAt: null, isBot: false }, select: { id: true } });
    if (!target) throw err.badRequest("BAD_TARGET", "That player can't be blocked");

    const [aId, bId] = me < userId ? [me, userId] : [userId, me];
    await prisma.$transaction([
      prisma.block.upsert({
        where: { blockerId_blockedId: { blockerId: me, blockedId: userId } },
        update: {},
        create: { blockerId: me, blockedId: userId },
      }),
      prisma.friendship.deleteMany({ where: { aId, bId } }),
      prisma.friendRequest.deleteMany({
        where: { OR: [{ fromId: me, toId: userId }, { fromId: userId, toId: me }] },
      }),
    ]);
    return { ok: true };
  });

  // DELETE /api/blocks/:userId — unblock (idempotent).
  app.delete<{ Params: { userId: string } }>("/blocks/:userId", { preHandler: requireAuth }, async (req) => {
    const me = req.userId!;
    await prisma.block.deleteMany({ where: { blockerId: me, blockedId: req.params.userId } });
    return { ok: true };
  });

  // GET /api/blocks — the caller's blocked list.
  app.get("/blocks", { preHandler: requireAuth }, async (req) => {
    const me = req.userId!;
    const rows = await prisma.block.findMany({
      where: { blockerId: me },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, blocked: { select: { id: true, username: true, displayName: true, tag: true, avatarUrl: true } } },
    });
    return { blocked: rows.map((r) => ({ ...r.blocked, blockedAt: r.createdAt })) };
  });
}
