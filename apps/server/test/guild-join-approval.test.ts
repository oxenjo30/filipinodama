import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { buildTestApp, seedUser, authFor, truncateAll } from "./helpers.js";

// Owner policy (2026-07-14): ALL guild joins require officer/leader approval —
// there is no instant self-join, even for a "open" joinPolicy guild. These tests
// lock that in: POST /api/guilds/:id/join must create a PENDING request (never a
// GuildMember) for every non-invite policy, and invite-only stays fully blocked.

// truncateAll() doesn't clear Guild/GuildMember/GuildJoinRequest — clean the rows
// this file creates explicitly (same precedent as admin-guilds-a5.test.ts).
afterEach(async () => {
  await prisma.guildJoinRequest.deleteMany({ where: { guild: { tag: { startsWith: "#JA" } } } });
  await prisma.guildMember.deleteMany({ where: { guild: { tag: { startsWith: "#JA" } } } });
  await prisma.guild.deleteMany({ where: { tag: { startsWith: "#JA" } } });
  await truncateAll();
});
afterAll(async () => {
  await prisma.$disconnect();
});

let gseq = 0;
async function seedGuild(joinPolicy: string, minTrophies = 0) {
  gseq += 1;
  const leader = await seedUser({});
  const guild = await prisma.guild.create({
    data: { name: `Join-Approval Guild ${gseq}`, tag: `#JA${gseq}`, joinPolicy, minTrophies },
  });
  await prisma.guildMember.create({ data: { guildId: guild.id, userId: leader.id, role: "LEADER" } });
  return { guild, leaderId: leader.id };
}

describe("POST /api/guilds/:id/join — universal approval", () => {
  it("open guild → creates a PENDING request, NOT an instant membership", async () => {
    const app = await buildTestApp();
    const { guild } = await seedGuild("open");
    const applicant = await seedUser({ trophies: 500 }); // well above any floor
    const cookie = authFor({ sub: applicant.id });

    const res = await app.inject({
      method: "POST",
      url: `/api/guilds/${guild.id}/join`,
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.status).toBe("requested"); // NOT "joined"
    expect(body.requestId).toBeTruthy();

    // No membership was created…
    const member = await prisma.guildMember.findUnique({ where: { userId: applicant.id } });
    expect(member).toBeNull();
    // …but a pending request WAS.
    const request = await prisma.guildJoinRequest.findUnique({
      where: { guildId_userId: { guildId: guild.id, userId: applicant.id } },
    });
    expect(request?.status).toBe("pending");

    await app.close();
  });

  it("request-policy guild → also a pending request (unchanged)", async () => {
    const app = await buildTestApp();
    const { guild } = await seedGuild("request");
    const applicant = await seedUser({ trophies: 500 });
    const cookie = authFor({ sub: applicant.id });

    const res = await app.inject({
      method: "POST",
      url: `/api/guilds/${guild.id}/join`,
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("requested");
    const member = await prisma.guildMember.findUnique({ where: { userId: applicant.id } });
    expect(member).toBeNull();

    await app.close();
  });

  it("invite-only guild → 403, no request and no membership", async () => {
    const app = await buildTestApp();
    const { guild } = await seedGuild("invite");
    const applicant = await seedUser({ trophies: 500 });
    const cookie = authFor({ sub: applicant.id });

    const res = await app.inject({
      method: "POST",
      url: `/api/guilds/${guild.id}/join`,
      headers: { cookie },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("INVITE_ONLY");
    const member = await prisma.guildMember.findUnique({ where: { userId: applicant.id } });
    expect(member).toBeNull();
    const request = await prisma.guildJoinRequest.findUnique({
      where: { guildId_userId: { guildId: guild.id, userId: applicant.id } },
    });
    expect(request).toBeNull();

    await app.close();
  });

  it("an officer approving the pending request DOES create the membership", async () => {
    const app = await buildTestApp();
    const { guild, leaderId } = await seedGuild("open");
    const applicant = await seedUser({ trophies: 500 });
    const applicantCookie = authFor({ sub: applicant.id });
    const leaderCookie = authFor({ sub: leaderId });

    // Applicant requests.
    const joinRes = await app.inject({
      method: "POST",
      url: `/api/guilds/${guild.id}/join`,
      headers: { cookie: applicantCookie },
    });
    const requestId = joinRes.json().data.requestId;

    // Leader accepts → membership now exists.
    const acceptRes = await app.inject({
      method: "POST",
      url: `/api/guilds/${guild.id}/requests/${requestId}/accept`,
      headers: { cookie: leaderCookie },
    });
    expect(acceptRes.statusCode).toBe(200);

    const member = await prisma.guildMember.findUnique({ where: { userId: applicant.id } });
    expect(member).not.toBeNull();
    expect(member?.guildId).toBe(guild.id);

    await app.close();
  });
});
