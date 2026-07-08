import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { requireAdmin } from "../auth/guards.js";
import { audit } from "../lib/audit.js";

/**
 * Admin — Guilds oversight (/api/admin/guilds/*). Read + moderate the existing
 * Guild / GuildMember / GuildJoinRequest models only (no new subsystems, no
 * migrations). Every mutation is role-gated by requireAdmin() and writes an
 * AuditLog row via audit() with before/after/reason.
 *
 * Roles (guards.ts): SUPPORT < MODERATOR < ECONOMY < SUPERADMIN.
 */

// joinPolicy is a plain String column (open | request | invite) — mirror the
// player-facing guild routes rather than inventing an enum.
const joinPolicySchema = z.enum(["open", "request", "invite"]);

export async function adminGuildsRoutes(app: FastifyInstance) {
  // ── List guilds — search by name/tag, member count + weeklyPoints + leader ──
  app.get("/admin/guilds", { preHandler: requireAdmin("SUPPORT") }, async (req) => {
    const q = z
      .object({
        q: z.string().trim().optional(),
        sort: z.enum(["points", "members"]).default("points"),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(25),
      })
      .parse(req.query);

    const where: Prisma.GuildWhereInput = q.q
      ? {
          OR: [
            { name: { contains: q.q, mode: "insensitive" } },
            { tag: { contains: q.q, mode: "insensitive" } },
          ],
        }
      : {};

    // Member-count ordering has no scalar column, so order in-memory for that
    // mode; weeklyPoints orders in the DB. Both paginate the same way.
    const [total, rows] = await Promise.all([
      prisma.guild.count({ where }),
      prisma.guild.findMany({
        where,
        ...(q.sort === "points" ? { orderBy: { weeklyPoints: "desc" } } : {}),
        ...(q.sort === "points" ? { skip: (q.page - 1) * q.limit, take: q.limit } : {}),
        select: {
          id: true,
          name: true,
          tag: true,
          minTrophies: true,
          joinPolicy: true,
          weeklyPoints: true,
          createdAt: true,
          _count: { select: { members: true } },
          members: {
            where: { role: "LEADER" },
            select: { user: { select: { username: true, tag: true } } },
            take: 1,
          },
        },
      }),
    ]);

    const mapped = rows.map((g) => ({
      id: g.id,
      name: g.name,
      tag: g.tag,
      minTrophies: g.minTrophies,
      joinPolicy: g.joinPolicy,
      weeklyPoints: g.weeklyPoints,
      memberCount: g._count.members,
      leader: g.members[0]?.user ?? null,
      createdAt: g.createdAt,
    }));

    // For the member-count sort, order + page in memory (findMany fetched all
    // matching rows for that mode).
    if (q.sort === "members") {
      mapped.sort((a, b) => b.memberCount - a.memberCount);
      const start = (q.page - 1) * q.limit;
      return ok({ total, page: q.page, limit: q.limit, items: mapped.slice(start, start + q.limit) });
    }
    return ok({ total, page: q.page, limit: q.limit, items: mapped });
  });

  // ── Guild detail — fields + full member roster + pending-request count ──────
  app.get<{ Params: { id: string } }>("/admin/guilds/:id", { preHandler: requireAdmin("SUPPORT") }, async (req) => {
    const g = await prisma.guild.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        name: true,
        tag: true,
        description: true,
        crestKey: true,
        minTrophies: true,
        joinPolicy: true,
        weeklyPoints: true,
        createdAt: true,
        _count: { select: { members: true } },
        members: {
          orderBy: [{ role: "asc" }, { weeklyContribution: "desc" }],
          select: {
            userId: true,
            role: true,
            weeklyContribution: true,
            joinedAt: true,
            user: { select: { username: true, tag: true, displayName: true, trophies: true } },
          },
        },
      },
    });
    if (!g) throw err.notFound("NO_GUILD", "Guild not found");

    const pendingRequests = await prisma.guildJoinRequest.count({
      where: { guildId: g.id, status: "pending" },
    });

    return ok({
      id: g.id,
      name: g.name,
      tag: g.tag,
      description: g.description,
      crestKey: g.crestKey,
      minTrophies: g.minTrophies,
      joinPolicy: g.joinPolicy,
      weeklyPoints: g.weeklyPoints,
      memberCount: g._count.members,
      pendingRequests,
      createdAt: g.createdAt,
      roster: g.members.map((m) => ({
        userId: m.userId,
        username: m.user.username,
        tag: m.user.tag,
        displayName: m.user.displayName,
        trophies: m.user.trophies,
        role: m.role,
        weeklyContribution: m.weeklyContribution,
        joinedAt: m.joinedAt,
      })),
    });
  });

  // ── Rename / edit guild (MODERATOR) — audited, unique-constraint safe ───────
  app.patch<{ Params: { id: string } }>("/admin/guilds/:id", { preHandler: requireAdmin("MODERATOR") }, async (req) => {
    const input = z
      .object({
        name: z.string().trim().min(1).max(40).optional(),
        tag: z.string().trim().min(1).max(6).optional(),
        description: z.string().trim().max(500).nullish(),
        minTrophies: z.number().int().min(0).max(100_000).optional(),
        joinPolicy: joinPolicySchema.optional(),
        reason: z.string().trim().min(1, "reason required").max(500),
      })
      .parse(req.body);

    const before = await prisma.guild.findUnique({
      where: { id: req.params.id },
      select: { name: true, tag: true, description: true, minTrophies: true, joinPolicy: true },
    });
    if (!before) throw err.notFound("NO_GUILD", "Guild not found");

    // Pre-check name/tag clashes (name & tag are unique) → graceful conflict.
    if (input.name && input.name !== before.name) {
      const clash = await prisma.guild.findFirst({ where: { name: input.name, id: { not: req.params.id } }, select: { id: true } });
      if (clash) throw err.conflict("NAME_TAKEN", "Guild name is already taken");
    }
    if (input.tag && input.tag !== before.tag) {
      const clash = await prisma.guild.findFirst({ where: { tag: input.tag, id: { not: req.params.id } }, select: { id: true } });
      if (clash) throw err.conflict("TAG_TAKEN", "Guild tag is already taken");
    }

    const data: Prisma.GuildUpdateInput = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.tag !== undefined ? { tag: input.tag } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.minTrophies !== undefined ? { minTrophies: input.minTrophies } : {}),
      ...(input.joinPolicy !== undefined ? { joinPolicy: input.joinPolicy } : {}),
    };

    let after;
    try {
      after = await prisma.guild.update({
        where: { id: req.params.id },
        data,
        select: { name: true, tag: true, description: true, minTrophies: true, joinPolicy: true },
      });
    } catch (e) {
      // Safety net for the unique index if the pre-check raced.
      if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") {
        throw err.conflict("GUILD_UNIQUE", "Guild name or tag is already taken");
      }
      throw e;
    }

    await audit(prisma, {
      actorId: req.userId!,
      action: "guild.update",
      targetType: "guild",
      targetId: req.params.id,
      before,
      after,
      reason: input.reason,
    });
    return ok(after);
  });

  // ── Disband a guild (MODERATOR) — cascades to members/requests, audited ─────
  app.delete<{ Params: { id: string } }>("/admin/guilds/:id", { preHandler: requireAdmin("MODERATOR") }, async (req) => {
    const { reason } = z.object({ reason: z.string().trim().min(1, "reason required").max(500) }).parse(req.body);
    const before = await prisma.guild.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, tag: true, weeklyPoints: true, _count: { select: { members: true } } },
    });
    if (!before) throw err.notFound("NO_GUILD", "Guild not found");

    // onDelete: Cascade on GuildMember + GuildJoinRequest removes children.
    await prisma.guild.delete({ where: { id: req.params.id } });
    await audit(prisma, {
      actorId: req.userId!,
      action: "guild.disband",
      targetType: "guild",
      targetId: req.params.id,
      before: { name: before.name, tag: before.tag, weeklyPoints: before.weeklyPoints, members: before._count.members },
      reason,
    });
    return ok({ disbanded: true });
  });

  // ── Kick a member from a guild (MODERATOR) — audited ────────────────────────
  app.delete<{ Params: { id: string; userId: string } }>(
    "/admin/guilds/:id/kick/:userId",
    { preHandler: requireAdmin("MODERATOR") },
    async (req) => {
      const { reason } = z.object({ reason: z.string().trim().min(1, "reason required").max(500) }).parse(req.body);
      const member = await prisma.guildMember.findFirst({
        where: { guildId: req.params.id, userId: req.params.userId },
        select: { id: true, role: true, weeklyContribution: true, user: { select: { username: true, tag: true } } },
      });
      if (!member) throw err.notFound("NO_MEMBER", "Member not found in this guild");
      if (member.role === "LEADER") throw err.conflict("LEADER_KICK", "Cannot kick the guild leader — disband or transfer leadership first");

      await prisma.guildMember.delete({ where: { id: member.id } });
      await audit(prisma, {
        actorId: req.userId!,
        action: "guild.kick",
        targetType: "guild",
        targetId: req.params.id,
        before: { userId: req.params.userId, username: member.user.username, role: member.role, weeklyContribution: member.weeklyContribution },
        reason,
      });
      return ok({ kicked: true });
    },
  );
}
