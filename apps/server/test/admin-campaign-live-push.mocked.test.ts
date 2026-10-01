import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  targets: [] as { id: string }[],
  events: [] as string[],
  active: 0,
  maxActive: 0,
  createMany: vi.fn(),
  pushUnreadCount: vi.fn(),
}));

vi.mock("../src/db/client.js", () => ({
  prisma: {
    user: { findMany: vi.fn(async () => mocked.targets) },
    notification: { createMany: mocked.createMany },
  },
}));
vi.mock("../src/lib/notify.js", () => ({ pushUnreadCount: mocked.pushUnreadCount }));

import { fanOutNotifications } from "../src/modules/admin-campaigns.js";

describe("campaign live unread fan-out", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.events.length = 0;
    mocked.active = 0;
    mocked.maxActive = 0;
    mocked.targets = Array.from({ length: 1001 }, (_, index) => ({ id: `player-${index}` }));
    mocked.createMany.mockImplementation(async ({ data }: { data: { userId: string }[] }) => {
      mocked.events.push(`commit:${data[0].userId}:${data.length}`);
      return { count: data.length };
    });
    mocked.pushUnreadCount.mockImplementation(async (userId: string) => {
      mocked.active += 1;
      mocked.maxActive = Math.max(mocked.maxActive, mocked.active);
      await Promise.resolve();
      mocked.events.push(`push:${userId}`);
      mocked.active -= 1;
    });
  });

  it("persists each chunk before isolated recipient pushes and bounds concurrency", async () => {
    const reach = await fanOutNotifications("all", "Title", "Body");
    expect(reach).toBe(1001);
    expect(mocked.createMany).toHaveBeenCalledTimes(2);
    expect(mocked.pushUnreadCount).toHaveBeenCalledTimes(1001);
    expect(new Set(mocked.pushUnreadCount.mock.calls.map(([id]) => id)).size).toBe(1001);
    expect(mocked.events[0]).toBe("commit:player-0:1000");
    expect(mocked.events.indexOf("commit:player-1000:1")).toBeGreaterThan(mocked.events.indexOf("push:player-999"));
    expect(mocked.maxActive).toBeGreaterThan(1);
    expect(mocked.maxActive).toBeLessThanOrEqual(25);
  });

  it("continues every recipient attempt when one live badge push rejects", async () => {
    mocked.pushUnreadCount.mockImplementation(async (userId: string) => {
      mocked.active += 1;
      mocked.maxActive = Math.max(mocked.maxActive, mocked.active);
      try {
        await Promise.resolve();
        mocked.events.push(`push:${userId}`);
        if (userId === "player-17") throw new Error("socket unavailable");
      } finally {
        mocked.active -= 1;
      }
    });

    await expect(fanOutNotifications("all", "Title", "Body")).resolves.toBe(1001);
    expect(mocked.createMany).toHaveBeenCalledTimes(2);
    expect(mocked.pushUnreadCount).toHaveBeenCalledTimes(1001);
    expect(new Set(mocked.pushUnreadCount.mock.calls.map(([id]) => id)).size).toBe(1001);
    expect(mocked.events).toContain("push:player-17");
    expect(mocked.events).toContain("push:player-1000");
  });
});
