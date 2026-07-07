import type { Server as IOServer, Socket } from "socket.io";
import { EV } from "@dama/shared";
import { verifyAccess, COOKIE } from "../auth/tokens.js";
import { prisma } from "../db/client.js";
import { registerMatchmaking } from "./matchmaking.js";
import { registerMatch } from "./match.js";
import { registerGuildChat } from "./guild-chat.js";
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
        next();
      })
      .catch(() => next(new Error("unauthorized")));
  });

  io.on("connection", (socket: Socket) => {
    // socket.data.userId is guaranteed set by the io.use() guard above.
    registerMatchmaking(io, socket);
    registerMatch(io, socket);
    registerGuildChat(io, socket);

    socket.on(EV.presencePing, () => {
      // refresh presence:<userId> TTL in redis, broadcast presence:update to friends
    });

    socket.on("disconnect", () => {
      // matchmaking cleans its queue on disconnect; live matches keep their
      // in-memory state so a reconnecting client can EV.matchResync.
    });
  });
}
