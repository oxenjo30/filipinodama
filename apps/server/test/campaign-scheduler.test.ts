import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { runDueCampaigns } from "../src/modules/campaign-scheduler.js";
import { seedUser, truncateAll } from "./helpers.js";

// Clean up Campaign + Notification rows THIS file creates, matching the
// admin-campaigns.test.ts pattern — otherwise a leftover "announcement"
// Notification/Campaign row here would pollute another test file's counts.
afterEach(async () => {
  await prisma.notification.deleteMany({});
  await prisma.campaign.deleteMany({});
  await truncateAll();
});
afterAll(async () => {
  await prisma.$disconnect();
});

async function seedScheduled(admin: { id: string }, opts: { scheduledFor: Date; title?: string; segment?: string }) {
  return prisma.campaign.create({
    data: {
      title: opts.title ?? "Sched",
      body: "body",
      segment: opts.segment ?? "all",
      status: "scheduled",
      channel: "in-app",
      scheduledFor: opts.scheduledFor,
      reach: 0,
      sentById: admin.id,
      sentByName: "Admin#1000",
    },
  });
}

describe("campaign-scheduler", () => {
  it("sends a scheduled campaign whose scheduledFor is in the past", async () => {
    const admin = await seedUser({ adminRole: "ECONOMY" });
    await seedUser(); // 1 real player target
    const camp = await seedScheduled(admin, { scheduledFor: new Date(Date.now() - 60_000), title: "Due" });

    await runDueCampaigns(new Date());

    const after = await prisma.campaign.findUnique({ where: { id: camp.id } });
    expect(after!.status).toBe("sent");
    expect(after!.reach).toBeGreaterThan(0);
    expect(await prisma.notification.count({ where: { type: "announcement", title: "Due" } })).toBe(after!.reach);
  });

  it("leaves a scheduled campaign whose scheduledFor is in the future untouched", async () => {
    const admin = await seedUser({ adminRole: "ECONOMY" });
    await seedUser();
    const camp = await seedScheduled(admin, { scheduledFor: new Date(Date.now() + 3_600_000), title: "Future" });

    await runDueCampaigns(new Date());

    const after = await prisma.campaign.findUnique({ where: { id: camp.id } });
    expect(after!.status).toBe("scheduled");
    expect(after!.reach).toBe(0);
    expect(await prisma.notification.count({ where: { title: "Future" } })).toBe(0);
  });

  it("does not touch draft or already-sent campaigns", async () => {
    const admin = await seedUser({ adminRole: "ECONOMY" });
    await seedUser();
    const draft = await prisma.campaign.create({
      data: { title: "D", body: "b", segment: "all", status: "draft", channel: "in-app", reach: 0, sentById: admin.id, sentByName: "Admin#1000" },
    });
    const sent = await prisma.campaign.create({
      data: { title: "S", body: "b", segment: "all", status: "sent", channel: "in-app", reach: 5, sentById: admin.id, sentByName: "Admin#1000" },
    });

    await runDueCampaigns(new Date());

    expect((await prisma.campaign.findUnique({ where: { id: draft.id } }))!.status).toBe("draft");
    const sentAfter = await prisma.campaign.findUnique({ where: { id: sent.id } });
    expect(sentAfter!.status).toBe("sent");
    expect(sentAfter!.reach).toBe(5); // untouched, not re-fanned-out
  });

  it("concurrent runs send exactly once (no double notifications)", async () => {
    const admin = await seedUser({ adminRole: "ECONOMY" });
    await seedUser();
    await seedUser();
    const camp = await seedScheduled(admin, { scheduledFor: new Date(Date.now() - 60_000), title: "Concurrent" });

    await Promise.all([runDueCampaigns(new Date()), runDueCampaigns(new Date())]);

    const after = await prisma.campaign.findUnique({ where: { id: camp.id } });
    expect(after!.status).toBe("sent");
    expect(await prisma.notification.count({ where: { type: "announcement", title: "Concurrent" } })).toBe(after!.reach);
  });

  it("one campaign failing (empty segment) doesn't block another due campaign from sending", async () => {
    const admin = await seedUser({ adminRole: "ECONOMY" });
    await seedUser();
    // rank:star-guardian matches nobody -> sendCampaign throws EMPTY_SEGMENT for this one
    const empty = await seedScheduled(admin, { scheduledFor: new Date(Date.now() - 60_000), title: "EmptySeg", segment: "rank:star-guardian" });
    const good = await seedScheduled(admin, { scheduledFor: new Date(Date.now() - 60_000), title: "GoodSeg" });

    await runDueCampaigns(new Date());

    const emptyAfter = await prisma.campaign.findUnique({ where: { id: empty.id } });
    const goodAfter = await prisma.campaign.findUnique({ where: { id: good.id } });
    expect(goodAfter!.status).toBe("sent");
    expect(goodAfter!.reach).toBeGreaterThan(0);
    // failed one should not be left claimed-forever as "sending" — and must not be "sent"
    expect(emptyAfter!.status).not.toBe("sent");
  });
});
