import type { Server as IOServer, Socket } from "socket.io";
import { EV, DEFAULT_SETTINGS, type GameSettings } from "@dama/shared";
import type { MatchMode as PrismaMatchMode } from "@prisma/client";
import { prisma } from "../db/client.js";
import { isMuted } from "../lib/mute.js";
import { createLiveMatch, onMatchEnd } from "./match.js";
import { allow } from "./rate-limit.js";

/**
 * Sanitize a client-proposed settings patch into a SAFE GameSettings — bounded
 * so a malicious host can't inject a negative/huge drawMoveLimit or junk keys
 * that would break the engine. Only the three known fields are accepted, each
 * clamped to sane ranges; anything else is ignored and DEFAULT is the floor.
 */
function sanitizeSettings(base: GameSettings, patch: unknown): GameSettings {
  const p = (patch ?? {}) as Record<string, unknown>;
  const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
    const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : fallback;
    return Math.min(max, Math.max(min, n));
  };
  return {
    forcedMaxCapture: typeof p.forcedMaxCapture === "boolean" ? p.forcedMaxCapture : base.forcedMaxCapture,
    drawMoveLimit: clampInt(p.drawMoveLimit, 10, 200, base.drawMoveLimit),
    ...(p.moveTimerSec !== undefined || base.moveTimerSec !== undefined
      ? { moveTimerSec: clampInt(p.moveTimerSec, 5, 600, base.moveTimerSec ?? 60) }
      : {}),
  };
}

/**
 * Private rooms — in-memory (single-instance), like live matches. A host creates
 * a room (6-char code); one guest and any number of spectators can join by code.
 * The host controls settings, can kick/ban, and starts the match (which seeds a
 * real server-authoritative Match for host + guest). Room chat is relayed live.
 * Rooms are ephemeral: an UNSTARTED lobby vanishes when the host leaves; once a
 * match has started the room is kept alive (so its spectate code keeps resolving)
 * and is reclaimed when that match ends. All rooms vanish on server restart.
 */

// A member tracks ALL of a user's sockets in this room (multi-tab), so one tab
// closing doesn't evict a user who is still connected on another.
type Member = { userId: string; sockets: Set<string>; name: string; avatarUrl: string | null; tag: string };
type Room = {
  code: string;
  hostId: string;
  host: Member;
  guest: Member | null;
  spectators: Map<string, Member>; // userId → member
  banned: Set<string>;
  settings: GameSettings;
  mode: PrismaMatchMode;
  matchId: string | null; // set once started
};

const rooms = new Map<string, Room>(); // code → room
const userRoom = new Map<string, string>(); // userId → code they're in

// Reclaim a private room once its match settles (it's kept alive during play so
// spectators can still resolve the code — see removeMember). Registered once at
// module load; match.ts fires it with no import back to this module.
onMatchEnd((matchId) => clearRoomForMatch(matchId));

const ROOM_PREFIX = (code: string) => `room:${code}`;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars

function makeCode(rng: () => number): string {
  let c = "";
  for (let i = 0; i < 6; i++) c += CODE_CHARS[Math.floor(rng() * CODE_CHARS.length)];
  return rooms.has(c) ? makeCode(rng) : c;
}

async function memberFor(userId: string, socketId: string): Promise<Member> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true, avatarUrl: true, tag: true },
  });
  return { userId, sockets: new Set([socketId]), name: u?.displayName ?? "Player", avatarUrl: u?.avatarUrl ?? null, tag: u?.tag ?? "" };
}

/** Find a user's member record in a room (host/guest/spectator), or null. */
function memberIn(room: Room, userId: string): Member | null {
  if (room.host.userId === userId) return room.host;
  if (room.guest?.userId === userId) return room.guest;
  return room.spectators.get(userId) ?? null;
}

/** Force every one of a user's sockets to leave the room's socket-room. */
function detachSockets(io: IOServer, room: Room, member: Member) {
  for (const sid of member.sockets) io.sockets.sockets.get(sid)?.leave(ROOM_PREFIX(room.code));
}

/** The wire-safe room snapshot broadcast to everyone in the room. */
function roomState(room: Room) {
  return {
    code: room.code,
    hostId: room.hostId,
    host: publicMember(room.host),
    guest: room.guest ? publicMember(room.guest) : null,
    spectators: [...room.spectators.values()].map(publicMember),
    settings: room.settings,
    mode: room.mode,
    matchId: room.matchId,
  };
}
function publicMember(m: Member) {
  return { userId: m.userId, name: m.name, avatarUrl: m.avatarUrl, tag: m.tag };
}

function emitState(io: IOServer, room: Room) {
  io.to(ROOM_PREFIX(room.code)).emit(EV.roomState, roomState(room));
}

/**
 * Fully remove a user from THEIR current room (all their sockets), tearing the
 * room down if they were the host. Intended for an explicit leave/kick/ban.
 */
function removeMember(io: IOServer, userId: string) {
  const code = userRoom.get(userId);
  if (!code) return;
  const room = rooms.get(code);
  userRoom.delete(userId);
  if (!room) return;
  const member = memberIn(room, userId);
  if (member) detachSockets(io, room, member);

  // Once the match has STARTED, the live-match layer (match.ts) is the sole owner
  // of that match's lifecycle — including disconnect/abandonment (its 45s abandon
  // timer forfeits a player who truly drops and doesn't reconnect). Leaving the
  // room here must therefore NEVER settle, forfeit, or tear down the match — and,
  // crucially, must NOT destroy the ROOM either: clicking "Start" navigates the
  // room page → /play/online, which unmounts the page and fires this exact
  // leave() for the host AND the guest. Two failures came from tearing down here:
  //   • forfeiting the just-started match ended the game the instant it began, and
  //     (by deleting the live match before the host could resync into it) showed
  //     up as "Connection Lost / 0 moves";
  //   • deleting the ROOM made its shareable spectate link resolve to a
  //     non-existent room, so watching broke the moment the match actually started.
  // While the match is live we KEEP the room (its `matchId` is what a late
  // spectator's code resolves to) and only detach the leaving user's own
  // membership. The room is reclaimed when the match ENDS (see clearRoomForMatch,
  // wired into match settlement) or on server restart.
  if (room.matchId) {
    if (room.guest?.userId === userId) room.guest = null;
    else room.spectators.delete(userId);
    // Host leaving the room page after start is normal (they're now in the match);
    // the room lives on for spectators. Nothing else to do — never touch the match.
    return;
  }

  if (room.hostId === userId) {
    // Unstarted lobby: the host leaving closes the room for everyone. No match
    // exists yet, so there is nothing to settle.
    io.to(ROOM_PREFIX(code)).emit(EV.roomState, { code, closed: true });
    for (const m of [room.guest, ...room.spectators.values()]) if (m) userRoom.delete(m.userId);
    rooms.delete(code);
    return;
  }
  if (room.guest?.userId === userId) room.guest = null;
  room.spectators.delete(userId);
  emitState(io, room);
}

/**
 * Reclaim the room that hosted `matchId` once its match has ended. Called from
 * match settlement so a room kept alive for spectating during play doesn't leak
 * after the game is over. No-op if no room maps to this match (matchmade games,
 * already-cleaned rooms). Frees each remaining member's userRoom mapping too.
 */
export function clearRoomForMatch(matchId: string): void {
  for (const [code, room] of rooms) {
    if (room.matchId !== matchId) continue;
    for (const m of [room.host, room.guest, ...room.spectators.values()]) {
      if (m && userRoom.get(m.userId) === code) userRoom.delete(m.userId);
    }
    rooms.delete(code);
    return;
  }
}

/**
 * Handle ONE socket disconnecting. Only actually removes the user from the room
 * when that was their LAST socket in the room (multi-tab safe) — a user with
 * another open tab keeps their seat.
 */
function socketLeft(io: IOServer, userId: string, socketId: string) {
  const code = userRoom.get(userId);
  const room = code ? rooms.get(code) : null;
  if (!room) return;
  const member = memberIn(room, userId);
  if (!member) return;
  member.sockets.delete(socketId);
  if (member.sockets.size === 0) removeMember(io, userId);
}

export function registerRooms(io: IOServer, socket: Socket) {
  const userId = socket.data.userId as string;
  // Deterministic-enough code generator (Math.random is fine for room codes).
  const rng = Math.random;

  socket.on(EV.roomCreate, async (payload: { mode?: unknown } = {}) => {
    if (!allow(socket, "room:create", 5, 10_000)) return; // anti-spam
    // If the host already hosts a room, a second tab re-attaches instead of
    // orphaning the first room.
    const existingCode = userRoom.get(userId);
    const existingRoom = existingCode ? rooms.get(existingCode) : null;
    if (existingRoom && existingRoom.hostId === userId) {
      existingRoom.host.sockets.add(socket.id);
      void socket.join(ROOM_PREFIX(existingCode!));
      socket.emit(EV.roomState, roomState(existingRoom));
      return;
    }
    removeMember(io, userId); // one room at a time (explicit leave of any prior room)
    const code = makeCode(rng);
    const host = await memberFor(userId, socket.id);
    const mode = (payload?.mode === "RANKED" ? "RANKED" : "PRIVATE") as PrismaMatchMode;
    const room: Room = {
      code,
      hostId: userId,
      host,
      guest: null,
      spectators: new Map(),
      banned: new Set(),
      settings: { ...DEFAULT_SETTINGS },
      mode,
      matchId: null,
    };
    rooms.set(code, room);
    userRoom.set(userId, code);
    void socket.join(ROOM_PREFIX(code));
    socket.emit(EV.roomState, roomState(room));
  });

  socket.on(EV.roomJoin, async (payload: { code?: unknown } = {}) => {
    if (!allow(socket, "room:join", 15, 10_000)) return; // anti-brute-force on codes
    const code = typeof payload?.code === "string" ? payload.code.trim().toUpperCase() : null;
    if (!code) return;
    const room = rooms.get(code);
    if (!room) {
      socket.emit(EV.roomState, { code, error: "not-found" });
      return;
    }
    if (room.banned.has(userId)) {
      socket.emit(EV.roomState, { code, error: "banned" });
      return;
    }
    void socket.join(ROOM_PREFIX(code));
    // Multi-tab: if already in THIS room, just attach the new socket to the same
    // member (keep their seat); otherwise leave any prior room and take a slot.
    const existing = userRoom.get(userId) === code ? memberIn(room, userId) : null;
    if (existing) {
      existing.sockets.add(socket.id);
    } else {
      removeMember(io, userId);
      const member = await memberFor(userId, socket.id);
      userRoom.set(userId, code);
      if (!room.guest && room.hostId !== userId) room.guest = member;
      else if (room.hostId !== userId) room.spectators.set(userId, member);
    }
    emitState(io, room);
  });

  socket.on(EV.roomSpectate, async (payload: { code?: unknown } = {}) => {
    const code = typeof payload?.code === "string" ? payload.code.trim().toUpperCase() : null;
    const room = code ? rooms.get(code) : null;
    if (!room || room.banned.has(userId)) return;
    void socket.join(ROOM_PREFIX(code!));
    const existing = userRoom.get(userId) === code ? memberIn(room, userId) : null;
    if (existing) {
      existing.sockets.add(socket.id);
    } else {
      removeMember(io, userId);
      const member = await memberFor(userId, socket.id);
      userRoom.set(userId, code!);
      room.spectators.set(userId, member);
    }
    // Late spectator: if a match is already live in this room, join this socket to
    // the match channel and tell it to open the board read-only. The client then
    // resyncs to pull the current board state.
    if (room.matchId) {
      void socket.join(room.matchId);
      socket.emit(EV.roomStart, { matchId: room.matchId, yourColor: null });
    }
    emitState(io, room);
  });

  socket.on(EV.roomSettings, (payload: { settings?: Partial<GameSettings> } = {}) => {
    const code = userRoom.get(userId);
    const room = code ? rooms.get(code) : null;
    if (!room || room.hostId !== userId) return; // host only
    if (payload.settings) room.settings = sanitizeSettings(room.settings, payload.settings);
    emitState(io, room);
  });

  socket.on(EV.roomKick, (payload: { userId?: unknown } = {}) => {
    const code = userRoom.get(userId);
    const room = code ? rooms.get(code) : null;
    const target = typeof payload?.userId === "string" ? payload.userId : null;
    // Host only, AND the target must actually be in THIS room (scoped — a host of
    // one room cannot kick a user out of a different room).
    if (!room || room.hostId !== userId || !target || target === userId) return;
    if (userRoom.get(target) !== code || !memberIn(room, target)) return;
    io.to(`presence:${target}`).emit(EV.roomState, { code, kicked: target });
    removeMember(io, target); // detaches their sockets from the room too
  });

  socket.on(EV.roomBan, (payload: { userId?: unknown } = {}) => {
    const code = userRoom.get(userId);
    const room = code ? rooms.get(code) : null;
    const target = typeof payload?.userId === "string" ? payload.userId : null;
    if (!room || room.hostId !== userId || !target || target === userId) return;
    if (userRoom.get(target) !== code || !memberIn(room, target)) return;
    room.banned.add(target);
    io.to(`presence:${target}`).emit(EV.roomState, { code, banned: target });
    removeMember(io, target);
  });

  socket.on(EV.roomStart, async () => {
    const code = userRoom.get(userId);
    const room = code ? rooms.get(code) : null;
    if (!room || room.hostId !== userId || !room.guest || room.matchId) return; // need a guest
    // Seed a real match: host = red, guest = blue.
    try {
      const match = await prisma.match.create({
        data: {
          mode: room.mode,
          redId: room.hostId,
          blueId: room.guest.userId,
          settings: room.settings as unknown as object,
          moves: [] as unknown as object,
        },
        select: { id: true },
      });
      room.matchId = match.id;
      createLiveMatch(match.id, room.hostId, room.guest.userId, room.mode, room.settings);
      // Put both players' sockets into the match room.
      for (const uid of [room.hostId, room.guest.userId]) {
        const r = io.sockets.adapter.rooms.get(`presence:${uid}`);
        if (r) for (const sid of r) io.sockets.sockets.get(sid)?.join(match.id);
      }
      io.to(`presence:${room.hostId}`).emit(EV.roomStart, { matchId: match.id, yourColor: "red" });
      io.to(`presence:${room.guest.userId}`).emit(EV.roomStart, { matchId: match.id, yourColor: "blue" });
      // Spectators watch READ-ONLY: join their sockets to the match room so they
      // receive matchMoved/matchState, and tell them to open the board with
      // yourColor:null. They can never move — the match move handlers gate on
      // colorOf(), and a spectator has no color.
      for (const spec of room.spectators.values()) {
        for (const sid of spec.sockets) io.sockets.sockets.get(sid)?.join(match.id);
        io.to(`presence:${spec.userId}`).emit(EV.roomStart, { matchId: match.id, yourColor: null });
      }
      emitState(io, room); // spectators see matchId now
    } catch (e) {
      console.error("[rooms] start failed", e);
    }
  });

  // Room chat — relay to everyone in the room (ephemeral; not persisted).
  socket.on(EV.roomInvite, () => {
    // invite is handled client-side via the shareable code/link; nothing server-side needed.
  });

  socket.on("room:chat", async (payload: { body?: unknown } = {}) => {
    if (!allow(socket, "room:chat", 8, 4000)) return; // anti-flood
    const code = userRoom.get(userId);
    const room = code ? rooms.get(code) : null;
    if (!room) return;
    const body = typeof payload?.body === "string" ? payload.body.trim().slice(0, 300) : "";
    if (!body) return;
    if (await isMuted(userId)) return; // admin-muted players can't chat in rooms
    const from = room.host.userId === userId ? room.host : room.guest?.userId === userId ? room.guest : room.spectators.get(userId);
    io.to(ROOM_PREFIX(code!)).emit("room:chat", {
      from: from ? publicMember(from) : { userId, name: "Player", avatarUrl: null, tag: "" },
      body,
      at: Date.now(),
    });
  });

  socket.on(EV.roomLeave, () => removeMember(io, userId));
  socket.on("disconnect", () => socketLeft(io, userId, socket.id));
}
