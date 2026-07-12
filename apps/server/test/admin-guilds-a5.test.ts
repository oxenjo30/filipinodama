import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { buildTestApp, seedUser, authFor, truncateAll } from "./helpers.js";

// truncateAll() doesn't clear Guild/GuildMember/GuildJoinRequest (same
// precedent as admin-search.test.ts) — this file creates guild rows, so clean
// those up explicitly.
afterEach(async () => {
  await prisma.guildJoinRequest.deleteMany({ where: { guild: { tag: { startsWith: "#A5" } } } });
  await prisma.guildMember.deleteMany({ where: { guild: { tag: { startsWith: "#A5" } } } });
  await prisma.guild.deleteMany({ where: { tag: { startsWith: "#A5" } } });
  await truncateAll();
});
afterAll(async () => {
  await prisma.$disconnect();
});

let gseq = 0;
async function seedGuildWithLeader(leaderId: string) {
  gseq += 1;
  const guild = await prisma.guild.create({ data: { name: `A5 Guild ${gseq}`, tag: `#A5${gseq}` } });
  await prisma.guildMember.create({ data: { guildId: guild.id, userId: leaderId, role: "LEADER" } });
  return guild;
}

async function seedPendingRequest(guildId: string, userId: string) {
  return prisma.guildJoinRequest.create({ data: { guildId, userId, status: "pending" } });
}

describe("GET /api/admin/guilds/requests", () => {
  it("unauthenticated → 401", async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/admin/guilds/requests" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("SUPPORT can list (read-only floor)", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const leader = await seedUser();
    const applicant = await seedUser();
    const guild = await seedGuildWithLeader(leader.id);
    await seedPendingRequest(guild.id, applicant.id);

    const res = await app.inject({
      method: "GET",
      url: "/api/admin/guilds/requests",
      headers: { cookie: authFor({ sub: support.id, adminRole: "SUPPORT" }) },
    });
    expect(res.statusCode).toBe(200);
    const { items } = res.json().data;
    expect(items.length).toBe(1);
    expect(items[0]).toMatchObject({
      player: { id: applicant.id, username: applicant.username },
      guild: { id: guild.id, name: guild.name },
    });
    await app.close();
  });

  it("only pending requests are returned, newest first, capped at 50", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const leader = await seedUser();
    const guild = await seedGuildWithLeader(leader.id);
    const declinedUser = await seedUser();
    await prisma.guildJoinRequest.create({ data: { guildId: guild.id, userId: declinedUser.id, status: "declined" } });
    const pendingUser = await seedUser();
    await seedPendingRequest(guild.id, pendingUser.id);

    const res = await app.inject({
      method: "GET",
      url: "/api/admin/guilds/requests",
      headers: { cookie: authFor({ sub: support.id, adminRole: "SUPPORT" }) },
    });
    expect(res.statusCode).toBe(200);
    const { items } = res.json().data;
    expect(items.length).toBe(1);
    expect(items[0].player.id).toBe(pendingUser.id);
    await app.close();
  });
});

describe("POST /api/admin/guilds/requests/:rid/approve", () => {
  it("unauthenticated → 401", async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: "POST", url: "/api/admin/guilds/requests/nope/approve", payload: { reason: "x" } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("SUPPORT → 403 (requires MODERATOR+)", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const leader = await seedUser();
    const applicant = await seedUser();
    const guild = await seedGuildWithLeader(leader.id);
    const req = await seedPendingRequest(guild.id, applicant.id);

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/guilds/requests/${req.id}/approve`,
      headers: { cookie: authFor({ sub: support.id, adminRole: "SUPPORT" }) },
      payload: { reason: "x" },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("MODERATOR approve creates the membership, marks the request accepted, and writes an audit row", async () => {
    const app = await buildTestApp();
    const mod = await seedUser({ adminRole: "MODERATOR" });
    const leader = await seedUser();
    const applicant = await seedUser();
    const guild = await seedGuildWithLeader(leader.id);
    const req = await seedPendingRequest(guild.id, applicant.id);

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/guilds/requests/${req.id}/approve`,
      headers: { cookie: authFor({ sub: mod.id, adminRole: "MODERATOR" }) },
      payload: { reason: "verified in-app" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ approved: true, guild: guild.name, player: applicant.username });

    const member = await prisma.guildMember.findUnique({ where: { userId: applicant.id } });
    expect(member).not.toBeNull();
    expect(member!.guildId).toBe(guild.id);
    expect(member!.role).toBe("MEMBER");

    const updatedReq = await prisma.guildJoinRequest.findUnique({ where: { id: req.id } });
    expect(updatedReq!.status).toBe("accepted");

    const auditRows = await prisma.auditLog.findMany({ where: { action: "guild.join.approve", targetId: guild.id } });
    expect(auditRows.length).toBe(1);
    expect(auditRows[0]!.actorId).toBe(mod.id);
    expect(auditRows[0]!.reason).toBe("verified in-app");
    await app.close();
  });

  it("approving twice → second call 409 NOT_PENDING", async () => {
    const app = await buildTestApp();
    const mod = await seedUser({ adminRole: "MODERATOR" });
    const leader = await seedUser();
    const applicant = await seedUser();
    const guild = await seedGuildWithLeader(leader.id);
    const req = await seedPendingRequest(guild.id, applicant.id);
    const cookie = authFor({ sub: mod.id, adminRole: "MODERATOR" });

    const first = await app.inject({ method: "POST", url: `/api/admin/guilds/requests/${req.id}/approve`, headers: { cookie }, payload: { reason: "a" } });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({ method: "POST", url: `/api/admin/guilds/requests/${req.id}/approve`, headers: { cookie }, payload: { reason: "b" } });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe("NOT_PENDING");
    await app.close();
  });

  it("approving a request for a player already in a guild → 409 USER_IN_GUILD and marks the request declined", async () => {
    const app = await buildTestApp();
    const mod = await seedUser({ adminRole: "MODERATOR" });
    const leaderA = await seedUser();
    const leaderB = await seedUser();
    const guildA = await seedGuildWithLeader(leaderA.id);
    const guildB = await seedGuildWithLeader(leaderB.id);
    // leaderB is already a member of guildB; request them into guildA
    const req = await seedPendingRequest(guildA.id, leaderB.id);

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/guilds/requests/${req.id}/approve`,
      headers: { cookie: authFor({ sub: mod.id, adminRole: "MODERATOR" }) },
      payload: { reason: "x" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("USER_IN_GUILD");

    const updatedReq = await prisma.guildJoinRequest.findUnique({ where: { id: req.id } });
    expect(updatedReq!.status).toBe("declined");
    await app.close();
  });

  it("missing reason → validation error", async () => {
    const app = await buildTestApp();
    const mod = await seedUser({ adminRole: "MODERATOR" });
    const leader = await seedUser();
    const applicant = await seedUser();
    const guild = await seedGuildWithLeader(leader.id);
    const req = await seedPendingRequest(guild.id, applicant.id);

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/guilds/requests/${req.id}/approve`,
      headers: { cookie: authFor({ sub: mod.id, adminRole: "MODERATOR" }) },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe("POST /api/admin/guilds/requests/:rid/reject", () => {
  it("SUPPORT → 403", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const leader = await seedUser();
    const applicant = await seedUser();
    const guild = await seedGuildWithLeader(leader.id);
    const req = await seedPendingRequest(guild.id, applicant.id);

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/guilds/requests/${req.id}/reject`,
      headers: { cookie: authFor({ sub: support.id, adminRole: "SUPPORT" }) },
      payload: { reason: "x" },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("MODERATOR reject marks the request declined ONLY (no membership) and writes an audit row", async () => {
    const app = await buildTestApp();
    const mod = await seedUser({ adminRole: "MODERATOR" });
    const leader = await seedUser();
    const applicant = await seedUser();
    const guild = await seedGuildWithLeader(leader.id);
    const req = await seedPendingRequest(guild.id, applicant.id);

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/guilds/requests/${req.id}/reject`,
      headers: { cookie: authFor({ sub: mod.id, adminRole: "MODERATOR" }) },
      payload: { reason: "not eligible" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ rejected: true, player: applicant.username });

    const updatedReq = await prisma.guildJoinRequest.findUnique({ where: { id: req.id } });
    expect(updatedReq!.status).toBe("declined");
    const member = await prisma.guildMember.findUnique({ where: { userId: applicant.id } });
    expect(member).toBeNull();

    const auditRows = await prisma.auditLog.findMany({ where: { action: "guild.join.reject", targetId: guild.id } });
    expect(auditRows.length).toBe(1);
    expect(auditRows[0]!.reason).toBe("not eligible");
    await app.close();
  });
});

describe("DELETE /api/admin/guilds/:id/kick/:userId (A5 roster kick)", () => {
  it("unauthenticated → 401", async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: "DELETE", url: "/api/admin/guilds/x/kick/y", payload: { reason: "x" } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("SUPPORT → 403", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const leader = await seedUser();
    const member = await seedUser();
    const guild = await seedGuildWithLeader(leader.id);
    await prisma.guildMember.create({ data: { guildId: guild.id, userId: member.id, role: "MEMBER" } });

    const res = await app.inject({
      method: "DELETE",
      url: `/api/admin/guilds/${guild.id}/kick/${member.id}`,
      headers: { cookie: authFor({ sub: support.id, adminRole: "SUPPORT" }) },
      payload: { reason: "x" },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("MODERATOR kicks a non-leader member — removes membership + audits guild.member.kick", async () => {
    const app = await buildTestApp();
    const mod = await seedUser({ adminRole: "MODERATOR" });
    const leader = await seedUser();
    const member = await seedUser();
    const guild = await seedGuildWithLeader(leader.id);
    await prisma.guildMember.create({ data: { guildId: guild.id, userId: member.id, role: "MEMBER" } });

    const res = await app.inject({
      method: "DELETE",
      url: `/api/admin/guilds/${guild.id}/kick/${member.id}`,
      headers: { cookie: authFor({ sub: mod.id, adminRole: "MODERATOR" }) },
      payload: { reason: "afk 30 days" },
    });
    expect(res.statusCode).toBe(200);

    const stillMember = await prisma.guildMember.findFirst({ where: { guildId: guild.id, userId: member.id } });
    expect(stillMember).toBeNull();

    const auditRows = await prisma.auditLog.findMany({ where: { action: "guild.member.kick", targetId: guild.id } });
    expect(auditRows.length).toBe(1);
    expect(auditRows[0]!.reason).toBe("afk 30 days");
    await app.close();
  });

  it("kicking the LEADER → 4xx, membership untouched", async () => {
    const app = await buildTestApp();
    const mod = await seedUser({ adminRole: "MODERATOR" });
    const leader = await seedUser();
    const guild = await seedGuildWithLeader(leader.id);

    const res = await app.inject({
      method: "DELETE",
      url: `/api/admin/guilds/${guild.id}/kick/${leader.id}`,
      headers: { cookie: authFor({ sub: mod.id, adminRole: "MODERATOR" }) },
      payload: { reason: "x" },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);

    const stillLeader = await prisma.guildMember.findFirst({ where: { guildId: guild.id, userId: leader.id } });
    expect(stillLeader).not.toBeNull();
    expect(stillLeader!.role).toBe("LEADER");
    await app.close();
  });
});
