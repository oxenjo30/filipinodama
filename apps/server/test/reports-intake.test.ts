import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { dmRefId } from "../src/modules/chat-service.js";
import { buildTestApp, seedUser, authFor, truncateAll } from "./helpers.js";

afterEach(truncateAll);
afterAll(async () => { await prisma.$disconnect(); });

async function makeDM(a: string, b: string) {
  const ch = await prisma.channel.create({ data: { type: "DM", refId: dmRefId(a, b) } });
  await prisma.channelMember.createMany({ data: [{ channelId: ch.id, userId: a }, { channelId: ch.id, userId: b }] });
  return ch;
}

describe("POST /api/reports", () => {
  it("401 when unauthenticated", async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: "POST", url: "/api/reports", payload: { accusedId: "x", reason: "SPAM", context: "profile", note: "n" } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("403 GUEST_CANNOT_REPORT for a guest reporter", async () => {
    const app = await buildTestApp();
    const guest = await seedUser({ isGuest: true });
    const accused = await seedUser();
    const res = await app.inject({ method: "POST", url: "/api/reports", headers: { cookie: authFor({ sub: guest.id, isGuest: true }) }, payload: { accusedId: accused.id, reason: "SPAM", context: "profile", note: "bad name" } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("GUEST_CANNOT_REPORT");
    await app.close();
  });

  it("creates a profile report with a snapshot; note required", async () => {
    const app = await buildTestApp();
    const reporter = await seedUser();
    const accused = await seedUser({ username: "t_user_badname" });
    const noNote = await app.inject({ method: "POST", url: "/api/reports", headers: { cookie: authFor({ sub: reporter.id }) }, payload: { accusedId: accused.id, reason: "INAPPROPRIATE", context: "profile" } });
    expect(noNote.statusCode).toBe(400);
    const ok = await app.inject({ method: "POST", url: "/api/reports", headers: { cookie: authFor({ sub: reporter.id }) }, payload: { accusedId: accused.id, reason: "INAPPROPRIATE", context: "profile", note: "offensive name" } });
    expect(ok.statusCode).toBe(200);
    const row = await prisma.report.findFirst({ where: { accusedId: accused.id } });
    expect(row!.profileSnapshot).toMatchObject({ username: "t_user_badname" });
  });

  it("self-report and bot-report → 400", async () => {
    const app = await buildTestApp();
    const reporter = await seedUser();
    const bot = await seedUser({ isBot: true });
    const self = await app.inject({ method: "POST", url: "/api/reports", headers: { cookie: authFor({ sub: reporter.id }) }, payload: { accusedId: reporter.id, reason: "SPAM", context: "profile", note: "n" } });
    const botR = await app.inject({ method: "POST", url: "/api/reports", headers: { cookie: authFor({ sub: reporter.id }) }, payload: { accusedId: bot.id, reason: "SPAM", context: "profile", note: "n" } });
    expect(self.statusCode).toBe(400);
    expect(botR.statusCode).toBe(400);
    await app.close();
  });

  it("DM report validates pair + author, snapshots excerpt", async () => {
    const app = await buildTestApp();
    const reporter = await seedUser();
    const accused = await seedUser();
    const ch = await makeDM(reporter.id, accused.id);
    const msg = await prisma.message.create({ data: { channelId: ch.id, authorId: accused.id, body: "bad words" } });
    const good = await app.inject({ method: "POST", url: "/api/reports", headers: { cookie: authFor({ sub: reporter.id }) }, payload: { accusedId: accused.id, reason: "HARASSMENT", context: "dm", messageId: msg.id } });
    expect(good.statusCode).toBe(200);
    const row = await prisma.report.findFirst({ where: { messageId: msg.id } });
    expect(row!.excerpt).toBe("bad words");
    // a message the reporter authored can't be cited as the accused's evidence
    const mine = await prisma.message.create({ data: { channelId: ch.id, authorId: reporter.id, body: "mine" } });
    const bad = await app.inject({ method: "POST", url: "/api/reports", headers: { cookie: authFor({ sub: reporter.id }) }, payload: { accusedId: accused.id, reason: "HARASSMENT", context: "dm", messageId: mine.id } });
    expect(bad.statusCode).toBe(400);
    await app.close();
  });

  it("dedupe: second OPEN report same pair → 409; rate-limit concurrency ≤5", async () => {
    const app = await buildTestApp();
    const reporter = await seedUser();
    const accused = await seedUser();
    const p = () => app.inject({ method: "POST", url: "/api/reports", headers: { cookie: authFor({ sub: reporter.id }) }, payload: { accusedId: accused.id, reason: "SPAM", context: "profile", note: "n" } });
    const first = await p();
    expect(first.statusCode).toBe(200);
    const dup = await p();
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe("ALREADY_REPORTED");
    // rate-limit: fire many at DIFFERENT accused concurrently, expect ≤5 created total this hour
    const others = await Promise.all(Array.from({ length: 8 }, () => seedUser()));
    await Promise.all(others.map((o) => app.inject({ method: "POST", url: "/api/reports", headers: { cookie: authFor({ sub: reporter.id }) }, payload: { accusedId: o.id, reason: "SPAM", context: "profile", note: "n" } })));
    const count = await prisma.report.count({ where: { reporterId: reporter.id } });
    expect(count).toBeLessThanOrEqual(5);
    await app.close();
  });
});
