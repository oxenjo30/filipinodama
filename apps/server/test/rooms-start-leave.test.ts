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
 * Regression test for the "match ends the instant it starts" / "spectate a
 * non-existent room" bug.
 *
 * Repro (from the field): host creates a private room, a guest joins by the
 * invite link, the host clicks Start — and the game immediately shows
 * "Connection Lost / 0 moves", while the room's spectate link stops resolving.
 *
 * Root cause: clicking Start navigates the room page → /play/online, which
 * unmounts the page and fires the room `leave()` for the host. The old
 * removeMember() forfeited the just-started match to the guest AND deleted the
 * room. Deleting the live match before the host's match page could resync into
 * it surfaced as "no-such-match" → the interrupted end; deleting the room broke
 * the spectate link.
 *
 * Fix: once a match has started, leaving the room never settles/forfeits the
 * match (match.ts owns its lifecycle, incl. real-disconnect abandonment) and
 * never destroys the room (it's kept alive for spectators and reclaimed when the
 * match ends). This test drives the REAL socket handlers end-to-end.
 */

// A minimal realtime server wiring ONLY the handlers this bug touches (presence
// must run first — it joins presence:<userId>, which roomStart targets).
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

// Verify the test token → userId (mirrors index.ts authenticate, minus the DB
// ban/delete check which these freshly-seeded users pass trivially).
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

/** Assert `event` does NOT fire on `socket` within `ms` (proves the match did not end). */
function expectNo(socket: ClientSocket, event: string, ms = 800): Promise<void> {
  return new Promise((resolve, reject) => {
    const onEvent = (p: unknown) => reject(new Error(`unexpected ${event}: ${JSON.stringify(p)}`));
    socket.once(event, onEvent);
    setTimeout(() => {
      socket.off(event, onEvent);
      resolve();
    }, ms);
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

describe("private room: host leaving after Start", () => {
  it("does NOT end the match, and keeps the room alive so spectating still works", async () => {
    const server = await startRealtimeServer();
    servers.push(server);
    const host = await seedUser();
    const guest = await seedUser();
    const watcher = await seedUser();

    const hostSock = connect(server.url, host.id);
    const guestSock = connect(server.url, guest.id);
    sockets.push(hostSock, guestSock);
    await Promise.all([waitFor(hostSock, "connect"), waitFor(guestSock, "connect")]);

    // Host creates the room, guest joins by code.
    hostSock.emit(EV.roomCreate, {});
    const created = await waitFor<{ code: string }>(hostSock, EV.roomState);
    const code = created.code;
    expect(code).toBeTruthy();

    guestSock.emit(EV.roomJoin, { code });
    // Wait until the host sees the guest seated (roomState with guest set).
    await waitForState(hostSock, (p) => !!(p as { guest?: unknown }).guest);

    // Host starts → both receive roomStart with a real matchId + colours.
    const hostStart = waitFor<{ matchId: string; yourColor: string }>(hostSock, EV.roomStart);
    const guestStart = waitFor<{ matchId: string; yourColor: string }>(guestSock, EV.roomStart);
    hostSock.emit(EV.roomStart);
    const [hs, gs] = await Promise.all([hostStart, guestStart]);
    expect(hs.matchId).toBe(gs.matchId);
    expect(hs.yourColor).toBe("red");
    expect(gs.yourColor).toBe("blue");
    const matchId = hs.matchId;

    // The guest (still connected, now "in the match") must NOT receive matchEnded
    // when the host leaves the ROOM (navigating into /play/online). This is the
    // core regression: previously host-leave forfeited the match to the guest.
    const noEnd = expectNo(guestSock, EV.matchEnded, 900);
    hostSock.emit(EV.roomLeave); // simulates the room page unmount → leave()
    await noEnd;

    // The match is still LIVE: a resync returns real state (not "no-such-match").
    hostSock.emit(EV.matchResync, { matchId });
    const state = await waitFor<{ matchId: string; yourColor: string | null }>(hostSock, EV.matchState);
    expect(state.matchId).toBe(matchId);
    expect(state.yourColor).toBe("red");

    // The room still exists → a late spectator's code resolves and they are put
    // into the match read-only (roomStart with yourColor:null). Previously the
    // room was deleted on host-leave, so this silently did nothing.
    const watchSock = connect(server.url, watcher.id);
    sockets.push(watchSock);
    await waitFor(watchSock, "connect");
    const specStart = waitFor<{ matchId: string; yourColor: string | null }>(watchSock, EV.roomStart);
    watchSock.emit(EV.roomSpectate, { code });
    const spec = await specStart;
    expect(spec.matchId).toBe(matchId);
    expect(spec.yourColor).toBeNull();
  }, 15000);
});

/** Wait for a roomState broadcast that satisfies `pred`. */
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
