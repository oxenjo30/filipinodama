import type { Server as IOServer } from "socket.io";

/**
 * A tiny holder for the Socket.IO server instance so non-socket code (e.g. REST
 * route handlers) can broadcast realtime events. `registerRealtime` sets it at
 * startup; consumers read it via `getIO()` (null until the server is up, so
 * callers must null-check — a REST post that lands before sockets are ready
 * simply skips the live broadcast, the message is still persisted).
 */
let io: IOServer | null = null;

export function setIO(instance: IOServer): void {
  io = instance;
}

export function getIO(): IOServer | null {
  return io;
}
