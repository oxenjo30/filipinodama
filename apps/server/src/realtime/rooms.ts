import type { Server as IOServer, Socket } from "socket.io";
import { EV, DEFAULT_SETTINGS, type GameSettings } from "@dama/shared";
import type { MatchMode as PrismaMatchMode } from "@prisma/client";
import { prisma } from "../db/client.js";
import { isMuted } from "../lib/mute.js";
import { createLiveMatch, onMatchEnd, addSpectatorSocket, removeSpectatorSocket, spectatorCount } from "./match.js";
import { allow } from "./rate-limit.js";
import {
  redis,
  RT_TTL,
  getRoomJSON,
  putRoomJSON,
  delRoomJSON,
  setUserRoom,
  getUserRoom,
  withLock,
  withLockRetry,
} from "./store.js";

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
 * Private rooms — Redis-authoritative (rt: prefix), so any instance in the
 * cluster can serve any room member. A host creates a room (6-char code); one
 * guest and any number of spectators can join by code. The host controls
 * settings, can kick/ban, and starts the match (which seeds a real
 * server-authoritative Match for host + guest). Room chat is relayed live. Rooms
 * are ephemeral: an UNSTARTED lobby vanishes when the host leaves; once a match
 * has started the room is kept alive (so its spectate code keeps resolving) and
 * is reclaimed when that match ends. Each room has a 24h TTL safety net.
 *
 * Every multi-step room mutation runs inside `withLock("room:<code>", ...)` with
 * a single get→mutate→put so two instances (or two sockets on one instance)
 * cannot corrupt a room. Rooms carry NO version field — the lock alone serializes
 * them (they never move money, so an expired-lock racer is harmless).
 */

// The Redis prefix for all Classic-room state (spec: "rt:").
const RP = "rt:";
// SET of every active room code (for listOpenRooms enumeration) + a matchId→code
// index (for O(1) clearRoomForMatch on settle) — both TTL'd like the room JSON.
const ROOMS_SET = "rt:rooms";
const roomForMatchKey = (matchId: string) => `rt:roomForMatch:${matchId}`;

// A member tracks ALL of a user's sockets in this room (multi-tab), so one tab
// closing doesn't evict a user who is still connected on another. `sockets` is a
// plain string[] (JSON-safe) with Set semantics (dedupe via includes/filter).
type Member = { userId: string; sockets: string[]; name: string; avatarUrl: string | null; tag: string; frameId: string | null };
type Room = {
  code: string;
  hostId: string;
  host: Member;
  guest: Member | null;
  spectators: Record<string, Member>; // userId → member (JSON-safe object)
  banned: string[]; // JSON-safe Set of banned userIds
  settings: GameSettings;
  mode: PrismaMatchMode;
  matchId: string | null; // set once started
  locked: boolean; // host toggled "Lock the room" → room:join is rejected while true
};

// Reclaim a private room once its match settles (it's kept alive during play so
// spectators can still resolve the code — see removeMember). Registered once at
// module load on EVERY instance; the settling instance fires it and the hook's
// room mutations flow through Redis, so the reclaim is cluster-visible.
onMatchEnd((matchId) => {
  void clearRoomForMatch(matchId).catch((e) => console.error("[rooms] clearRoomForMatch failed", matchId, e));
});

const ROOM_PREFIX = (code: string) => `room:${code}`;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars

// ─── Redis room helpers (thin wrappers over the store, plus the two indexes) ──
async function loadRoom(code: string): Promise<Room | null> {
  return getRoomJSON<Room>(RP, code);
}
async function storeRoom(room: Room): Promise<void> {
  await putRoomJSON(RP, room.code, room);
  await redis.sadd(ROOMS_SET, room.code);
  await redis.expire(ROOMS_SET, RT_TTL);
}
/** Fully delete a room + drop it from the enumeration set and any match index. */
async function deleteRoom(room: Room): Promise<void> {
  await delRoomJSON(RP, room.code);
  await redis.srem(ROOMS_SET, room.code);
  if (room.matchId) await redis.del(roomForMatchKey(room.matchId));
}

async function makeCode(rng: () => number): Promise<string> {
  for (;;) {
    let c = "";
    for (let i = 0; i < 6; i++) c += CODE_CHARS[Math.floor(rng() * CODE_CHARS.length)];
    if (!(await redis.sismember(ROOMS_SET, c))) return c;
  }
}

async function memberFor(userId: string, socketId: string): Promise<Member> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true, avatarUrl: true, tag: true, frameId: true },
  });
  return { userId, sockets: [socketId], name: u?.displayName ?? "Player", avatarUrl: u?.avatarUrl ?? null, tag: u?.tag ?? "", frameId: u?.frameId ?? null };
}

/** Find a user's member record in a room (host/guest/spectator), or null. */
function memberIn(room: Room, userId: string): Member | null {
  if (room.host.userId === userId) return room.host;
  if (room.guest?.userId === userId) return room.guest;
  return room.spectators[userId] ?? null;
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
    spectators: Object.values(room.spectators).map(publicMember),
    settings: room.settings,
    mode: room.mode,
    matchId: room.matchId,
    locked: room.locked,
  };
}
function publicMember(m: Member) {
  return { userId: m.userId, name: m.name, avatarUrl: m.avatarUrl, tag: m.tag, frameId: m.frameId };
}

function emitState(io: IOServer, room: Room) {
  io.to(ROOM_PREFIX(room.code)).emit(EV.roomState, roomState(room));
}

/**
 * Fully remove a user from THEIR current room (all their sockets), tearing the
 * room down if they were the host. Intended for an explicit leave/kick/ban.
 *
 * Serialized on the room lock: reads the user's room, mutates, writes back (or
 * deletes) atomically. `userRoom` is cleared first (it's a per-user pointer, not
 * part of the room doc). Broadcasts happen after the write lands.
 *
 * `onlyIfNoSockets` guards the DISCONNECT path (socketLeft): a last-socket
 * teardown releases its lock, then re-acquires it here. In that gap the user can
 * RECONNECT — a fresh socket re-attaches to their member (roomCreate/join
 * re-attach paths above). Without the guard, this second lock would still tear
 * the seat/room down and clobber the live reconnect (the split-lock TOCTOU).
 * When set, we re-read under THIS lock and abort the teardown if the member has
 * re-acquired any socket. Explicit leave/kick/create/join pass it unset (they
 * mean "leave now" regardless of sockets), preserving today's behaviour.
 */
async function removeMember(io: IOServer, userId: string, onlyIfNoSockets = false): Promise<void> {
  const code = await getUserRoom(RP, userId);
  if (!code) return;
  // For the guarded disconnect path, DON'T pre-clear userRoom: a reconnect that
  // won the gap must keep pointing at this room. We clear it inside the lock only
  // once we've confirmed the teardown is really happening.
  if (!onlyIfNoSockets) await setUserRoom(RP, userId, null);
  // withLockRetry (not bare withLock): this teardown MUST run — a silent
  // LOCK_BUSY no-op would leave a dead socket in member.sockets and a stale
  // userRoom pointer, and (on the guarded disconnect path) would defeat the
  // reconnect guard by simply never checking it. Retry the whole lock; log if it
  // truly can't be acquired instead of pretending the section ran.
  await withLockRetry(`room:${code}`, `removeMember(${userId})`, async () => {
    const room = await loadRoom(code);
    if (!room) {
      if (onlyIfNoSockets) await setUserRoom(RP, userId, null); // room gone; drop the stale pointer
      return;
    }
    const member = memberIn(room, userId);
    // Reconnect-during-gap guard: the member picked up a new socket after the
    // last-socket check released the first lock. Leave everything intact — the
    // reconnected socket owns the seat now.
    if (onlyIfNoSockets && member && member.sockets.length > 0) return;
    if (onlyIfNoSockets) await setUserRoom(RP, userId, null); // confirmed teardown → now clear the pointer
    if (member) detachSockets(io, room, member);

    // Once the match has STARTED, the live-match layer (match.ts) is the sole owner
    // of that match's lifecycle — including disconnect/abandonment (its abandon
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
    // wired into match settlement) or via TTL.
    if (room.matchId) {
      if (room.guest?.userId === userId) {
        room.guest = null;
      } else {
        delete room.spectators[userId];
        // Drop this user's sockets from the real spectator count too (harmless
        // no-op for the host/guest, who were never added to it).
        if (member) for (const sid of member.sockets) await removeSpectatorSocket(io, room.matchId, userId, sid);
      }
      // Host leaving the room page after start is normal (they're now in the match);
      // the room lives on for spectators. Persist the membership change; never touch the match.
      await storeRoom(room);
      return;
    }

    if (room.hostId === userId) {
      // Unstarted lobby: the host leaving closes the room for everyone. No match
      // exists yet, so there is nothing to settle.
      io.to(ROOM_PREFIX(code)).emit(EV.roomState, { code, closed: true });
      for (const m of [room.guest, ...Object.values(room.spectators)]) if (m) await setUserRoom(RP, m.userId, null);
      await deleteRoom(room);
      return;
    }
    if (room.guest?.userId === userId) room.guest = null;
    delete room.spectators[userId];
    await storeRoom(room);
    emitState(io, room);
  });
}

/**
 * The room code a user currently belongs to (host, guest, or spectator), or
 * null if they're not in one. Backs GET /api/rooms/mine so the Private Room
 * page can resume an in-progress room on a fresh visit (no ?code needed) —
 * e.g. after a reload or navigating back from another tab.
 *
 * No extra recency/TTL gate is needed here: rooms are already ephemeral by
 * construction (see the module doc comment above) — an unstarted lobby is
 * torn down the instant its host leaves, and a started room is reclaimed the
 * moment its match ends (clearRoomForMatch). So `userRoom` only ever points
 * at a room that is genuinely still active right now.
 */
export async function myRoomCode(userId: string): Promise<string | null> {
  const code = await getUserRoom(RP, userId);
  if (!code) return null;
  return (await loadRoom(code)) ? code : null;
}

/**
 * Reclaim the room that hosted `matchId` once its match has ended. Called from
 * match settlement (via the onMatchEnd hook) so a room kept alive for spectating
 * during play doesn't leak after the game is over. No-op if no room maps to this
 * match (matchmade games, already-cleaned rooms). Frees each remaining member's
 * userRoom mapping too. O(1) via the rt:roomForMatch index (no full scan).
 */
export async function clearRoomForMatch(matchId: string): Promise<void> {
  const code = await redis.get(roomForMatchKey(matchId));
  if (!code) return;
  await withLock(`room:${code}`, async () => {
    const room = await loadRoom(code);
    if (!room || room.matchId !== matchId) {
      // Stale index entry — clean it up and stop.
      await redis.del(roomForMatchKey(matchId));
      return;
    }
    for (const m of [room.host, room.guest, ...Object.values(room.spectators)]) {
      if (m && (await getUserRoom(RP, m.userId)) === code) await setUserRoom(RP, m.userId, null);
    }
    await deleteRoom(room);
  });
}

/** A room surfaced as a synthetic "Live Matches" entry — see /api/matches/live.
 *  Carries userIds (not the full profile) so the REST layer can batch-fetch
 *  each member's live username/trophies alongside the room-cached name/avatar/tag. */
export type OpenRoom = {
  code: string;
  mode: PrismaMatchMode;
  matchId: string | null;
  host: { userId: string; displayName: string; avatarUrl: string | null; tag: string; frameId: string | null };
  guest: { userId: string; displayName: string; avatarUrl: string | null; tag: string; frameId: string | null } | null;
  viewers: number;
};

/**
 * Rooms worth surfacing at the top of the public Live Matches list: a room is
 * spectatable the moment it has a real match running (matchId set — roomSpectate
 * has no gating flag today, so any live room match can already be watched by
 * code) OR an unstarted lobby that has both a host AND a guest seated (about to
 * play — visible so a viewer can catch the very start once it goes live).
 * A lobby with only a host (nobody to watch yet) is never listed. Viewer counts
 * are the REAL cluster-wide spectator total tracked in match.ts (0 for an
 * unstarted lobby, since there is no match room yet to spectate).
 *
 * Enumerates the rt:rooms code set and loads each room JSON. Stale set members
 * (a room deleted without its code being removed — should not happen, but be
 * defensive) whose JSON is gone are pruned from the set here.
 */
export async function listOpenRooms(): Promise<OpenRoom[]> {
  const codes = await redis.smembers(ROOMS_SET);
  const out: OpenRoom[] = [];
  for (const code of codes) {
    const room = await loadRoom(code);
    if (!room) {
      await redis.srem(ROOMS_SET, code); // prune a stale index entry
      continue;
    }
    if (!room.matchId && !room.guest) continue; // nothing to watch yet
    out.push({
      code: room.code,
      mode: room.mode,
      matchId: room.matchId,
      host: { userId: room.host.userId, displayName: room.host.name, avatarUrl: room.host.avatarUrl, tag: room.host.tag, frameId: room.host.frameId },
      guest: room.guest
        ? { userId: room.guest.userId, displayName: room.guest.name, avatarUrl: room.guest.avatarUrl, tag: room.guest.tag, frameId: room.guest.frameId }
        : null,
      viewers: room.matchId ? await spectatorCount(room.matchId) : 0,
    });
  }
  return out;
}

/**
 * Handle ONE socket disconnecting. Only actually removes the user from the room
 * when that was their LAST socket in the room (multi-tab safe) — a user with
 * another open tab keeps their seat. The socket removal + last-socket check run
 * under the room lock; the actual teardown (removeMember) re-acquires the lock
 * with a fresh read. Between the two locks a reconnect can re-attach a fresh
 * socket, so the teardown is GUARDED (onlyIfNoSockets): it aborts if the member
 * regained any socket in the gap, so a reconnecting host is never clobbered.
 */
async function socketLeft(io: IOServer, userId: string, socketId: string): Promise<void> {
  const code = await getUserRoom(RP, userId);
  if (!code) return;
  let lastSocket = false;
  // withLockRetry: dropping the dead socket from member.sockets MUST run — a
  // silent LOCK_BUSY no-op would leave the room doc referencing a socket that
  // socket.io already tore down, and never trigger the last-socket teardown.
  await withLockRetry(`room:${code}`, `socketLeft(${userId})`, async () => {
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

export function registerRooms(io: IOServer, socket: Socket) {
  const userId = socket.data.userId as string;
  // Deterministic-enough code generator (Math.random is fine for room codes).
  const rng = Math.random;

  socket.on(EV.roomCreate, async (payload: { mode?: unknown } = {}) => {
    if (!allow(socket, "room:create", 5, 10_000)) return; // anti-spam
    // If the host already hosts a room, a second tab re-attaches instead of
    // orphaning the first room.
    const existingCode = await getUserRoom(RP, userId);
    if (existingCode) {
      let reattached: Room | null = null;
      await withLock(`room:${existingCode}`, async () => {
        const existingRoom = await loadRoom(existingCode);
        if (existingRoom && existingRoom.hostId === userId) {
          if (!existingRoom.host.sockets.includes(socket.id)) existingRoom.host.sockets.push(socket.id);
          await storeRoom(existingRoom);
          reattached = existingRoom;
        }
      });
      if (reattached) {
        void socket.join(ROOM_PREFIX(existingCode));
        socket.emit(EV.roomState, roomState(reattached));
        return;
      }
    }
    await removeMember(io, userId); // one room at a time (explicit leave of any prior room)
    const code = await makeCode(rng);
    const host = await memberFor(userId, socket.id);
    const mode = (payload?.mode === "RANKED" ? "RANKED" : "PRIVATE") as PrismaMatchMode;
    const room: Room = {
      code,
      hostId: userId,
      host,
      guest: null,
      spectators: {},
      banned: [],
      settings: { ...DEFAULT_SETTINGS },
      mode,
      matchId: null,
      locked: false,
    };
    await withLock(`room:${code}`, async () => {
      await storeRoom(room);
      await setUserRoom(RP, userId, code);
    });
    void socket.join(ROOM_PREFIX(code));
    socket.emit(EV.roomState, roomState(room));
  });

  socket.on(EV.roomJoin, async (payload: { code?: unknown } = {}) => {
    if (!allow(socket, "room:join", 15, 10_000)) return; // anti-brute-force on codes
    const code = typeof payload?.code === "string" ? payload.code.trim().toUpperCase() : null;
    if (!code) return;
    // Peek before locking so a not-found/banned reply doesn't need the lock.
    const peek = await loadRoom(code);
    if (!peek) {
      socket.emit(EV.roomState, { code, error: "not-found" });
      return;
    }
    if (peek.banned.includes(userId)) {
      socket.emit(EV.roomState, { code, error: "banned" });
      return;
    }
    // Multi-tab: if already in THIS room, just attach the new socket to the same
    // member (keep their seat); otherwise leave any prior room and take a slot.
    const prior = await getUserRoom(RP, userId);
    const alreadyHere = prior === code && !!memberIn(peek, userId);
    // Locked room: a NEW joiner is turned away (the host can still lock a room to
    // stop drop-ins by code). An existing member (host/guest reattaching, e.g. a
    // second tab or a reconnect) is unaffected — only fresh joins are gated.
    if (peek.locked && !alreadyHere) {
      socket.emit(EV.roomState, { code, error: "locked" });
      return;
    }
    if (!alreadyHere) await removeMember(io, userId); // leave any OTHER room first (outside this lock)
    const member = alreadyHere ? null : await memberFor(userId, socket.id);
    void socket.join(ROOM_PREFIX(code));
    let out: Room | null = null;
    await withLock(`room:${code}`, async () => {
      const room = await loadRoom(code);
      if (!room || room.banned.includes(userId)) return;
      const existing = memberIn(room, userId);
      if (existing) {
        if (!existing.sockets.includes(socket.id)) existing.sockets.push(socket.id);
      } else if (member) {
        await setUserRoom(RP, userId, code);
        if (!room.guest && room.hostId !== userId) room.guest = member;
        else if (room.hostId !== userId) room.spectators[userId] = member;
      }
      await storeRoom(room);
      out = room;
    });
    if (out) emitState(io, out);
  });

  socket.on(EV.roomSpectate, async (payload: { code?: unknown } = {}) => {
    const code = typeof payload?.code === "string" ? payload.code.trim().toUpperCase() : null;
    if (!code) return;
    const peek = await loadRoom(code);
    if (!peek || peek.banned.includes(userId)) return;
    const prior = await getUserRoom(RP, userId);
    const alreadyHere = prior === code && !!memberIn(peek, userId);
    if (!alreadyHere) await removeMember(io, userId);
    const member = alreadyHere ? null : await memberFor(userId, socket.id);
    void socket.join(ROOM_PREFIX(code));
    let out: Room | null = null;
    let liveMatchId: string | null = null;
    await withLock(`room:${code}`, async () => {
      const room = await loadRoom(code);
      if (!room || room.banned.includes(userId)) return;
      const existing = memberIn(room, userId);
      if (existing) {
        if (!existing.sockets.includes(socket.id)) existing.sockets.push(socket.id);
      } else if (member) {
        await setUserRoom(RP, userId, code);
        room.spectators[userId] = member;
      }
      await storeRoom(room);
      out = room;
      liveMatchId = room.matchId;
    });
    if (!out) return;
    // Late spectator: if a match is already live in this room, join this socket to
    // the match channel and tell it to open the board read-only. The client then
    // resyncs to pull the current board state. This socket also counts toward the
    // match's REAL spectator total (same counter the by-id /watch path feeds).
    if (liveMatchId) {
      void socket.join(liveMatchId);
      await addSpectatorSocket(io, liveMatchId, userId, socket.id);
      socket.emit(EV.roomStart, { matchId: liveMatchId, yourColor: null });
    }
    emitState(io, out);
  });

  socket.on(EV.roomSettings, async (payload: { settings?: Partial<GameSettings> } = {}) => {
    const code = await getUserRoom(RP, userId);
    if (!code) return;
    let out: Room | null = null;
    await withLock(`room:${code}`, async () => {
      const room = await loadRoom(code);
      if (!room || room.hostId !== userId) return; // host only
      if (payload.settings) room.settings = sanitizeSettings(room.settings, payload.settings);
      await storeRoom(room);
      out = room;
    });
    if (out) emitState(io, out);
  });

  socket.on(EV.roomLock, async (payload: { locked?: unknown } = {}) => {
    // Host toggles "Lock the room" — while locked, new joiners hit the "locked"
    // error in room:join (existing members are unaffected). Host only; the new
    // value is taken from the payload (a plain boolean), defaulting to a flip if
    // absent, so the client can send an explicit desired state.
    const code = await getUserRoom(RP, userId);
    if (!code) return;
    let out: Room | null = null;
    await withLock(`room:${code}`, async () => {
      const room = await loadRoom(code);
      if (!room || room.hostId !== userId) return; // host only
      room.locked = typeof payload.locked === "boolean" ? payload.locked : !room.locked;
      await storeRoom(room);
      out = room;
    });
    if (out) emitState(io, out);
  });

  socket.on(EV.roomKick, async (payload: { userId?: unknown } = {}) => {
    const code = await getUserRoom(RP, userId);
    const target = typeof payload?.userId === "string" ? payload.userId : null;
    if (!code || !target || target === userId) return;
    let doRemove = false;
    await withLock(`room:${code}`, async () => {
      const room = await loadRoom(code);
      // Host only, AND the target must actually be in THIS room (scoped — a host of
      // one room cannot kick a user out of a different room).
      if (!room || room.hostId !== userId) return;
      if ((await getUserRoom(RP, target)) !== code || !memberIn(room, target)) return;
      doRemove = true;
    });
    if (!doRemove) return;
    io.to(`presence:${target}`).emit(EV.roomState, { code, kicked: target });
    await removeMember(io, target); // detaches their sockets from the room too
  });

  socket.on(EV.roomBan, async (payload: { userId?: unknown } = {}) => {
    const code = await getUserRoom(RP, userId);
    const target = typeof payload?.userId === "string" ? payload.userId : null;
    if (!code || !target || target === userId) return;
    let doBan = false;
    await withLock(`room:${code}`, async () => {
      const room = await loadRoom(code);
      if (!room || room.hostId !== userId) return;
      if ((await getUserRoom(RP, target)) !== code || !memberIn(room, target)) return;
      if (!room.banned.includes(target)) room.banned.push(target);
      await storeRoom(room);
      doBan = true;
    });
    if (!doBan) return;
    io.to(`presence:${target}`).emit(EV.roomState, { code, banned: target });
    await removeMember(io, target);
  });

  socket.on(EV.roomStart, async () => {
    const code = await getUserRoom(RP, userId);
    if (!code) return;
    // Create the DB match + claim the room's matchId under the lock (idempotent:
    // a second Start finds matchId already set and aborts). The live-match seed +
    // socket wiring + broadcasts run AFTER we own the matchId, using a snapshot.
    let started: Room | null = null;
    let createErr = false;
    await withLock(`room:${code}`, async () => {
      const room = await loadRoom(code);
      if (!room || room.hostId !== userId || !room.guest || room.matchId) return; // need a guest, not already started
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
        await storeRoom(room);
        // Index this match → room so clearRoomForMatch can reclaim it O(1) on settle.
        await redis.set(roomForMatchKey(match.id), code, "EX", RT_TTL);
        started = room;
      } catch (e) {
        console.error("[rooms] start failed", e);
        createErr = true;
      }
    });
    if (createErr || !started) return;
    const room = started as Room;
    const matchId = room.matchId as string;
    // Seed the live match in Redis BEFORE the first move can arrive. Awaited (the
    // T5-deferred fix): not awaiting races the host's first matchMove ahead of the
    // Redis write → getMatch null → matchIllegal no-such-match.
    await createLiveMatch(matchId, room.hostId, room.guest!.userId, room.mode, room.settings);
    // Put both players' sockets into the match room.
    for (const uid of [room.hostId, room.guest!.userId]) {
      const r = io.sockets.adapter.rooms.get(`presence:${uid}`);
      if (r) for (const sid of r) io.sockets.sockets.get(sid)?.join(matchId);
    }
    io.to(`presence:${room.hostId}`).emit(EV.roomStart, { matchId, yourColor: "red" });
    io.to(`presence:${room.guest!.userId}`).emit(EV.roomStart, { matchId, yourColor: "blue" });
    // Spectators watch READ-ONLY: join their sockets to the match room so they
    // receive matchMoved/matchState, and tell them to open the board with
    // yourColor:null. They can never move — the match move handlers gate on
    // colorOf(), and a spectator has no color. Each socket also joins the real
    // spectator count for this match.
    for (const spec of Object.values(room.spectators)) {
      for (const sid of spec.sockets) {
        io.sockets.sockets.get(sid)?.join(matchId);
        await addSpectatorSocket(io, matchId, spec.userId, sid);
      }
      io.to(`presence:${spec.userId}`).emit(EV.roomStart, { matchId, yourColor: null });
    }
    emitState(io, room); // spectators see matchId now
  });

  // Room chat — relay to everyone in the room (ephemeral; not persisted).
  socket.on(EV.roomInvite, () => {
    // invite is handled client-side via the shareable code/link; nothing server-side needed.
  });

  socket.on("room:chat", async (payload: { body?: unknown } = {}) => {
    if (!allow(socket, "room:chat", 8, 4000)) return; // anti-flood
    const code = await getUserRoom(RP, userId);
    const room = code ? await loadRoom(code) : null;
    if (!room) return;
    const body = typeof payload?.body === "string" ? payload.body.trim().slice(0, 300) : "";
    if (!body) return;
    if (await isMuted(userId)) return; // admin-muted players can't chat in rooms
    const from = memberIn(room, userId);
    io.to(ROOM_PREFIX(code!)).emit("room:chat", {
      from: from ? publicMember(from) : { userId, name: "Player", avatarUrl: null, tag: "" },
      body,
      at: Date.now(),
    });
  });

  socket.on(EV.roomLeave, () => {
    void removeMember(io, userId).catch((e) => console.error("[rooms] leave failed", e));
  });
  socket.on("disconnect", () => {
    void socketLeft(io, userId, socket.id).catch((e) => console.error("[rooms] socketLeft failed", e));
  });
}
