import type { Server as IOServer, Socket } from "socket.io";
import { EV } from "@dama/shared";
import { prisma } from "../db/client.js";
import { guildRoom } from "../modules/guild-chat-service.js";

/**
 * Guild chat sockets. A client opening its guild's chat emits `guild:chat:join`
 * with the guildId; we VERIFY the socket's authed user is actually a member of
 * that guild (socket.data.userId is the only trusted id) before joining them to
 * the `guild:<guildId>` room. New messages are broadcast to that room by the
 * REST POST handler (modules/guilds.ts), so every online member receives them
 * live via `guild:chat:message`.
 *
 * Sending is done over REST (persist + broadcast), not over the socket, so a
 * message is durably stored even if the sender's socket races/drops — the socket
 * here is receive-only for the live feed.
 */
export function registerGuildChat(_io: IOServer, socket: Socket) {
  const userId = socket.data.userId as string;

  socket.on(EV.guildChatJoin, async (payload: { guildId?: unknown } = {}) => {
    const guildId = typeof payload?.guildId === "string" ? payload.guildId : null;
    if (!guildId) return;
    // Only members may listen to a guild's chat feed.
    const membership = await prisma.guildMember.findFirst({
      where: { userId, guildId },
      select: { id: true },
    });
    if (!membership) return;
    socket.join(guildRoom(guildId));
  });

  socket.on(EV.guildChatLeave, (payload: { guildId?: unknown } = {}) => {
    const guildId = typeof payload?.guildId === "string" ? payload.guildId : null;
    if (guildId) socket.leave(guildRoom(guildId));
  });
}
