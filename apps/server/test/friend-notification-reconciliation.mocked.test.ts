import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  callerId: "player-a",
  events: [] as string[],
  friendRequestFindMany: vi.fn(),
  notificationFindMany: vi.fn(),
  notificationCount: vi.fn(),
  notificationUpdateMany: vi.fn(),
  friendRequestFindUnique: vi.fn(),
  friendRequestUpdate: vi.fn(),
  friendshipUpsert: vi.fn(),
  notificationCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../src/db/client.js", () => ({
  prisma: {
    friendRequest: {
      findMany: mocked.friendRequestFindMany,
      findUnique: mocked.friendRequestFindUnique,
      update: mocked.friendRequestUpdate,
    },
    friendship: { upsert: mocked.friendshipUpsert },
    notification: {
      findMany: mocked.notificationFindMany,
      count: mocked.notificationCount,
      updateMany: mocked.notificationUpdateMany,
      create: mocked.notificationCreate,
    },
    $transaction: mocked.transaction,
  },
}));

vi.mock("../src/auth/guards.js", () => ({
  requireAuth: async (req: { userId?: string }) => {
    req.userId = mocked.callerId;
  },
}));

vi.mock("../src/modules/blocks.js", () => ({ isBlockedBetween: vi.fn(async () => false) }));
vi.mock("../src/lib/notify.js", () => ({ pushUnreadCount: vi.fn(async () => undefined) }));
vi.mock("../src/realtime/store.js", () => ({ matchIdsForUser: vi.fn(async () => []) }));

import { notificationRoutes } from "../src/modules/notifications.js";
import { friendRoutes } from "../src/modules/friends.js";

const notification = (id: string, requestId: string, type = "friend_request") => ({
  id,
  type,
  title: "Friend request",
  body: null,
  data: { requestId },
  readAt: null,
  createdAt: new Date("2026-09-08T09:00:00.000Z"),
});

describe("stale friend-request notification reconciliation", () => {
  beforeEach(() => {
    mocked.callerId = "player-a";
    mocked.events.length = 0;
    vi.clearAllMocks();
    mocked.friendRequestFindMany.mockImplementation(async () => {
      mocked.events.push("resolved");
      return [{ id: "accepted-for-a" }, { id: "declined-for-a" }];
    });
    mocked.notificationUpdateMany.mockImplementation(async () => {
      mocked.events.push("dismiss");
      return { count: 1 };
    });
    mocked.notificationFindMany.mockImplementation(async () => {
      mocked.events.push("feed");
      return [
        notification("accepted-notification", "accepted-for-a"),
        notification("friend-accept-status", "accepted-for-a", "friend_accept"),
        notification("pending-notification", "pending-for-a"),
        notification("next-page-notification", "declined-for-a"),
      ];
    });
    mocked.notificationCount.mockImplementation(async () => {
      mocked.events.push("count");
      return 1;
    });
    mocked.friendRequestUpdate.mockResolvedValue({});
    mocked.friendshipUpsert.mockResolvedValue({});
    mocked.notificationCreate.mockResolvedValue({});
    mocked.transaction.mockImplementation(async (operations: Promise<unknown>[]) => Promise.all(operations));
  });

  it("bounds reconciliation to the raw page and preserves its pagination when resolved rows are filtered", async () => {
    const app = Fastify();
    await notificationRoutes(app);

    const response = await app.inject({ method: "GET", url: "/notifications?limit=3" });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      unreadCount: 1,
      notifications: [{ id: "friend-accept-status" }, { id: "pending-notification" }],
      hasMore: true,
      nextCursor: "pending-notification",
    });
    expect(mocked.friendRequestFindMany).toHaveBeenCalledWith({
      where: {
        toId: "player-a",
        id: { in: ["accepted-for-a", "pending-for-a", "declined-for-a"] },
        status: { in: ["accepted", "declined"] },
      },
      select: { id: true },
    });
    expect(mocked.notificationUpdateMany).toHaveBeenCalledTimes(1);
    expect(mocked.notificationUpdateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["accepted-notification", "next-page-notification"] },
        userId: "player-a",
        type: "friend_request",
        dismissedAt: null,
      },
      data: { dismissedAt: expect.any(Date) },
    });
    expect(mocked.notificationUpdateMany.mock.calls[0]![0].where).not.toEqual(
      {
        id: { in: ["pending-notification"] },
        userId: "player-a",
        type: "friend_request",
        dismissedAt: null,
      },
    );
    expect(mocked.events).toEqual([
      "feed",
      "resolved",
      "dismiss",
      "count",
    ]);
    await app.close();
  });

  it.each([
    ["accept", "accepted"],
    ["decline", "declined"],
  ] as const)("%s includes the state change and matching dismissal in one transaction", async (action, status) => {
    mocked.friendRequestFindUnique.mockResolvedValue({
      id: "request-for-a",
      fromId: "player-b",
      toId: "player-a",
      status: "pending",
    });
    const app = Fastify();
    await friendRoutes(app);

    const response = await app.inject({
      method: "POST",
      url: `/friends/request/request-for-a/${action}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({ status });
    expect(mocked.transaction).toHaveBeenCalledTimes(1);
    const operations = mocked.transaction.mock.calls[0]![0] as Promise<unknown>[];
    expect(operations).toContain(mocked.friendRequestUpdate.mock.results[0]!.value);
    expect(operations).toContain(mocked.notificationUpdateMany.mock.results[0]!.value);
    expect(operations).toHaveLength(status === "accepted" ? 3 : 2);
    expect(mocked.notificationUpdateMany).toHaveBeenCalledWith({
      where: {
        userId: "player-a",
        type: "friend_request",
        dismissedAt: null,
        data: { path: ["requestId"], equals: "request-for-a" },
      },
      data: { dismissedAt: expect.any(Date) },
    });
    await app.close();
  });

  it("does not emit the acceptance notification when the grouped transaction fails", async () => {
    mocked.friendRequestFindUnique.mockResolvedValue({
      id: "request-for-a",
      fromId: "player-b",
      toId: "player-a",
      status: "pending",
    });
    mocked.transaction.mockRejectedValueOnce(new Error("rollback"));
    const app = Fastify();
    await friendRoutes(app);

    const response = await app.inject({ method: "POST", url: "/friends/request/request-for-a/accept" });

    expect(response.statusCode).toBe(500);
    expect(mocked.transaction).toHaveBeenCalledTimes(1);
    expect(mocked.notificationCreate).not.toHaveBeenCalled();
    await app.close();
  });
});
