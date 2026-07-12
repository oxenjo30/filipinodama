import { describe, it, expect, afterEach, afterAll } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server as IOServer } from "socket.io";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { EV } from "@dama/shared";
import { prisma } from "../src/db/client.js";
import { registerPresence } from "../src/realtime/presence.js";
import { registerMatchmaking } from "../src/realtime/matchmaking.js";
import { registerMatch } from "../src/realtime/match.js";
import { classifyDevice } from "../src/realtime/index.js";
import { signAccess, verifyAccess } from "../src/auth/tokens.js";
import { seedUser, truncateAll } from "./helpers.js";

/**
 * Opponent device on the Match Found reveal (v3 delta W3, Row 4-6): each
 * mmFound payload's `opponent.device` must reflect the OPPONENT's real
 * UA-classified device, not a fabricated/static value. Drives the REAL
 * matchmaking handler end-to-end (same harness style as spectate-count.test.ts
 * / rooms-start-leave.test.ts).
 *
 * Device capture lives in the io.use() handshake guard in realtime/index.ts
 * (classifyDevice(userAgent) → socket.data.device), which registerRealtime()
 * wires for the real server. These tests build their own minimal server (per
 * the existing harness convention — see spectate-count.test.ts) and replicate
 * that same guard, calling the exported classifyDevice so the classification
 * logic under test is the real production function, not a re-implementation.
 *
 * UA delivery: socket.io-client's `extraHeaders` option sets the User-Agent
 * header on the handshake request; verified against this server's websocket
 * transport (Node's ws client honours extraHeaders) that
 * socket.handshake.headers["user-agent"] on the server sees exactly what the
 * client sent — see the classifyDevice mobile/web assertions below.
 */

async function startRealtimeServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const http: HttpServer = createServer();
  const io = new IOServer(http, { path: "/rt" });
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("unauthorized"));
    try {
      socket.data.userId = verify(token);
      // Mirrors realtime/index.ts's registerRealtime() guard: classify the
      // real handshake User-Agent via the production classifyDevice().
      socket.data.device = classifyDevice(socket.handshake.headers["user-agent"]);
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });
  io.on("connection", (socket) => {
    registerPresence(io, socket);
    registerMatchmaking(io, socket);
    registerMatch(io, socket);
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

/** Connect a test client, optionally spoofing its handshake User-Agent so the
 *  server-side classifyDevice() call in the io.use() guard above resolves it
 *  to a specific device ("mobile" vs the default "web"). */
function connect(url: string, userId: string, userAgent?: string): ClientSocket {
  return ioClient(url, {
    path: "/rt",
    auth: { token: signAccess({ sub: userId, isGuest: false, adminRole: null }) },
    transports: ["websocket"],
    forceNew: true,
    extraHeaders: userAgent ? { "User-Agent": userAgent } : undefined,
  });
}

/** Resolve once `event` fires on `socket`, or reject after `ms`. */
function waitFor<T = unknown>(socket: ClientSocket, event: string, ms = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    socket.once(event, (p: T) => {
      clearTimeout(t);
      resolve(p);
    });
  });
}

const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";

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

describe("matchmaking: opponent device on Match Found", () => {
  it("classifyDevice itself resolves the mapping used by the handshake guard", () => {
    expect(classifyDevice(MOBILE_UA)).toBe("mobile");
    expect(classifyDevice(DESKTOP_UA)).toBe("web");
    expect(classifyDevice("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe("tablet");
    expect(classifyDevice(undefined)).toBe("web");
  });

  it("each player sees the OPPONENT's real device in mmFound (mobile vs web), not their own", async () => {
    const server = await startRealtimeServer();
    servers.push(server);
    const mobileUser = await seedUser();
    const webUser = await seedUser();

    const mobileSock = connect(server.url, mobileUser.id, MOBILE_UA);
    const webSock = connect(server.url, webUser.id, DESKTOP_UA);
    sockets.push(mobileSock, webSock);
    await Promise.all([waitFor(mobileSock, "connect"), waitFor(webSock, "connect")]);

    type FoundPayload = { matchId: string; opponent: { device?: string } | null; yourColor: string };
    const mobileFound = waitFor<FoundPayload>(mobileSock, EV.mmFound);
    const webFound = waitFor<FoundPayload>(webSock, EV.mmFound);

    mobileSock.emit(EV.mmJoin, { mode: "CASUAL" });
    webSock.emit(EV.mmJoin, { mode: "CASUAL" });

    const [mobileResult, webResult] = await Promise.all([mobileFound, webFound]);

    // Same match paired both.
    expect(mobileResult.matchId).toBe(webResult.matchId);

    // The mobile-UA player's opponent (webUser) must show device "web".
    expect(mobileResult.opponent?.device).toBe("web");
    // The desktop-UA player's opponent (mobileUser) must show device "mobile".
    expect(webResult.opponent?.device).toBe("mobile");
  }, 15000);
});
