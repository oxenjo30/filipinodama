import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server as IOServer } from "socket.io";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { EV } from "@dama/shared";
import { registerPresence } from "../src/realtime/presence.js";
import { registerMatchmaking } from "../src/realtime/matchmaking.js";
import { signAccess, verifyAccess } from "../src/auth/tokens.js";
import { redis } from "../src/realtime/store.js";

/**
 * OWNER-REPORTED (2026-08-04, web, RANKED): "I queue for a ranked match and no
 * bot ever fills after the 7-20s wait." A prior fix (4b93762) made the mmFound
 * DELIVERY multi-socket-safe, but the queue TEARDOWN still assumed one socket
 * per user: registerMatchmaking's `disconnect` handler calls leaveAllQueues()
 * unconditionally, keyed by userId.
 *
 * A user routinely holds MORE THAN ONE socket (a second tab, phone + web, or a
 * reconnect whose predecessor hasn't timed out yet — the earlier bug report
 * found NINE on one account). When any one of those sockets closes, the handler
 * dequeues the user and cancels the pending `bot-fill` job for ALL of them, even
 * though the player is still connected and still staring at "Finding opponent".
 * Nothing re-arms it and no mm:cancelled is sent, so they wait forever.
 *
 * These tests drive the REAL matchmaking handler over real sockets and assert on
 * the real Redis state (queue pointer + the rt:jobs:byKey schedule entry). They
 * deliberately touch NO Postgres: mm:join is a pure Redis path (tryMatch only
 * reaches the DB once two players are queued, and presence's DB writes are
 * fire-and-forget/caught), so this suite runs against Redis alone.
 */

const BOT_FILL_KEY = (userId: string) => `bot-fill:${userId}`;

async function startRealtimeServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const http: HttpServer = createServer();
  const io = new IOServer(http, { path: "/rt" });
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("unauthorized"));
    try {
      socket.data.userId = verifyAccess(token).sub;
      socket.data.device = "web";
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });
  io.on("connection", (socket) => {
    // Same order as registerRealtime(): presence first (joins presence:<userId>).
    registerPresence(io, socket);
    registerMatchmaking(io, socket);
  });
  await new Promise<void>((resolve) => http.listen(0, resolve));
  const port = (http.address() as AddressInfo).port;
  return {
    url: `http://localhost:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        io.close();
        http.close(() => resolve());
      }),
  };
}

function connect(url: string, userId: string): ClientSocket {
  return ioClient(url, {
    path: "/rt",
    auth: { token: signAccess({ sub: userId, isGuest: false, adminRole: null }) },
    transports: ["websocket"],
    forceNew: true,
  });
}

function waitFor<T = unknown>(socket: ClientSocket, event: string, ms = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    socket.once(event, (p: T) => {
      clearTimeout(t);
      resolve(p as T);
    });
  });
}

/** Poll until `fn()` is true or `ms` elapses. Returns the final observed value. */
async function settle(ms = 500): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/** The realtime state that decides whether a bot will ever fill this player. */
async function queueState(userId: string) {
  const [queuedIn, job] = await Promise.all([
    redis.get(`rt:queuedIn:${userId}`),
    redis.hget("rt:jobs:byKey", BOT_FILL_KEY(userId)),
  ]);
  return { queuedIn, botFillScheduled: job !== null };
}

async function flushRt(): Promise<void> {
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", "rt:*", "COUNT", 500);
    cursor = next;
    if (keys.length) await redis.del(...keys);
  } while (cursor !== "0");
}

let servers: Array<{ close: () => Promise<void> }> = [];
let sockets: ClientSocket[] = [];

beforeEach(async () => {
  await flushRt();
});

afterEach(async () => {
  for (const s of sockets) s.disconnect();
  sockets = [];
  for (const srv of servers) await srv.close();
  servers = [];
  await flushRt();
});

describe("matchmaking bot-fill survives a multi-socket user", () => {
  it("arms a bot-fill job when a lone player queues for RANKED", async () => {
    const server = await startRealtimeServer();
    servers.push(server);
    const userId = `u_solo_${process.pid}`;

    const sock = connect(server.url, userId);
    sockets.push(sock);
    await waitFor(sock, "connect");

    const searching = waitFor(sock, EV.mmSearching);
    sock.emit(EV.mmJoin, { mode: "RANKED" });
    await searching;
    await settle(200);

    const st = await queueState(userId);
    expect(st.queuedIn).toBe("RANKED");
    expect(st.botFillScheduled).toBe(true);
  }, 15000);

  it("KEEPS the player queued and the bot-fill armed when ONE of their other sockets drops", async () => {
    const server = await startRealtimeServer();
    servers.push(server);
    const userId = `u_multi_${process.pid}`;

    // The socket the player is actually looking at…
    const active = connect(server.url, userId);
    // …plus a second live socket for the SAME account (second tab / stale
    // reconnect predecessor). Both join presence:<userId>.
    const other = connect(server.url, userId);
    sockets.push(active, other);
    await Promise.all([waitFor(active, "connect"), waitFor(other, "connect")]);

    const searching = waitFor(active, EV.mmSearching);
    active.emit(EV.mmJoin, { mode: "RANKED" });
    await searching;
    await settle(200);

    // Precondition: the player is queued with a pending bot-fill.
    const before = await queueState(userId);
    expect(before.queuedIn).toBe("RANKED");
    expect(before.botFillScheduled).toBe(true);

    // The OTHER socket dies. The player is still connected on `active` and is
    // still watching "Finding opponent" — their queue entry must survive.
    other.disconnect();
    await settle(600);

    expect(active.connected).toBe(true);
    const after = await queueState(userId);
    expect(after.queuedIn).toBe("RANKED");
    expect(after.botFillScheduled).toBe(true);
  }, 15000);

  it("still dequeues + cancels bot-fill when the player's LAST socket drops", async () => {
    const server = await startRealtimeServer();
    servers.push(server);
    const userId = `u_last_${process.pid}`;

    const sock = connect(server.url, userId);
    sockets.push(sock);
    await waitFor(sock, "connect");

    const searching = waitFor(sock, EV.mmSearching);
    sock.emit(EV.mmJoin, { mode: "RANKED" });
    await searching;
    await settle(200);
    expect((await queueState(userId)).botFillScheduled).toBe(true);

    sock.disconnect();
    await settle(600);

    const after = await queueState(userId);
    expect(after.queuedIn).toBeNull();
    expect(after.botFillScheduled).toBe(false);
  }, 15000);
});
