import type { Socket } from "socket.io";

/**
 * Lightweight per-socket, per-event rate limiting for Socket.IO handlers.
 * Token-bucket held on socket.data so it's freed automatically when the socket
 * disconnects (no global map to leak). Guards the write/broadcast-heavy events
 * (chat, dm, room create, rematch) against a client flooding the server + DB +
 * other clients.
 *
 * Usage: `if (!allow(socket, "match:chat", 5, 3000)) return;` — allow at most 5
 * events per 3s window for this socket. Returns false (drop) when over budget.
 */
type Bucket = { count: number; resetAt: number };

export function allow(socket: Socket, key: string, max: number, windowMs: number): boolean {
  const store = (socket.data.__rl ??= {}) as Record<string, Bucket>;
  const now = Date.now();
  const b = store[key];
  if (!b || b.resetAt <= now) {
    store[key] = { count: 1, resetAt: now + windowMs };
    return true;
  }
  if (b.count >= max) return false;
  b.count += 1;
  return true;
}
