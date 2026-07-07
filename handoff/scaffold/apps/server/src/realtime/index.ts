import type { Server as IOServer, Socket } from "socket.io";
import { EV } from "@dama/shared";

/**
 * Realtime entrypoint. Each ROADMAP feature registers its handlers here:
 *  - matchmaking (mm:*)   → modules/matchmaking
 *  - match play (match:*) → modules/matches  (SERVER-AUTHORITATIVE: validate every
 *                           match:move with @dama/game-engine before broadcasting)
 *  - rooms (room:*)       → modules/rooms
 *  - chat (chat:*)        → modules/chat
 *  - presence             → redis/presence
 *
 * Authenticate the handshake (read the access-token cookie / auth token),
 * attach socket.data.userId, and NEVER trust a client-sent user id.
 */
export function registerRealtime(io: IOServer) {
  io.on("connection", (socket: Socket) => {
    // const userId = authenticate(socket);  // reject if missing
    // socket.data.userId = userId;

    socket.on(EV.presencePing, () => {
      // refresh presence:<userId> TTL in redis, broadcast presence:update to friends
    });

    // Example server-authoritative move handler (fill in during M3):
    // socket.on(EV.matchMove, async ({ matchId, move }) => {
    //   const state = await loadState(matchId);
    //   if (!isLegal(state, move)) return socket.emit(EV.matchIllegal, { reason: "illegal" });
    //   const next = applyMove(state, move);
    //   await saveState(matchId, next);
    //   io.to(matchId).emit(EV.matchMoved, { move, state: next });
    //   if (next.result) await settleMatch(matchId, next); // writes Match + ledger deltas
    // });

    socket.on("disconnect", () => {
      // start disconnect-grace timer; on timeout mark abandon/loss for live matches
    });
  });
}
