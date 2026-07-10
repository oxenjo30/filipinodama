import type { Server as IOServer, Socket } from "socket.io";
import { EV, type DamathVariant } from "@dama/shared";
import { prisma } from "../db/client.js";
import { isMuted } from "../lib/mute.js";
import { createLiveDamathMatch } from "./damath-match.js";
import { allow } from "./rate-limit.js";

/**
 * Math Dama private rooms — invite a friend by 6-char code and play on two
 * devices. Reuses Classic rooms' PATTERNS (in-memory, host + one guest, host
 * starts) but seeds a DAMATH match via createLiveDamathMatch. Its own file, so
 * Classic's rooms.ts is never touched. Unranked, no economy (matches Damath's
 * online mode). Rooms are ephemeral: gone on server restart or when the host
 * leaves. Spectators/kick/ban are out of scope for this MVP.
 */

type Member = { userId: string; sockets: Set<string>; name: string; avatarUrl: string | null; tag: string };
type DamathRoom = {
  code: string;
  hostId: string;
  host: Member;
  guest: Member | null;
  spectators: Map<string, Member>; // userId → member
  variant: DamathVariant;
  matchId: string | null;
};

const rooms = new Map<string, DamathRoom>(); // code → room
const userRoom = new Map<string, string>(); // userId → code
const PREFIX = (code: string) => `damathroom:${code}`;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode(): string {
  let c = "";
  for (let i = 0; i < 6; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return rooms.has(c) ? makeCode() : c;
}

async function memberFor(userId: string, socketId: string): Promise<Member> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true, avatarUrl: true, tag: true },
  });
  return { userId, sockets: new Set([socketId]), name: u?.displayName ?? "Player", avatarUrl: u?.avatarUrl ?? null, tag: u?.tag ?? "" };
}

function memberIn(room: DamathRoom, userId: string): Member | null {
  if (room.host.userId === userId) return room.host;
  if (room.guest?.userId === userId) return room.guest;
  return room.spectators.get(userId) ?? null;
}

const publicMember = (m: Member) => ({ userId: m.userId, name: m.name, avatarUrl: m.avatarUrl, tag: m.tag });

function roomState(room: DamathRoom) {
  return {
    code: room.code,
    hostId: room.hostId,
    host: publicMember(room.host),
    guest: room.guest ? publicMember(room.guest) : null,
    spectators: [...room.spectators.values()].map(publicMember),
    variant: room.variant,
    matchId: room.matchId,
  };
}

const emitState = (io: IOServer, room: DamathRoom) =>
  io.to(PREFIX(room.code)).emit(EV.damathRoomState, roomState(room));

/** Remove a user from their room; tear it down if they were the host. */
function removeMember(io: IOServer, userId: string) {
  const code = userRoom.get(userId);
  if (!code) return;
  const room = rooms.get(code);
  userRoom.delete(userId);
  if (!room) return;
  const member = memberIn(room, userId);
  if (member) for (const sid of member.sockets) io.sockets.sockets.get(sid)?.leave(PREFIX(code));

  if (room.hostId === userId) {
    io.to(PREFIX(code)).emit(EV.damathRoomState, { code, closed: true });
    if (room.guest) userRoom.delete(room.guest.userId);
    for (const sp of room.spectators.values()) userRoom.delete(sp.userId);
    rooms.delete(code);
    return;
  }
  if (room.guest?.userId === userId) room.guest = null;
  room.spectators.delete(userId);
  emitState(io, room);
}

function socketLeft(io: IOServer, userId: string, socketId: string) {
  const code = userRoom.get(userId);
  const room = code ? rooms.get(code) : null;
  if (!room) return;
  const member = memberIn(room, userId);
  if (!member) return;
  member.sockets.delete(socketId);
  if (member.sockets.size === 0) removeMember(io, userId);
}

export function registerDamathRooms(io: IOServer, socket: Socket) {
  const userId = socket.data.userId as string;

  socket.on(EV.damathRoomCreate, async (payload: { variant?: unknown } = {}) => {
    if (!allow(socket, "damath:room:create", 5, 10_000)) return;
    const variant = (typeof payload?.variant === "string" ? payload.variant : "whole") as DamathVariant;

    // Re-attach if already hosting (second tab).
    const existingCode = userRoom.get(userId);
    const existing = existingCode ? rooms.get(existingCode) : null;
    if (existing && existing.hostId === userId) {
      existing.host.sockets.add(socket.id);
      void socket.join(PREFIX(existingCode!));
      socket.emit(EV.damathRoomState, roomState(existing));
      return;
    }
    removeMember(io, userId);
    const code = makeCode();
    const host = await memberFor(userId, socket.id);
    const room: DamathRoom = { code, hostId: userId, host, guest: null, spectators: new Map(), variant, matchId: null };
    rooms.set(code, room);
    userRoom.set(userId, code);
    void socket.join(PREFIX(code));
    socket.emit(EV.damathRoomState, roomState(room));
  });

  socket.on(EV.damathRoomJoin, async (payload: { code?: unknown } = {}) => {
    if (!allow(socket, "damath:room:join", 15, 10_000)) return;
    const code = typeof payload?.code === "string" ? payload.code.trim().toUpperCase() : null;
    if (!code) return;
    const room = rooms.get(code);
    if (!room) {
      socket.emit(EV.damathRoomState, { code, error: "not-found" });
      return;
    }
    void socket.join(PREFIX(code));
    const already = userRoom.get(userId) === code ? memberIn(room, userId) : null;
    if (already) {
      already.sockets.add(socket.id);
    } else if (room.guest && room.guest.userId !== userId && room.hostId !== userId) {
      socket.emit(EV.damathRoomState, { code, error: "full" });
      return;
    } else if (room.hostId !== userId) {
      removeMember(io, userId);
      const member = await memberFor(userId, socket.id);
      userRoom.set(userId, code);
      room.guest = member;
    }
    emitState(io, room);
  });

  socket.on(EV.damathRoomSpectate, async (payload: { code?: unknown } = {}) => {
    if (!allow(socket, "damath:room:spectate", 15, 10_000)) return;
    const code = typeof payload?.code === "string" ? payload.code.trim().toUpperCase() : null;
    console.log("[damath-rooms] spectate", { userId, code, roomExists: code ? rooms.has(code) : false, openRooms: rooms.size });
    if (!code) return;
    const room = rooms.get(code);
    if (!room) {
      socket.emit(EV.damathRoomState, { code, error: "not-found" });
      return;
    }
    void socket.join(PREFIX(code));
    const already = userRoom.get(userId) === code ? memberIn(room, userId) : null;
    if (already) {
      already.sockets.add(socket.id);
    } else if (room.hostId !== userId && room.guest?.userId !== userId) {
      removeMember(io, userId);
      const member = await memberFor(userId, socket.id);
      userRoom.set(userId, code);
      room.spectators.set(userId, member);
    }
    // Late spectator: if a match is already live, join this socket to the match
    // channel and tell it to open the board read-only (yourColor:null). The
    // client then resyncs to pull the current board state.
    if (room.matchId) {
      void socket.join(room.matchId);
      socket.emit(EV.damathRoomStart, { matchId: room.matchId, yourColor: null, variant: room.variant });
    }
    emitState(io, room);
  });

  socket.on(EV.damathRoomStart, async () => {
    const code = userRoom.get(userId);
    const room = code ? rooms.get(code) : null;
    if (!room || room.hostId !== userId || !room.guest || room.matchId) return; // need a guest
    try {
      const match = await prisma.damathMatch.create({
        data: { variant: room.variant, redId: room.hostId, blueId: room.guest.userId },
        select: { id: true },
      });
      room.matchId = match.id;
      // Host = Red (opens), guest = Blue.
      createLiveDamathMatch(match.id, room.hostId, room.guest.userId, room.variant);
      for (const uid of [room.hostId, room.guest.userId]) {
        const r = io.sockets.adapter.rooms.get(`presence:${uid}`);
        if (r) for (const sid of r) io.sockets.sockets.get(sid)?.join(match.id);
      }
      io.to(`presence:${room.hostId}`).emit(EV.damathRoomStart, { matchId: match.id, yourColor: "red", variant: room.variant });
      io.to(`presence:${room.guest.userId}`).emit(EV.damathRoomStart, { matchId: match.id, yourColor: "blue", variant: room.variant });
      // Spectators watch READ-ONLY: join their sockets to the match room and tell
      // them to open the board with yourColor:null (they can never move — the
      // match move handlers gate on colorOf(), and a spectator has no colour).
      for (const spec of room.spectators.values()) {
        for (const sid of spec.sockets) io.sockets.sockets.get(sid)?.join(match.id);
        io.to(`presence:${spec.userId}`).emit(EV.damathRoomStart, { matchId: match.id, yourColor: null, variant: room.variant });
      }
      emitState(io, room);
    } catch (e) {
      console.error("[damath-rooms] start failed", e);
    }
  });

  // Lobby chat — relay to everyone in the room (ephemeral; not persisted).
  socket.on(EV.damathRoomChat, async (payload: { body?: unknown } = {}) => {
    if (!allow(socket, "damath:room:chat", 8, 4000)) return; // anti-flood
    const code = userRoom.get(userId);
    const room = code ? rooms.get(code) : null;
    if (!room) return;
    const body = typeof payload?.body === "string" ? payload.body.trim().slice(0, 300) : "";
    if (!body) return;
    if (await isMuted(userId)) return; // admin-muted players can't chat
    const from = memberIn(room, userId);
    io.to(PREFIX(code!)).emit(EV.damathRoomChat, {
      from: from ? publicMember(from) : { userId, name: "Player", avatarUrl: null, tag: "" },
      body,
      at: Date.now(),
    });
  });

  socket.on(EV.damathRoomLeave, () => removeMember(io, userId));
  socket.on("disconnect", () => socketLeft(io, userId, socket.id));
}
