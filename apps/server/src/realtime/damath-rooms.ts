import type { Server as IOServer, Socket } from "socket.io";
import { EV, type DamathVariant } from "@dama/shared";
import { prisma } from "../db/client.js";
import { isMuted } from "../lib/mute.js";
import { createLiveDamathMatch } from "./damath-match.js";
import { allow } from "./rate-limit.js";
import { RT_TTL, redis, getRoomJSON, putRoomJSON, delRoomJSON, setUserRoom, getUserRoom, withLock, withLockRetry } from "./store.js";

/**
 * Math Dama private rooms — invite a friend by 6-char code and play on two
 * devices. Reuses Classic rooms' PATTERNS but Redis-authoritative (prefix
 * "rt:d:") so any instance can serve a room member, and seeds a DAMATH match via
 * createLiveDamathMatch. Its own file, so Classic's rooms.ts is never touched.
 * Unranked, no economy (matches Damath's online mode). Rooms are ephemeral: gone
 * when the host leaves, or via the 24h TTL. Kick/ban are out of scope for this
 * MVP. Every multi-step mutation runs under `withLock("d-room:<code>", ...)`.
 */

// A member tracks ALL of a user's sockets in this room (multi-tab). `sockets` is
// a plain string[] (JSON-safe) with Set semantics; `spectators` a JSON-safe object.
type Member = { userId: string; sockets: string[]; name: string; avatarUrl: string | null; tag: string };
type DamathRoom = {
  code: string;
  hostId: string;
  host: Member;
  guest: Member | null;
  spectators: Record<string, Member>; // userId → member
  variant: DamathVariant;
  matchId: string | null;
};

const RP = "rt:d:"; // Redis prefix for Damath room state
const PREFIX = (code: string) => `damathroom:${code}`; // socket.io room name (unchanged)
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

async function loadRoom(code: string): Promise<DamathRoom | null> {
  return getRoomJSON<DamathRoom>(RP, code);
}
async function storeRoom(room: DamathRoom): Promise<void> {
  await putRoomJSON(RP, room.code, room);
}
async function deleteRoom(code: string): Promise<void> {
  await delRoomJSON(RP, code);
}

async function makeCode(): Promise<string> {
  for (;;) {
    let c = "";
    for (let i = 0; i < 6; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!(await redis.exists(`${RP}room:${c}`))) return c;
  }
}

async function memberFor(userId: string, socketId: string): Promise<Member> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true, avatarUrl: true, tag: true },
  });
  return { userId, sockets: [socketId], name: u?.displayName ?? "Player", avatarUrl: u?.avatarUrl ?? null, tag: u?.tag ?? "" };
}

function memberIn(room: DamathRoom, userId: string): Member | null {
  if (room.host.userId === userId) return room.host;
  if (room.guest?.userId === userId) return room.guest;
  return room.spectators[userId] ?? null;
}

const publicMember = (m: Member) => ({ userId: m.userId, name: m.name, avatarUrl: m.avatarUrl, tag: m.tag });

function roomState(room: DamathRoom) {
  return {
    code: room.code,
    hostId: room.hostId,
    host: publicMember(room.host),
    guest: room.guest ? publicMember(room.guest) : null,
    spectators: Object.values(room.spectators).map(publicMember),
    variant: room.variant,
    matchId: room.matchId,
  };
}

const emitState = (io: IOServer, room: DamathRoom) =>
  io.to(PREFIX(room.code)).emit(EV.damathRoomState, roomState(room));

/** Remove a user from their room; tear it down if they were the host. Serialized
 *  on the room lock. `userRoom` is a per-user pointer cleared first.
 *
 *  `onlyIfNoSockets` guards the disconnect path (socketLeft): the last-socket
 *  teardown releases its lock, then re-acquires it here — and a reconnect can
 *  re-attach a fresh socket in that gap. When set, we re-read under THIS lock and
 *  abort if the member regained any socket, so a reconnecting host isn't
 *  clobbered (the split-lock TOCTOU). Mirrors rooms.ts::removeMember. */
async function removeMember(io: IOServer, userId: string, onlyIfNoSockets = false): Promise<void> {
  const code = await getUserRoom(RP, userId);
  if (!code) return;
  if (!onlyIfNoSockets) await setUserRoom(RP, userId, null);
  // withLockRetry: teardown MUST run (see rooms.ts::removeMember) — a silent
  // LOCK_BUSY no-op would strand a dead socket + stale userRoom pointer and, on
  // the guarded disconnect path, skip the reconnect check entirely.
  await withLockRetry(`d-room:${code}`, `d-removeMember(${userId})`, async () => {
    const room = await loadRoom(code);
    if (!room) {
      if (onlyIfNoSockets) await setUserRoom(RP, userId, null);
      return;
    }
    const member = memberIn(room, userId);
    if (onlyIfNoSockets && member && member.sockets.length > 0) return; // reconnect won the gap
    if (onlyIfNoSockets) await setUserRoom(RP, userId, null);
    if (member) for (const sid of member.sockets) io.sockets.sockets.get(sid)?.leave(PREFIX(code));

    if (room.hostId === userId) {
      io.to(PREFIX(code)).emit(EV.damathRoomState, { code, closed: true });
      if (room.guest) await setUserRoom(RP, room.guest.userId, null);
      for (const sp of Object.values(room.spectators)) await setUserRoom(RP, sp.userId, null);
      await deleteRoom(code);
      return;
    }
    if (room.guest?.userId === userId) room.guest = null;
    delete room.spectators[userId];
    await storeRoom(room);
    emitState(io, room);
  });
}

async function socketLeft(io: IOServer, userId: string, socketId: string): Promise<void> {
  const code = await getUserRoom(RP, userId);
  if (!code) return;
  let lastSocket = false;
  await withLockRetry(`d-room:${code}`, `d-socketLeft(${userId})`, async () => {
    const room = await loadRoom(code);
    if (!room) return;
    const member = memberIn(room, userId);
    if (!member) return;
    if (!member.sockets.includes(socketId)) return;
    member.sockets = member.sockets.filter((s) => s !== socketId);
    lastSocket = member.sockets.length === 0;
    await storeRoom(room);
  });
  if (lastSocket) await removeMember(io, userId, true);
}

export function registerDamathRooms(io: IOServer, socket: Socket) {
  const userId = socket.data.userId as string;

  socket.on(EV.damathRoomCreate, async (payload: { variant?: unknown } = {}) => {
    if (!allow(socket, "damath:room:create", 5, 10_000)) return;
    const variant = (typeof payload?.variant === "string" ? payload.variant : "whole") as DamathVariant;

    // Re-attach if already hosting (second tab).
    const existingCode = await getUserRoom(RP, userId);
    if (existingCode) {
      let reattached: DamathRoom | null = null;
      await withLock(`d-room:${existingCode}`, async () => {
        const existing = await loadRoom(existingCode);
        if (existing && existing.hostId === userId) {
          if (!existing.host.sockets.includes(socket.id)) existing.host.sockets.push(socket.id);
          await storeRoom(existing);
          reattached = existing;
        }
      });
      if (reattached) {
        void socket.join(PREFIX(existingCode));
        socket.emit(EV.damathRoomState, roomState(reattached));
        return;
      }
    }
    await removeMember(io, userId);
    const code = await makeCode();
    const host = await memberFor(userId, socket.id);
    const room: DamathRoom = { code, hostId: userId, host, guest: null, spectators: {}, variant, matchId: null };
    await withLock(`d-room:${code}`, async () => {
      await storeRoom(room);
      await setUserRoom(RP, userId, code);
    });
    void socket.join(PREFIX(code));
    socket.emit(EV.damathRoomState, roomState(room));
  });

  socket.on(EV.damathRoomJoin, async (payload: { code?: unknown } = {}) => {
    if (!allow(socket, "damath:room:join", 15, 10_000)) return;
    const code = typeof payload?.code === "string" ? payload.code.trim().toUpperCase() : null;
    if (!code) return;
    const peek = await loadRoom(code);
    if (!peek) {
      socket.emit(EV.damathRoomState, { code, error: "not-found" });
      return;
    }
    const prior = await getUserRoom(RP, userId);
    const alreadyHere = prior === code && !!memberIn(peek, userId);
    // Reject a full room (guest taken by someone else) before leaving any prior room.
    if (!alreadyHere && peek.guest && peek.guest.userId !== userId && peek.hostId !== userId) {
      socket.emit(EV.damathRoomState, { code, error: "full" });
      return;
    }
    if (!alreadyHere) await removeMember(io, userId);
    const member = alreadyHere ? null : await memberFor(userId, socket.id);
    void socket.join(PREFIX(code));
    let out: DamathRoom | null = null;
    await withLock(`d-room:${code}`, async () => {
      const room = await loadRoom(code);
      if (!room) return;
      const already = memberIn(room, userId);
      if (already) {
        if (!already.sockets.includes(socket.id)) already.sockets.push(socket.id);
      } else if (room.guest && room.guest.userId !== userId && room.hostId !== userId) {
        // Raced full — bail without seating.
        socket.emit(EV.damathRoomState, { code, error: "full" });
        return;
      } else if (room.hostId !== userId && member) {
        await setUserRoom(RP, userId, code);
        room.guest = member;
      }
      await storeRoom(room);
      out = room;
    });
    if (out) emitState(io, out);
  });

  socket.on(EV.damathRoomSpectate, async (payload: { code?: unknown } = {}) => {
    if (!allow(socket, "damath:room:spectate", 15, 10_000)) return;
    const code = typeof payload?.code === "string" ? payload.code.trim().toUpperCase() : null;
    if (!code) return;
    const peek = await loadRoom(code);
    if (!peek) {
      socket.emit(EV.damathRoomState, { code, error: "not-found" });
      return;
    }
    const prior = await getUserRoom(RP, userId);
    const alreadyHere = prior === code && !!memberIn(peek, userId);
    if (!alreadyHere) await removeMember(io, userId);
    const member = alreadyHere ? null : await memberFor(userId, socket.id);
    void socket.join(PREFIX(code));
    let out: DamathRoom | null = null;
    let liveMatchId: string | null = null;
    let variant: DamathVariant = peek.variant;
    await withLock(`d-room:${code}`, async () => {
      const room = await loadRoom(code);
      if (!room) return;
      const already = memberIn(room, userId);
      if (already) {
        if (!already.sockets.includes(socket.id)) already.sockets.push(socket.id);
      } else if (room.hostId !== userId && room.guest?.userId !== userId && member) {
        await setUserRoom(RP, userId, code);
        room.spectators[userId] = member;
      }
      await storeRoom(room);
      out = room;
      liveMatchId = room.matchId;
      variant = room.variant;
    });
    if (!out) return;
    // Late spectator: if a match is already live, join this socket to the match
    // channel and tell it to open the board read-only (yourColor:null). The
    // client then resyncs to pull the current board state.
    if (liveMatchId) {
      void socket.join(liveMatchId);
      socket.emit(EV.damathRoomStart, { matchId: liveMatchId, yourColor: null, variant });
    }
    emitState(io, out);
  });

  socket.on(EV.damathRoomStart, async () => {
    const code = await getUserRoom(RP, userId);
    if (!code) return;
    let started: DamathRoom | null = null;
    let createErr = false;
    await withLock(`d-room:${code}`, async () => {
      const room = await loadRoom(code);
      if (!room || room.hostId !== userId || !room.guest || room.matchId) return; // need a guest, not already started
      try {
        const match = await prisma.damathMatch.create({
          data: { variant: room.variant, redId: room.hostId, blueId: room.guest.userId },
          select: { id: true },
        });
        room.matchId = match.id;
        await storeRoom(room);
        started = room;
      } catch (e) {
        console.error("[damath-rooms] start failed", e);
        createErr = true;
      }
    });
    if (createErr || !started) return;
    const room = started as DamathRoom;
    const matchId = room.matchId as string;
    // Host = Red (opens), guest = Blue. Awaited (state lives in Redis): not
    // awaiting races the first move ahead of the write → no-such-match.
    await createLiveDamathMatch(matchId, room.hostId, room.guest!.userId, room.variant);
    for (const uid of [room.hostId, room.guest!.userId]) {
      const r = io.sockets.adapter.rooms.get(`presence:${uid}`);
      if (r) for (const sid of r) io.sockets.sockets.get(sid)?.join(matchId);
    }
    io.to(`presence:${room.hostId}`).emit(EV.damathRoomStart, { matchId, yourColor: "red", variant: room.variant });
    io.to(`presence:${room.guest!.userId}`).emit(EV.damathRoomStart, { matchId, yourColor: "blue", variant: room.variant });
    // Spectators watch READ-ONLY: join their sockets to the match room and tell
    // them to open the board with yourColor:null (they can never move — the
    // match move handlers gate on colorOf(), and a spectator has no colour).
    for (const spec of Object.values(room.spectators)) {
      for (const sid of spec.sockets) io.sockets.sockets.get(sid)?.join(matchId);
      io.to(`presence:${spec.userId}`).emit(EV.damathRoomStart, { matchId, yourColor: null, variant: room.variant });
    }
    emitState(io, room);
  });

  // Lobby chat — relay to everyone in the room (ephemeral; not persisted).
  socket.on(EV.damathRoomChat, async (payload: { body?: unknown } = {}) => {
    if (!allow(socket, "damath:room:chat", 8, 4000)) return; // anti-flood
    const code = await getUserRoom(RP, userId);
    const room = code ? await loadRoom(code) : null;
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

  socket.on(EV.damathRoomLeave, () => {
    void removeMember(io, userId).catch((e) => console.error("[damath-rooms] leave failed", e));
  });
  socket.on("disconnect", () => {
    void socketLeft(io, userId, socket.id).catch((e) => console.error("[damath-rooms] socketLeft failed", e));
  });
}
