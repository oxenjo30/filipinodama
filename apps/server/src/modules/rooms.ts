import type { FastifyInstance } from "fastify";
import { ok } from "../lib/errors.js";
import { requireAuth } from "../auth/guards.js";
import { myRoomCode } from "../realtime/rooms.js";

export async function roomRoutes(app: FastifyInstance) {
  // GET /api/rooms/mine — the caller's currently-active private room code, if
  // any (host, guest, or spectator), so PrivateRoomPage can resume it without
  // a ?code link (e.g. after a reload). Reads the same in-memory room state
  // the realtime layer owns — see realtime/rooms.ts myRoomCode() for why no
  // recency gate is needed.
  app.get("/rooms/mine", { preHandler: requireAuth }, async (req) => {
    return ok({ code: await myRoomCode(req.userId!) });
  });
}
