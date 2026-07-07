import type { Server as IOServer, Socket } from "socket.io";
import { EV } from "@dama/shared";
import { verifyAccess, COOKIE } from "../auth/tokens.js";
import { registerMatchmaking } from "./matchmaking.js";
import { registerMatch } from "./match.js";

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

/** Resolve + verify the authed user id from the handshake, or null. */
function authenticate(socket: Socket): string | null {
  const cookieToken = accessTokenFromCookieHeader(socket.handshake.headers.cookie);
  const authToken =
    typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : undefined;
  const token = cookieToken ?? authToken;
  if (!token) return null;
  try {
    return verifyAccess(token).sub;
  } catch {
    return null;
  }
}

export function registerRealtime(io: IOServer) {
  // Reject unauthenticated handshakes before any event handler is wired.
  io.use((socket, next) => {
    const userId = authenticate(socket);
    if (!userId) {
      next(new Error("unauthorized"));
      return;
    }
    socket.data.userId = userId;
    next();
  });

  io.on("connection", (socket: Socket) => {
    // socket.data.userId is guaranteed set by the io.use() guard above.
    registerMatchmaking(io, socket);
    registerMatch(io, socket);

    socket.on(EV.presencePing, () => {
      // refresh presence:<userId> TTL in redis, broadcast presence:update to friends
    });

    socket.on("disconnect", () => {
      // matchmaking cleans its queue on disconnect; live matches keep their
      // in-memory state so a reconnecting client can EV.matchResync.
    });
  });
}
