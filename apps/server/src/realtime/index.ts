import type { Server as IOServer, Socket } from "socket.io";
import type { RtJobType, RtJobHandler } from "./jobs.js";
import { verifyAccess, COOKIE } from "../auth/tokens.js";
import { prisma } from "../db/client.js";
import { registerMatchmaking, handleBotFill } from "./matchmaking.js";
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
 * Best-effort client region for the multi-region evidence-gathering (Stage 0,
 * docs/ops/multi-region-design.md). Once Cloudflare fronts the API it adds a
 * `cf-ipcountry` header (2-letter ISO country) on every request incl. the socket
 * upgrade — that's the client's real geography, free and accurate. Before
 * Cloudflare is in place this is just "unknown", which is fine: the point is that
 * the LOGGING is wired now so the data starts flowing the moment the edge is on.
 * We fold country → a coarse region bucket matching Railway's deploy regions so
 * the RTT logs answer "where are players, and how far are they from Singapore?".
 */
export function clientRegionOf(socket: Socket): string {
  const h = socket.handshake.headers;
  const cc = (
    (typeof h["cf-ipcountry"] === "string" ? h["cf-ipcountry"] : undefined) ?? ""
  ).toUpperCase();
  if (!cc || cc === "XX") return "unknown";
  // Coarse buckets aligned to Railway regions (us-west/us-east/eu-west/southeast-asia).
  if (["PH", "SG", "MY", "ID", "TH", "VN", "JP", "KR", "CN", "HK", "TW", "IN", "AU"].includes(cc)) return "apac";
  if (["US", "CA", "MX"].includes(cc)) return "amer";
  if (["GB", "IE", "FR", "DE", "NL", "ES", "IT", "PL", "SE", "NO", "FI", "PT", "BE", "CH", "AT"].includes(cc)) return "emea";
  return `other:${cc}`;
}

/**
 * The Railway region THIS instance is serving from (RAILWAY_REPLICA_REGION is
 * injected per-replica at runtime). Paired with clientRegionOf in the RTT log so
 * we can see serving-region vs client-region and the resulting latency — the
 * core Stage-0 signal for deciding IF/WHERE a second region is worth it.
 */
export function servingRegion(): string {
  return process.env.RAILWAY_REPLICA_REGION ?? process.env.RAILWAY_REGION ?? "unknown";
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
 * (jobs.ts) from each realtime module's job handlers. Task 5 wired the two match
 * job types (abandon-forfeit, bot-move). Task 6 merges in matchmaking's
 * "bot-fill" and Task 7+ any damath ("d-bot-move") handlers; an unmapped type is
 * a safe no-op (the poller claims the due job but skips it when no handler is
 * registered).
 */
export function rtJobHandlers(io: IOServer): Partial<Record<RtJobType, RtJobHandler>> {
  return {
    "abandon-forfeit": (payload) => handleAbandonForfeit(io, payload),
    "bot-move": (payload) => handleBotMove(io, payload),
    "bot-fill": (payload) => handleBotFill(io, payload),
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
        socket.data.region = clientRegionOf(socket); // Stage-0 multi-region evidence
        next();
      })
      .catch(() => next(new Error("unauthorized")));
  });

  io.on("connection", (socket: Socket) => {
    // socket.data.userId is guaranteed set by the io.use() guard above.

    // ── Stage-0 multi-region telemetry (docs/ops/multi-region-design.md) ──
    // ZERO client change: log where each client connects from, which region served
    // it, and — read from socket.io's OWN heartbeat, no app-level ping needed —
    // the connection's round-trip latency. This is the EVIDENCE that decides
    // if/where a second region is ever worth it: "how many players are far from
    // Singapore, and how much latency do they pay?". It flows the moment Cloudflare
    // fronts the API (which supplies the cf-ipcountry geo header used by
    // clientRegionOf); until then region reads "unknown" but serving-region + the
    // heartbeat RTT are already useful.
    //
    // RTT SOURCE: engine.io already pings every client on a heartbeat interval and
    // records the pong latency internally. We don't add our own ping (which would
    // need client cooperation + a client rebuild). Instead we read engine.io's
    // measured value if the installed version exposes it, and otherwise just emit
    // the geography line (Cloudflare's own analytics carries client RTT as a
    // backstop). Best-effort and fire-and-forget — never touches gameplay.
    const region = (socket.data.region as string) ?? "unknown";
    const serving = servingRegion();
    const device = (socket.data.device as string) ?? "web";
    const logConn = (rttMs?: number) => {
      const rtt = rttMs != null && Number.isFinite(rttMs) ? ` rtt_ms=${Math.round(rttMs)}` : "";
      console.log(`[conn] region=${region} serving=${serving} device=${device}${rtt}`);
    };
    // engine.io v6 (socket.io v4) tracks the last pong latency on the raw conn;
    // read it defensively since it's not a stable public field.
    const readEngineRtt = (): number | undefined => {
      const conn = socket.conn as unknown as { pingTimeout?: number; lastPong?: number; lastPing?: number };
      if (conn?.lastPong != null && conn?.lastPing != null) return conn.lastPong - conn.lastPing;
      return undefined;
    };
    logConn(readEngineRtt());
    // Re-sample once a minute so we see steady-state latency, not just connect-time.
    const rttTimer = setInterval(() => logConn(readEngineRtt()), 60_000);
    rttTimer.unref?.();
    socket.on("disconnect", () => clearInterval(rttTimer));

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
