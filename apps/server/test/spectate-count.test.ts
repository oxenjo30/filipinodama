import { describe, it, expect, afterEach, afterAll } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server as IOServer } from "socket.io";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { EV } from "@dama/shared";
import { prisma } from "../src/db/client.js";
import { registerPresence } from "../src/realtime/presence.js";
import { registerMatch } from "../src/realtime/match.js";
import { registerRooms } from "../src/realtime/rooms.js";
import { signAccess, verifyAccess } from "../src/auth/tokens.js";
import { seedUser, truncateAll } from "./helpers.js";

/**
 * Real spectator counts (v3 delta W5): a live match's viewer count must reflect
 * exactly the number of distinct users currently spectating it — never seeded,
 * never bumped by anything but a genuine join/leave/disconnect. Drives the REAL
 * socket handlers end-to-end (same harness as rooms-start-leave.test.ts), for
 * both entry paths: by-id (EV.spectateJoin/Leave, the Watch page) and by-room-code
 * (EV.roomSpectate, a late spectator on an already-live room match).
 */

async function startRealtimeServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const http: HttpServer = createServer();
  const io = new IOServer(http, { path: "/rt" });
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("unauthorized"));
    try {
      socket.data.userId = verify(token);
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });
  io.on("connection", (socket) => {
    registerPresence(io, socket);
    registerMatch(io, socket);
    registerRooms(io, socket);
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

function verify(token: string): string {
  return verifyAccess(token).sub;
}

function connect(url: string, userId: string): ClientSocket {
  return ioClient(url, { path: "/rt", auth: { token: signAccess({ sub: userId, isGuest: false, adminRole: null }) }, transports: ["websocket"], forceNew: true });
}

/** Resolve once `event` fires on `socket`, or reject after `ms`. */
function waitFor<T = unknown>(socket: ClientSocket, event: string, ms = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    socket.once(event, (p: T) => {
      clearTimeout(t);
      resolve(p);
    });
  });
}

/** Wait for a spectateCount broadcast whose viewers matches `n` (there can be an
 *  earlier transitional count on the way, e.g. 0→1→match resync), or time out. */
function waitForCount(socket: ClientSocket, n: number, ms = 3000): Promise<{ matchId: string; viewers: number }> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for spectateCount=${n}`)), ms);
    const on = (p: { matchId: string; viewers: number }) => {
      if (p.viewers === n) {
        clearTimeout(t);
        socket.off(EV.spectateCount, on);
        resolve(p);
      }
    };
    socket.on(EV.spectateCount, on);
  });
}

let servers: Array<{ close: () => Promise<void> }> = [];
let sockets: ClientSocket[] = [];

afterEach(async () => {
  for (const s of sockets) s.disconnect();
  sockets = [];
  for (const srv of servers) await srv.close();
  servers = [];
  await truncateAll();
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("real spectator counts", () => {
  it("by-id spectate: join fires spectateCount=1, leave fires spectateCount=0", async () => {
    const server = await startRealtimeServer();
    servers.push(server);
    const red = await seedUser();
    const blue = await seedUser();
    const watcher = await seedUser();

    const redSock = connect(server.url, red.id);
    const blueSock = connect(server.url, blue.id);
    sockets.push(redSock, blueSock);
    await Promise.all([waitFor(redSock, "connect"), waitFor(blueSock, "connect")]);

    // Pair the two into a real live match via a private room (host=red, guest=blue).
    redSock.emit(EV.roomCreate, {});
    const created = await waitFor<{ code: string }>(redSock, EV.roomState);
    blueSock.emit(EV.roomJoin, { code: created.code });
    await waitForState(redSock, (p) => !!(p as { guest?: unknown }).guest);

    const redStart = waitFor<{ matchId: string }>(redSock, EV.roomStart);
    redSock.emit(EV.roomStart);
    const { matchId } = await redStart;
    await waitFor(blueSock, EV.roomStart); // let blue's roomStart settle too

    // Watcher joins the match by id (the Watch / Live Matches page flow).
    const watchSock = connect(server.url, watcher.id);
    sockets.push(watchSock);
    await waitFor(watchSock, "connect");

    const redSeesJoin = waitForCount(redSock, 1);
    watchSock.emit(EV.spectateJoin, { matchId });
    await waitFor(watchSock, EV.matchState); // confirms the spectator actually joined read-only
    const joined = await redSeesJoin;
    expect(joined.matchId).toBe(matchId);
    expect(joined.viewers).toBe(1);

    // Leaving drops the count back to 0, broadcast to the match room.
    const redSeesLeave = waitForCount(redSock, 0);
    watchSock.emit(EV.spectateLeave, { matchId });
    const left = await redSeesLeave;
    expect(left.viewers).toBe(0);
  }, 15000);

  it("by-id spectate: a dropped socket (disconnect, no explicit leave) also drops the count to 0", async () => {
    const server = await startRealtimeServer();
    servers.push(server);
    const red = await seedUser();
    const blue = await seedUser();
    const watcher = await seedUser();

    const redSock = connect(server.url, red.id);
    const blueSock = connect(server.url, blue.id);
    sockets.push(redSock, blueSock);
    await Promise.all([waitFor(redSock, "connect"), waitFor(blueSock, "connect")]);

    redSock.emit(EV.roomCreate, {});
    const created = await waitFor<{ code: string }>(redSock, EV.roomState);
    blueSock.emit(EV.roomJoin, { code: created.code });
    await waitForState(redSock, (p) => !!(p as { guest?: unknown }).guest);
    const redStart = waitFor<{ matchId: string }>(redSock, EV.roomStart);
    redSock.emit(EV.roomStart);
    const { matchId } = await redStart;
    await waitFor(blueSock, EV.roomStart);

    const watchSock = connect(server.url, watcher.id);
    await waitFor(watchSock, "connect");
    const redSeesJoin = waitForCount(redSock, 1);
    watchSock.emit(EV.spectateJoin, { matchId });
    await waitFor(watchSock, EV.matchState);
    await redSeesJoin;

    // Disconnect WITHOUT emitting spectateLeave — mirrors a closed tab / dropped
    // connection. The server must still notice and drop the count.
    const redSeesDrop = waitForCount(redSock, 0);
    watchSock.disconnect();
    const dropped = await redSeesDrop;
    expect(dropped.viewers).toBe(0);
  }, 15000);

  it("room-code spectate (late join on a live room match) counts toward the same real total via listOpenRooms()", async () => {
    const server = await startRealtimeServer();
    servers.push(server);
    const red = await seedUser();
    const blue = await seedUser();
    const watcher = await seedUser();

    const redSock = connect(server.url, red.id);
    const blueSock = connect(server.url, blue.id);
    sockets.push(redSock, blueSock);
    await Promise.all([waitFor(redSock, "connect"), waitFor(blueSock, "connect")]);

    redSock.emit(EV.roomCreate, {});
    const created = await waitFor<{ code: string }>(redSock, EV.roomState);
    const code = created.code;
    blueSock.emit(EV.roomJoin, { code });
    await waitForState(redSock, (p) => !!(p as { guest?: unknown }).guest);
    const redStart = waitFor<{ matchId: string }>(redSock, EV.roomStart);
    redSock.emit(EV.roomStart);
    const { matchId } = await redStart;
    await waitFor(blueSock, EV.roomStart);

    // A late spectator joins by ROOM CODE (not by matchId) — the roomSpectate path.
    const watchSock = connect(server.url, watcher.id);
    sockets.push(watchSock);
    await waitFor(watchSock, "connect");
    const redSeesJoin = waitForCount(redSock, 1);
    const specStart = waitFor<{ matchId: string; yourColor: string | null }>(watchSock, EV.roomStart);
    watchSock.emit(EV.roomSpectate, { code });
    const spec = await specStart;
    expect(spec.matchId).toBe(matchId);
    expect(spec.yourColor).toBeNull();
    const joined = await redSeesJoin;
    expect(joined.viewers).toBe(1);

    // listOpenRooms() (exercised indirectly here via the REST-facing contract:
    // the same spectatorCount the module reads) must report the same real count.
    const { spectatorCount } = await import("../src/realtime/match.js");
    expect(spectatorCount(matchId)).toBe(1);
  }, 15000);
});

/** Wait for a roomState broadcast that satisfies `pred` (mirrors rooms-start-leave.test.ts). */
function waitForState(socket: ClientSocket, pred: (p: unknown) => boolean, ms = 3000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout waiting for roomState")), ms);
    const on = (p: unknown) => {
      if (pred(p)) {
        clearTimeout(t);
        socket.off(EV.roomState, on);
        resolve(p);
      }
    };
    socket.on(EV.roomState, on);
  });
}
