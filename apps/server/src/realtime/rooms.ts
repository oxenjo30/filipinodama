import type { Server as IOServer, Socket } from "socket.io";
import { EV, DEFAULT_SETTINGS, type GameSettings } from "@dama/shared";
import type { MatchMode as PrismaMatchMode } from "@prisma/client";
import { prisma } from "../db/client.js";
import { createLiveMatch } from "./match.js";

/**
 * Private rooms — in-memory (single-instance), like live matches. A host creates
 * a room (6-char code); one guest and any number of spectators can join by code.
 * The host controls settings, can kick/ban, and starts the match (which seeds a
 * real server-authoritative Match for host + guest). Room chat is relayed live.
 * Rooms are ephemeral: they vanish on server restart or when the host leaves.
 */

type Member = { userId: string; socketId: string; name: string; avatarUrl: string | null; tag: string };
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
  return { userId, socketId, name: u?.displayName ?? "Player", avatarUrl: u?.avatarUrl ?? null, tag: u?.tag ?? "" };
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

/** Remove a user from whatever room they're in; tear the room down if host left. */
function leaveRoom(io: IOServer, userId: string, socket?: Socket) {
  const code = userRoom.get(userId);
  if (!code) return;
  const room = rooms.get(code);
  userRoom.delete(userId);
  if (!room) return;
  if (socket) void socket.leave(ROOM_PREFIX(code));

  if (room.hostId === userId) {
    // Host left → close the room for everyone.
    io.to(ROOM_PREFIX(code)).emit(EV.roomState, { code, closed: true });
    for (const m of [room.guest, ...room.spectators.values()]) if (m) userRoom.delete(m.userId);
    rooms.delete(code);
    return;
  }
  if (room.guest?.userId === userId) room.guest = null;
  room.spectators.delete(userId);
  emitState(io, room);
}

export function registerRooms(io: IOServer, socket: Socket) {
  const userId = socket.data.userId as string;
  // Deterministic-enough code generator (Math.random is fine for room codes).
  const rng = Math.random;

  socket.on(EV.roomCreate, async (payload: { mode?: unknown } = {}) => {
    leaveRoom(io, userId, socket); // one room at a time
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
    leaveRoom(io, userId, socket);
    const member = await memberFor(userId, socket.id);
    void socket.join(ROOM_PREFIX(code));
    userRoom.set(userId, code);
    // First non-host joiner takes the guest seat; otherwise they spectate.
    if (!room.guest && room.hostId !== userId) room.guest = member;
    else if (room.hostId !== userId) room.spectators.set(userId, member);
    emitState(io, room);
  });

  socket.on(EV.roomSpectate, async (payload: { code?: unknown } = {}) => {
    const code = typeof payload?.code === "string" ? payload.code.trim().toUpperCase() : null;
    const room = code ? rooms.get(code) : null;
    if (!room || room.banned.has(userId)) return;
    leaveRoom(io, userId, socket);
    const member = await memberFor(userId, socket.id);
    void socket.join(ROOM_PREFIX(code!));
    userRoom.set(userId, code!);
    room.spectators.set(userId, member);
    emitState(io, room);
  });

  socket.on(EV.roomSettings, (payload: { settings?: Partial<GameSettings> } = {}) => {
    const code = userRoom.get(userId);
    const room = code ? rooms.get(code) : null;
    if (!room || room.hostId !== userId) return; // host only
    if (payload.settings) room.settings = { ...room.settings, ...payload.settings };
    emitState(io, room);
  });

  socket.on(EV.roomKick, (payload: { userId?: unknown } = {}) => {
    const code = userRoom.get(userId);
    const room = code ? rooms.get(code) : null;
    const target = typeof payload?.userId === "string" ? payload.userId : null;
    if (!room || room.hostId !== userId || !target || target === userId) return;
    io.to(`presence:${target}`).emit(EV.roomState, { code, kicked: target });
    leaveRoom(io, target);
  });

  socket.on(EV.roomBan, (payload: { userId?: unknown } = {}) => {
    const code = userRoom.get(userId);
    const room = code ? rooms.get(code) : null;
    const target = typeof payload?.userId === "string" ? payload.userId : null;
    if (!room || room.hostId !== userId || !target || target === userId) return;
    room.banned.add(target);
    io.to(`presence:${target}`).emit(EV.roomState, { code, banned: target });
    leaveRoom(io, target);
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
      emitState(io, room); // spectators see matchId now
    } catch (e) {
      console.error("[rooms] start failed", e);
    }
  });

  // Room chat — relay to everyone in the room (ephemeral; not persisted).
  socket.on(EV.roomInvite, () => {
    // invite is handled client-side via the shareable code/link; nothing server-side needed.
  });

  socket.on("room:chat", (payload: { body?: unknown } = {}) => {
    const code = userRoom.get(userId);
    const room = code ? rooms.get(code) : null;
    if (!room) return;
    const body = typeof payload?.body === "string" ? payload.body.trim().slice(0, 300) : "";
    if (!body) return;
    const from = room.host.userId === userId ? room.host : room.guest?.userId === userId ? room.guest : room.spectators.get(userId);
    io.to(ROOM_PREFIX(code!)).emit("room:chat", {
      from: from ? publicMember(from) : { userId, name: "Player", avatarUrl: null, tag: "" },
      body,
      at: Date.now(),
    });
  });

  socket.on(EV.roomLeave, () => leaveRoom(io, userId, socket));
  socket.on("disconnect", () => leaveRoom(io, userId, socket));
}
