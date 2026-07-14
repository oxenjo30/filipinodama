import type { FastifyInstance } from "fastify";
import type { GuildRole } from "@prisma/client";
import { z } from "zod";
import { createGuildSchema, updateGuildSchema, guildChatSendSchema } from "@dama/shared";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { isMuted } from "../lib/mute.js";
import { requireAuth, attachUser } from "../auth/guards.js";
import { EV } from "@dama/shared";
import { getIO } from "../realtime/io.js";
import { loadGuildHistory, postGuildMessage, guildRoom } from "./guild-chat-service.js";
import { getWarStatus } from "../lib/guild-wars.js";

const ROLE_RANK: Record<GuildRole, number> = { MEMBER: 1, OFFICER: 2, LEADER: 3 };
const roleSchema = z.object({ role: z.enum(["OFFICER", "MEMBER"]) });

const memberUserSelect = {
  id: true,
  username: true,
  displayName: true,
  tag: true,
  avatarUrl: true,
  frameId: true,
  trophies: true,
  rankTier: true,
  lastSeenAt: true,
} as const;

function memberRow(m: {
  userId: string;
  role: GuildRole;
  weeklyContribution: number;
  joinedAt: Date;
  user: {
    id: string;
    username: string;
    displayName: string;
    tag: string;
    avatarUrl: string | null;
    frameId: string | null;
    trophies: number;
    rankTier: string;
    lastSeenAt: Date;
  };
}) {
  return {
    userId: m.userId,
    role: m.role,
    weeklyContribution: m.weeklyContribution,
    joinedAt: m.joinedAt,
    user: { ...m.user, presence: "unknown" as const },
  };
}

/** Fetch the caller's membership in a guild, or null. */
async function myMembership(userId: string, guildId: string) {
  return prisma.guildMember.findFirst({ where: { userId, guildId } });
}

/** Require the caller to be a member of `guildId` with at least `min` role. */
async function requireGuildRole(userId: string, guildId: string, min: GuildRole) {
  const membership = await myMembership(userId, guildId);
  if (!membership) throw err.forbidden("NOT_A_MEMBER", "You are not a member of this guild");
  if (ROLE_RANK[membership.role] < ROLE_RANK[min]) {
    throw err.forbidden("INSUFFICIENT_GUILD_ROLE", `Requires ${min} role`);
  }
  return membership;
}

export async function guildRoutes(app: FastifyInstance) {
  // GET /api/guilds?search= — browse (PUBLIC: the Top Guilds rail is read-only
  // and shown to signed-out visitors on the leaderboard).
  app.get<{ Querystring: { search?: string } }>(
    "/guilds",
    { preHandler: attachUser },
    async (req) => {
      const search = req.query.search?.trim();
      const where = search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { tag: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {};
      const guilds = await prisma.guild.findMany({
        where,
        orderBy: [{ weeklyPoints: "desc" }, { createdAt: "desc" }],
        take: 50,
        include: { _count: { select: { members: true } } },
      });
      return ok({
        guilds: guilds.map((g) => ({
          id: g.id,
          name: g.name,
          tag: g.tag,
          description: g.description,
          crestKey: g.crestKey,
          minTrophies: g.minTrophies,
          joinPolicy: g.joinPolicy,
          weeklyPoints: g.weeklyPoints,
          memberCount: g._count.members,
          createdAt: g.createdAt,
        })),
      });
    },
  );

  // POST /api/guilds — FREE create; creator becomes LEADER
  app.post("/guilds", { preHandler: requireAuth }, async (req) => {
    const me = req.userId!;
    const input = createGuildSchema.parse(req.body);

    // a user can only belong to one guild (GuildMember.userId is @unique)
    const anyMembership = await prisma.guildMember.findUnique({ where: { userId: me } });
    if (anyMembership) throw err.conflict("ALREADY_IN_GUILD", "You are already in a guild");

    // uniqueness on name/tag
    const clash = await prisma.guild.findFirst({
      where: { OR: [{ name: input.name }, { tag: input.tag }] },
      select: { name: true, tag: true },
    });
    if (clash) {
      if (clash.name === input.name) throw err.conflict("NAME_TAKEN", "Guild name is taken");
      throw err.conflict("TAG_TAKEN", "Guild tag is taken");
    }

    const guild = await prisma.guild.create({
      data: {
        name: input.name,
        tag: input.tag,
        description: input.description,
        crestKey: input.crestKey,
        ...(input.minTrophies !== undefined ? { minTrophies: input.minTrophies } : {}),
        ...(input.joinPolicy !== undefined ? { joinPolicy: input.joinPolicy } : {}),
        members: { create: { userId: me, role: "LEADER" } },
      },
      include: { _count: { select: { members: true } } },
    });

    return ok({
      guild: {
        id: guild.id,
        name: guild.name,
        tag: guild.tag,
        description: guild.description,
        crestKey: guild.crestKey,
        minTrophies: guild.minTrophies,
        joinPolicy: guild.joinPolicy,
        weeklyPoints: guild.weeklyPoints,
        memberCount: guild._count.members,
        createdAt: guild.createdAt,
      },
    });
  });

  // GET /api/guilds/:id — public detail + roster + viewer joinState
  app.get<{ Params: { id: string } }>(
    "/guilds/:id",
    { preHandler: attachUser },
    async (req) => {
      const me = req.userId ?? null;
      const guild = await prisma.guild.findUnique({
        where: { id: req.params.id },
        include: {
          members: {
            include: { user: { select: memberUserSelect } },
            orderBy: [{ role: "asc" }, { weeklyContribution: "desc" }],
          },
        },
      });
      if (!guild) throw err.notFound("GUILD_NOT_FOUND", "Guild not found");

      const mine = me ? guild.members.find((m) => m.userId === me) : undefined;

      // joinState mirrors POST /guilds/:id/join eligibility (guilds.ts join route):
      //  - guest: signed out
      //  - member: already in THIS guild
      //  - in-other-guild: in a DIFFERENT guild
      //  - requested: has a pending join request to this guild
      //  - invite-only: at/above the trophy floor but joinPolicy is "invite" (join route 403s)
      //  - joinable: everything else (open/request policy, or below-floor request path)
      let joinState: "member" | "in-other-guild" | "requested" | "invite-only" | "joinable" | "guest";
      if (!me) {
        joinState = "guest";
      } else if (mine) {
        joinState = "member";
      } else {
        const otherMembership = await prisma.guildMember.findUnique({ where: { userId: me } });
        if (otherMembership) {
          joinState = "in-other-guild";
        } else {
          const pending = await prisma.guildJoinRequest.findUnique({
            where: { guildId_userId: { guildId: guild.id, userId: me } },
          });
          if (pending && pending.status === "pending") {
            joinState = "requested";
          } else {
            // Below the trophy floor always falls through to the join-request path
            // regardless of policy (mirrors POST /:id/join), so only gate on policy
            // when the viewer meets the floor.
            const viewer = await prisma.user.findUnique({ where: { id: me }, select: { trophies: true } });
            const viewerTrophies = viewer?.trophies ?? 0;
            joinState =
              guild.joinPolicy === "invite" && viewerTrophies >= guild.minTrophies
                ? "invite-only"
                : "joinable";
          }
        }
      }

      return ok({
        guild: {
          id: guild.id,
          name: guild.name,
          tag: guild.tag,
          description: guild.description,
          crestKey: guild.crestKey,
          minTrophies: guild.minTrophies,
          joinPolicy: guild.joinPolicy,
          weeklyPoints: guild.weeklyPoints,
          createdAt: guild.createdAt,
          memberCount: guild.members.length,
        },
        roster: guild.members.map(memberRow),
        myRole: mine?.role ?? null,
        joinState,
      });
    },
  );

  // PATCH /api/guilds/:id — leader/officer only
  app.patch<{ Params: { id: string } }>(
    "/guilds/:id",
    { preHandler: requireAuth },
    async (req) => {
      const me = req.userId!;
      const guildId = req.params.id;
      await requireGuildRole(me, guildId, "OFFICER");
      const input = updateGuildSchema.parse(req.body);

      if (input.name) {
        const clash = await prisma.guild.findFirst({
          where: { name: input.name, id: { not: guildId } },
          select: { id: true },
        });
        if (clash) throw err.conflict("NAME_TAKEN", "Guild name is taken");
      }

      const guild = await prisma.guild.update({
        where: { id: guildId },
        data: {
          name: input.name,
          description: input.description,
          minTrophies: input.minTrophies,
          crestKey: input.crestKey,
          ...(input.joinPolicy !== undefined ? { joinPolicy: input.joinPolicy } : {}),
        },
      });
      return ok({
        guild: {
          id: guild.id,
          name: guild.name,
          tag: guild.tag,
          description: guild.description,
          crestKey: guild.crestKey,
          minTrophies: guild.minTrophies,
          joinPolicy: guild.joinPolicy,
          weeklyPoints: guild.weeklyPoints,
          createdAt: guild.createdAt,
        },
      });
    },
  );

  // GET /api/guilds/:id/chat — recent chat history (members only)
  app.get<{ Params: { id: string } }>(
    "/guilds/:id/chat",
    { preHandler: requireAuth },
    async (req) => {
      const me = req.userId!;
      const guildId = req.params.id;
      await requireGuildRole(me, guildId, "MEMBER");
      const messages = await loadGuildHistory(guildId, 50);
      return ok({ messages });
    },
  );

  // POST /api/guilds/:id/chat — send a message (members only). Persists it, then
  // broadcasts live to every guildmate in the `guild:<id>` socket room.
  app.post<{ Params: { id: string } }>(
    "/guilds/:id/chat",
    { preHandler: requireAuth },
    async (req) => {
      const me = req.userId!;
      const guildId = req.params.id;
      const membership = await requireGuildRole(me, guildId, "MEMBER");
      if (await isMuted(me)) throw err.forbidden("MUTED", "You are muted and can't send messages.");
      const { body } = guildChatSendSchema.parse(req.body);

      const message = await postGuildMessage(guildId, me, body, membership.role);

      // live fan-out to online guildmates (skip silently if sockets not up yet)
      getIO()?.to(guildRoom(guildId)).emit(EV.guildChatMessage, message);

      return ok({ message });
    },
  );

  // POST /api/guilds/:id/join — auto-join if trophies>=minTrophies else create request
  app.post<{ Params: { id: string } }>(
    "/guilds/:id/join",
    { preHandler: requireAuth },
    async (req) => {
      const me = req.userId!;
      const guildId = req.params.id;

      const anyMembership = await prisma.guildMember.findUnique({ where: { userId: me } });
      if (anyMembership) throw err.conflict("ALREADY_IN_GUILD", "You are already in a guild");

      const guild = await prisma.guild.findUnique({ where: { id: guildId } });
      if (!guild) throw err.notFound("GUILD_NOT_FOUND", "Guild not found");

      const user = await prisma.user.findUnique({ where: { id: me }, select: { trophies: true } });
      if (!user) throw err.notFound("USER_NOT_FOUND", "User not found");

      // Below the trophy floor → never auto-join regardless of policy.
      if (user.trophies < guild.minTrophies) {
        // falls through to the request flow below
      } else if (guild.joinPolicy === "invite") {
        // Invite-only: no self-join and no open request — must be invited.
        throw err.forbidden("INVITE_ONLY", "This guild is invite-only");
      } else if (guild.joinPolicy === "open") {
        // Open + meets trophies → join immediately.
        await prisma.guildMember.create({ data: { userId: me, guildId, role: "MEMBER" } });
        return ok({ status: "joined" });
      }
      // "request" policy (or below-floor) → create a join request below.

      const request = await prisma.guildJoinRequest.upsert({
        where: { guildId_userId: { guildId, userId: me } },
        update: { status: "pending", createdAt: new Date() },
        create: { guildId, userId: me, status: "pending" },
      });

      // notify guild officers/leaders
      const officers = await prisma.guildMember.findMany({
        where: { guildId, role: { in: ["LEADER", "OFFICER"] } },
        select: { userId: true },
      });
      if (officers.length) {
        await prisma.notification.createMany({
          data: officers.map((o) => ({
            userId: o.userId,
            type: "guild_join_request",
            title: "New guild join request",
            data: { guildId, requestId: request.id, fromUserId: me },
          })),
        });
      }

      return ok({ status: "requested", requestId: request.id });
    },
  );

  // GET /api/guilds/:id/requests — officer+ inbox
  app.get<{ Params: { id: string } }>(
    "/guilds/:id/requests",
    { preHandler: requireAuth },
    async (req) => {
      const me = req.userId!;
      const guildId = req.params.id;
      await requireGuildRole(me, guildId, "OFFICER");

      const requests = await prisma.guildJoinRequest.findMany({
        where: { guildId, status: "pending" },
        orderBy: { createdAt: "desc" },
      });
      const userIds = requests.map((r) => r.userId);
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: memberUserSelect,
      });
      const byId = new Map(users.map((u) => [u.id, u]));

      return ok({
        requests: requests
          .map((r) => {
            const u = byId.get(r.userId);
            if (!u) return null;
            return { id: r.id, createdAt: r.createdAt, user: { ...u, presence: "unknown" as const } };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null),
      });
    },
  );

  // POST /api/guilds/:id/requests/:rid/accept — officer+
  app.post<{ Params: { id: string; rid: string } }>(
    "/guilds/:id/requests/:rid/accept",
    { preHandler: requireAuth },
    async (req) => {
      const me = req.userId!;
      const guildId = req.params.id;
      await requireGuildRole(me, guildId, "OFFICER");

      const request = await prisma.guildJoinRequest.findUnique({ where: { id: req.params.rid } });
      if (!request || request.guildId !== guildId) throw err.notFound("REQUEST_NOT_FOUND", "Join request not found");
      if (request.status !== "pending") throw err.conflict("NOT_PENDING", "Request is no longer pending");

      const already = await prisma.guildMember.findUnique({ where: { userId: request.userId } });
      if (already) {
        await prisma.guildJoinRequest.update({ where: { id: request.id }, data: { status: "declined" } });
        throw err.conflict("USER_IN_GUILD", "User already belongs to a guild");
      }

      await prisma.$transaction([
        prisma.guildJoinRequest.update({ where: { id: request.id }, data: { status: "accepted" } }),
        prisma.guildMember.create({ data: { userId: request.userId, guildId, role: "MEMBER" } }),
      ]);

      await prisma.notification.create({
        data: {
          userId: request.userId,
          type: "guild_join_accepted",
          title: "Guild join request accepted",
          data: { guildId },
        },
      });

      return ok({ status: "accepted" });
    },
  );

  // POST /api/guilds/:id/requests/:rid/decline — officer+
  app.post<{ Params: { id: string; rid: string } }>(
    "/guilds/:id/requests/:rid/decline",
    { preHandler: requireAuth },
    async (req) => {
      const me = req.userId!;
      const guildId = req.params.id;
      await requireGuildRole(me, guildId, "OFFICER");

      const request = await prisma.guildJoinRequest.findUnique({ where: { id: req.params.rid } });
      if (!request || request.guildId !== guildId) throw err.notFound("REQUEST_NOT_FOUND", "Join request not found");
      if (request.status !== "pending") throw err.conflict("NOT_PENDING", "Request is no longer pending");

      await prisma.guildJoinRequest.update({ where: { id: request.id }, data: { status: "declined" } });
      return ok({ status: "declined" });
    },
  );

  // PATCH /api/guilds/:id/members/:uid/role — leader only
  app.patch<{ Params: { id: string; uid: string } }>(
    "/guilds/:id/members/:uid/role",
    { preHandler: requireAuth },
    async (req) => {
      const me = req.userId!;
      const guildId = req.params.id;
      const targetId = req.params.uid;
      await requireGuildRole(me, guildId, "LEADER");
      const { role } = roleSchema.parse(req.body);

      if (targetId === me) throw err.badRequest("CANNOT_CHANGE_OWN_ROLE", "Leader cannot change own role here");

      const target = await prisma.guildMember.findFirst({ where: { userId: targetId, guildId } });
      if (!target) throw err.notFound("MEMBER_NOT_FOUND", "Member not found in this guild");
      if (target.role === "LEADER") throw err.forbidden("CANNOT_DEMOTE_LEADER", "Cannot change the leader's role");

      const updated = await prisma.guildMember.update({
        where: { id: target.id },
        data: { role },
      });
      return ok({ userId: updated.userId, role: updated.role });
    },
  );

  // DELETE /api/guilds/:id/members/:uid — kick (officer+); or self-leave
  app.delete<{ Params: { id: string; uid: string } }>(
    "/guilds/:id/members/:uid",
    { preHandler: requireAuth },
    async (req) => {
      const me = req.userId!;
      const guildId = req.params.id;
      const targetId = req.params.uid;

      const myMember = await myMembership(me, guildId);
      if (!myMember) throw err.forbidden("NOT_A_MEMBER", "You are not a member of this guild");

      const target = await prisma.guildMember.findFirst({ where: { userId: targetId, guildId } });
      if (!target) throw err.notFound("MEMBER_NOT_FOUND", "Member not found in this guild");

      const isSelf = targetId === me;
      if (!isSelf) {
        // kicking someone else requires OFFICER+ and a strictly-higher role than target
        if (ROLE_RANK[myMember.role] < ROLE_RANK.OFFICER) {
          throw err.forbidden("INSUFFICIENT_GUILD_ROLE", "Requires OFFICER role");
        }
        if (ROLE_RANK[target.role] >= ROLE_RANK[myMember.role]) {
          throw err.forbidden("CANNOT_KICK", "Cannot kick a member of equal or higher rank");
        }
      } else if (target.role === "LEADER") {
        // leader cannot leave while others remain — must transfer leadership first
        const others = await prisma.guildMember.count({ where: { guildId, userId: { not: me } } });
        if (others > 0) throw err.conflict("LEADER_MUST_TRANSFER", "Transfer leadership before leaving");
      }

      // if the last member (a lone leader) leaves, delete the empty guild too
      const remaining = await prisma.guildMember.count({ where: { guildId } });
      if (isSelf && remaining <= 1) {
        await prisma.guild.delete({ where: { id: guildId } });
        return ok({ removed: true, guildDeleted: true });
      }

      await prisma.guildMember.delete({ where: { id: target.id } });
      return ok({ removed: true, guildDeleted: false });
    },
  );

  // GET /api/guilds/:id/leaderboard — members by weeklyContribution
  app.get<{ Params: { id: string } }>(
    "/guilds/:id/leaderboard",
    { preHandler: requireAuth },
    async (req) => {
      const guildId = req.params.id;
      const guild = await prisma.guild.findUnique({ where: { id: guildId }, select: { id: true } });
      if (!guild) throw err.notFound("GUILD_NOT_FOUND", "Guild not found");

      const members = await prisma.guildMember.findMany({
        where: { guildId },
        include: { user: { select: memberUserSelect } },
        orderBy: { weeklyContribution: "desc" },
      });

      return ok({
        leaderboard: members.map((m, i) => ({
          rank: i + 1,
          userId: m.userId,
          role: m.role,
          weeklyContribution: m.weeklyContribution,
          user: { ...m.user, presence: "unknown" as const },
        })),
      });
    },
  );

  // ── GET /api/guilds/war — weekly Guild War status (PUBLIC/optional-auth) ────
  // Standings + reward tiers for everyone; your guild's rank/points + your
  // contribution when signed in and in a guild. Read-only.
  app.get("/guilds/war", { preHandler: attachUser }, async (req) => {
    const me = req.userId ?? null;
    const status = await getWarStatus(prisma, me, new Date());
    return ok(status);
  });
}
