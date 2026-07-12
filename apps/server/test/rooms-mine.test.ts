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
 * GET /api/rooms/mine (v3 delta W6 — resume active private room on /rooms
 * entry). `rooms.ts` keeps its host/guest/userRoom state in a module-level
 * singleton, so driving a room through the real socket handlers here and then
 * hitting the REST endpoint in the same process exercises the actual
 * myRoomCode() -> modules/rooms.ts wiring end-to-end (same harness as
 * matches-live-rooms.test.ts / rooms-start-leave.test.ts).
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

describe("GET /api/rooms/mine", () => {
  it("returns the host's active room code after creating a room via socket", async () => {
    const server = await startRealtimeServer();
    servers.push(server);
    const host = await seedUser();
    const hostSock = connect(server.url, host.id);
    sockets.push(hostSock);
    await waitFor(hostSock, "connect");

    hostSock.emit(EV.roomCreate, {});
    const created = await waitFor<{ code: string }>(hostSock, EV.roomState);
    expect(created.code).toBeTruthy();

    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/rooms/mine", headers: { cookie: authFor({ sub: host.id }) } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ code: created.code });
    await app.close();
  }, 15000);

  it("returns null for a different user who is not in any room", async () => {
    const server = await startRealtimeServer();
    servers.push(server);
    const host = await seedUser();
    const hostSock = connect(server.url, host.id);
    sockets.push(hostSock);
    await waitFor(hostSock, "connect");

    hostSock.emit(EV.roomCreate, {});
    await waitFor(hostSock, EV.roomState);

    const app = await buildTestApp();
    const other = await seedUser();
    const res = await app.inject({ method: "GET", url: "/api/rooms/mine", headers: { cookie: authFor({ sub: other.id }) } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ code: null });
    await app.close();
  }, 15000);

  it("401s when unauthenticated", async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/rooms/mine" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
