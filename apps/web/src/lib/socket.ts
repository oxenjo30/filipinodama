import { io, type Socket } from "socket.io-client";

/**
 * socket.ts — the single Socket.IO connection to the game server's /rt namespace.
 *
 * Auth: the httpOnly session cookie rides along automatically (withCredentials).
 * We connect lazily (only when online play is actually used) and reuse the one
 * socket for matchmaking + live match events. The server authenticates the
 * handshake from the cookie and attaches socket.data.userId.
 */

const URL = (import.meta.env.VITE_SOCKET_URL as string) || "http://localhost:4000";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(URL, {
      path: "/rt",
      withCredentials: true,
      autoConnect: true,
      transports: ["websocket", "polling"],
    });
  }
  return socket;
}

/** Ensure connected; resolves once the socket reports connected. */
export function connectSocket(): Promise<Socket> {
  const s = getSocket();
  if (s.connected) return Promise.resolve(s);
  return new Promise((resolve, reject) => {
    const onConnect = () => {
      s.off("connect_error", onErr);
      resolve(s);
    };
    const onErr = (e: Error) => {
      s.off("connect", onConnect);
      reject(e);
    };
    s.once("connect", onConnect);
    s.once("connect_error", onErr);
    if (!s.active) s.connect();
  });
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}
