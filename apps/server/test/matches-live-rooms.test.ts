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
import { buildTestApp, seedUser, authFor, truncateAll } from "./helpers.js";

/**
 * GET /api/matches/live must surface open private rooms (a live room match, or
 * an unstarted lobby with a guest already seated) as synthetic entries at the
 * TOP of items, with a REAL viewers count — and must never double-list a
 * started room's match as a plain row too. `rooms.ts` keeps its room state in a
 * module-level singleton, so driving it through the real socket handlers here
 * and then hitting the REST endpoint in the same process exercises the actual
 * listOpenRooms() -> matches.ts wiring end-to-end.
 */

async function startRealtimeServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const http: HttpServer = createServer();
  const io = new IOServer(http, { path: "/rt" });
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("unauthorized"));
    try {
      socket.data.userId = verifyAccess(token).sub;
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

function connect(url: string, userId: string): ClientSocket {
  return ioClient(url, { path: "/rt", auth: { token: signAccess({ sub: userId, isGuest: false, adminRole: null }) }, transports: ["websocket"], forceNew: true });
}

function waitFor<T = unknown>(socket: ClientSocket, event: string, ms = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    socket.once(event, (p: T) => {
      clearTimeout(t);
      resolve(p);
    });
  });
}

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

describe("GET /api/matches/live — open private rooms", () => {
  it("surfaces a started room match at the top as a synthetic room entry with a real viewer count, and does not also list it as a plain match", async () => {
    const server = await startRealtimeServer();
    servers.push(server);
    const host = await seedUser();
    const guest = await seedUser();
    const watcher = await seedUser();

    const hostSock = connect(server.url, host.id);
    const guestSock = connect(server.url, guest.id);
    sockets.push(hostSock, guestSock);
    await Promise.all([waitFor(hostSock, "connect"), waitFor(guestSock, "connect")]);

    hostSock.emit(EV.roomCreate, {});
    const created = await waitFor<{ code: string }>(hostSock, EV.roomState);
    const code = created.code;
    guestSock.emit(EV.roomJoin, { code });
    await waitForState(hostSock, (p) => !!(p as { guest?: unknown }).guest);

    const hostStart = waitFor<{ matchId: string }>(hostSock, EV.roomStart);
    hostSock.emit(EV.roomStart);
    const { matchId } = await hostStart;
    await waitFor(guestSock, EV.roomStart);

    // A spectator watches by room code so the viewer count is real + nonzero.
    const watchSock = connect(server.url, watcher.id);
    sockets.push(watchSock);
    await waitFor(watchSock, "connect");
    watchSock.emit(EV.roomSpectate, { code });
    await waitFor(watchSock, EV.roomStart);

    // Give the spectateCount broadcast a tick to land server-side (state is
    // updated synchronously in addSpectatorSocket, so this is just being safe
    // against any event-loop ordering assumption).
    await new Promise((r) => setTimeout(r, 50));

    const app = await buildTestApp();
    const viewer = await seedUser();
    const res = await app.inject({ method: "GET", url: "/api/matches/live", headers: { cookie: authFor({ sub: viewer.id }) } });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;

    // The room entry is first, is marked room:true, carries the real code +
    // viewer count, and the underlying Match row is NOT also present as a plain item.
    expect(body.items.length).toBeGreaterThan(0);
    const first = body.items[0];
    expect(first.room).toBe(true);
    expect(first.id).toBe(`room-${code}`);
    expect(first.code).toBe(code);
    expect(first.viewers).toBe(1);
    expect(first.red.displayName).toBe(host.displayName);
    expect(first.blue.displayName).toBe(guest.displayName);

    const duplicate = body.items.find((it: { id: string }) => it.id === matchId);
    expect(duplicate).toBeUndefined();

    // Resign so the match settles → clearRoomForMatch reclaims the room
    // (module-level `rooms` state in rooms.ts persists across tests in this
    // file otherwise, since it's a singleton, not per-test).
    hostSock.emit(EV.matchResign, { matchId });
    await new Promise((r) => setTimeout(r, 100));

    await app.close();
  }, 15000);

  it("does not surface an unstarted lobby with only a host (nothing to watch yet)", async () => {
    const server = await startRealtimeServer();
    servers.push(server);
    const host = await seedUser();
    const hostSock = connect(server.url, host.id);
    sockets.push(hostSock);
    await waitFor(hostSock, "connect");
    hostSock.emit(EV.roomCreate, {});
    const created = await waitFor<{ code: string }>(hostSock, EV.roomState);

    const app = await buildTestApp();
    const viewer = await seedUser();
    const res = await app.inject({ method: "GET", url: "/api/matches/live", headers: { cookie: authFor({ sub: viewer.id }) } });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    // This specific host-only room must never appear — a lobby with nobody to
    // watch yet is not "open". (Scoped to THIS room's code rather than asserting
    // zero room items overall, since rooms.ts's module state is a singleton that
    // outlives any one test in this file.)
    expect(body.items.find((it: { id: string }) => it.id === `room-${created.code}`)).toBeUndefined();
    await app.close();
  }, 15000);
});
