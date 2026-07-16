import type { Server as IOServer, Socket } from "socket.io";
import type { RtJobType, RtJobHandler } from "./jobs.js";
import { verifyAccess, COOKIE } from "../auth/tokens.js";
import { prisma } from "../db/client.js";
import { registerMatchmaking } from "./matchmaking.js";
import { registerMatch, handleAbandonForfeit, handleBotMove } from "./match.js";
import { registerDamathMatchmaking } from "./damath-matchmaking.js";
import { registerDamathMatch } from "./damath-match.js";
import { registerDamathRooms } from "./damath-rooms.js";
import { registerGuildChat } from "./guild-chat.js";
import { registerPresence } from "./presence.js";
import { registerRooms } from "./rooms.js";
import { setIO } from "./io.js";

/**
 * Realtime entrypoint. Each ROADMAP feature registers its handlers here:
 *  - matchmaking (mm:*)   → ./matchmaking
 *  - match play (match:*) → ./match  (SERVER-AUTHORITATIVE: every match:move is
 *                           validated with @dama/game-engine before broadcast)
 *  - rooms (room:*)       → modules/rooms
 *  - chat (chat:*)        → modules/chat
 *  - presence             → redis/presence
 *
 * The handshake is authenticated below; socket.data.userId is the ONLY source of
 * the acting user id — a client-sent user id is never trusted.
 */

/** Read the fd_access cookie from the raw Cookie header (no cookie dep needed). */
function accessTokenFromCookieHeader(header: string | undefined): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (name === COOKIE.access) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}

/**
 * Classify the connecting client's device from its handshake User-Agent, so
 * matchmaking can show "Playing on {device}" for an opponent (v3 delta, Row
 * 4-6). This is the honest source today — a future native Android app will
 * send an explicit hint (e.g. `socket.handshake.auth.device`) that should take
 * priority once it exists; UA sniffing is the fallback until then.
 */
export type ClientDevice = "mobile" | "web" | "tablet";
export function classifyDevice(userAgent: string | undefined): ClientDevice {
  const ua = userAgent ?? "";
  if (/ipad|tablet/i.test(ua)) return "tablet";
  if (/mobi|android|iphone/i.test(ua)) return "mobile";
  return "web";
}

/**
 * Resolve + verify the authed user id from the handshake, then confirm the
 * account is still live (not deleted, not currently banned). A valid JWT alone
 * is not enough — a ban/delete after connect-time must keep the user out of
 * matchmaking and live play. Returns the userId or null.
 */
async function authenticate(socket: Socket): Promise<string | null> {
  const cookieToken = accessTokenFromCookieHeader(socket.handshake.headers.cookie);
  const authToken =
    typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : undefined;
  const token = cookieToken ?? authToken;
  if (!token) return null;
  let userId: string;
  try {
    userId = verifyAccess(token).sub;
  } catch {
    return null;
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, deletedAt: true, bannedUntil: true },
  });
  if (!user || user.deletedAt) return null;
  if (user.bannedUntil && user.bannedUntil > new Date()) return null;
  return user.id;
}

/**
 * Assembles the RtJobType -> handler map for the cross-instance job poller
 * (jobs.ts) from each realtime module's job handlers. Task 5 wires the two match
 * job types (abandon-forfeit, bot-move). Task 6 merges in matchmaking's "bot-fill"
 * and Task 7+ any damath ("d-bot-move") handlers; an unmapped type is a safe no-op
 * (the poller claims the due job but skips it when no handler is registered).
 */
export function rtJobHandlers(io: IOServer): Partial<Record<RtJobType, RtJobHandler>> {
  return {
    "abandon-forfeit": (payload) => handleAbandonForfeit(io, payload),
    "bot-move": (payload) => handleBotMove(io, payload),
  };
}

export function registerRealtime(io: IOServer) {
  // Expose the io instance so REST handlers (e.g. guild chat POST) can broadcast.
  setIO(io);

  // Reject unauthenticated / banned / deleted handshakes before any event
  // handler is wired.
  io.use((socket, next) => {
    authenticate(socket)
      .then((userId) => {
        if (!userId) {
          next(new Error("unauthorized"));
          return;
        }
        socket.data.userId = userId;
        socket.data.device = classifyDevice(socket.handshake.headers["user-agent"]);
        next();
      })
      .catch(() => next(new Error("unauthorized")));
  });

  io.on("connection", (socket: Socket) => {
    // socket.data.userId is guaranteed set by the io.use() guard above.
    registerPresence(io, socket); // must run first — joins presence:<userId> room
    registerMatchmaking(io, socket);
    registerMatch(io, socket);
    registerDamathMatchmaking(io, socket);
    registerDamathMatch(io, socket);
    registerDamathRooms(io, socket);
    registerGuildChat(io, socket);
    registerRooms(io, socket);

    // matchmaking cleans its queue on disconnect; presence.ts owns the
    // online/offline transition on disconnect; live matches keep their in-memory
    // state so a reconnecting client can EV.matchResync.
  });
}
