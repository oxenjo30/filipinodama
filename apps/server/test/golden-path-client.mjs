// Scripted "second player" for the Android golden-path verification (Phase 8).
// Not a browser — a plain Node script using the REAL REST + socket.io wire
// protocol, mirroring apps/server/test/rooms-start-leave.test.ts against the
// actually-running local dev server (not an in-process test server).
//
// Usage: node test/golden-path-client.mjs <command> [...args]
//   login <email> <password>              -> prints cookie + userId
//   join-room <email> <password> <code>   -> joins a private room by code, waits for host to start,
//                                            plays a couple of legal Damath... (classic dama) moves via
//                                            server-authoritative match:move, sends a chat message.
//   get-match <email> <password> <matchId> -> REST GET the match row
//
// All commands print a single JSON line to stdout on success ({"ok":true,...})
// or exit non-zero with an error JSON line.

import { io as ioClient } from "socket.io-client";

const BASE = process.env.GP_BASE_URL ?? "http://localhost:4000";

async function loginCookie(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`login failed: ${res.status} ${body}`);
  }
  const setCookie = res.headers.get("set-cookie") ?? res.headers.getSetCookie?.().join("; ") ?? "";
  // Node's fetch (undici) exposes getSetCookie() for multiple Set-Cookie headers.
  let cookies = [];
  if (typeof res.headers.getSetCookie === "function") {
    cookies = res.headers.getSetCookie();
  } else if (setCookie) {
    cookies = [setCookie];
  }
  const cookieHeader = cookies.map((c) => c.split(";")[0]).join("; ");
  const body = await res.json();
  return { cookieHeader, user: body.data.user };
}

function connectSocket(cookieHeader) {
  return ioClient(BASE, {
    path: "/rt",
    transports: ["websocket"],
    forceNew: true,
    extraHeaders: { Cookie: cookieHeader },
  });
}

function waitFor(socket, event, ms = 8000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    socket.once(event, (p) => {
      clearTimeout(t);
      resolve(p);
    });
  });
}

const EV = {
  roomJoin: "room:join",
  roomState: "room:state",
  roomStart: "room:start",
  matchMove: "match:move",
  matchMoved: "match:moved",
  matchState: "match:state",
  matchIllegal: "match:illegal",
  matchResync: "match:resync",
  matchEnded: "match:ended",
  matchChat: "match:chat",
};

async function cmdLogin(email, password) {
  const { cookieHeader, user } = await loginCookie(email, password);
  console.log(JSON.stringify({ ok: true, cookieHeader, user }));
}

async function cmdGetMatch(email, password, matchId) {
  const { cookieHeader } = await loginCookie(email, password);
  const res = await fetch(`${BASE}/api/matches/${matchId}`, { headers: { Cookie: cookieHeader } });
  const body = await res.json();
  console.log(JSON.stringify({ ok: res.ok, status: res.status, body }));
}

// Finds ALL legal single-step moves for `color` from a real game-engine state
// { pieces: [{id,color,king,square:{r,c}}], turn, ... } (packages/shared/src/game.ts
// Piece/GameState — NOT a board[r][c] grid) by asking the server (client can't
// know rules) — we just try candidate diagonal moves and let the server's
// match:illegal / match:moved tell us what's legal. This mirrors how a dumb
// client would work: try, then react.
function diagCandidates(square) {
  const { r, c } = square;
  return [
    { r: r - 1, c: c - 1 }, { r: r - 1, c: c + 1 },
    { r: r + 1, c: c - 1 }, { r: r + 1, c: c + 1 },
  ].filter(({ r: rr, c: cc }) => rr >= 0 && rr < 8 && cc >= 0 && cc < 8);
}

async function cmdJoinRoom(email, password, code) {
  const { cookieHeader, user } = await loginCookie(email, password);
  const socket = connectSocket(cookieHeader);
  await waitFor(socket, "connect");

  socket.emit(EV.roomJoin, { code });
  const joined = await waitFor(socket, EV.roomState, 8000);

  const start = await waitFor(socket, EV.roomStart, 180000); // wait for host to press Start (generous — manual UI driving)
  const matchId = start.matchId;
  const myColor = start.yourColor;

  // room:start does NOT carry board state — explicitly resync to get it.
  const stateP = waitFor(socket, EV.matchState, 8000).catch(() => null);
  socket.emit(EV.matchResync, { matchId });
  const state = await stateP;

  // Send an in-match chat message (Path 9 evidence).
  socket.emit(EV.matchChat, { matchId, text: "gl hf — scripted client here" });

  // Try to play up to 2 legal moves when it's our turn, by scanning our pieces'
  // diagonal candidates and letting the server confirm legality.
  let movesPlayed = 0;
  let lastState = state?.state ?? state;
  if (!lastState) {
    console.log(JSON.stringify({ ok: false, error: "no initial state after resync", matchId, myColor }));
    socket.disconnect();
    return;
  }

  for (let attempt = 0; attempt < 40 && movesPlayed < 2; attempt++) {
    // Wait for a moment where it's our turn.
    let cur = lastState;
    if (!cur || cur.turn !== myColor) {
      const res = await Promise.race([
        waitFor(socket, EV.matchMoved, 15000).then((p) => ({ type: "moved", p })),
        waitFor(socket, EV.matchEnded, 15000).then((p) => ({ type: "ended", p })),
      ]).catch(() => null);
      if (!res) break;
      if (res.type === "ended") {
        console.log(JSON.stringify({ ok: true, matchId, movesPlayed, ended: res.p, myColor }));
        socket.disconnect();
        return;
      }
      lastState = res.p.state;
      cur = lastState;
      if (cur.turn !== myColor) continue;
    }

    // Find one of our pieces and try each diagonal candidate until one sticks.
    // state.pieces is a flat array (see packages/shared/src/game.ts), not a
    // board[r][c] grid — look up occupancy by scanning it.
    const pieces = cur.pieces ?? [];
    const occupied = (r, c) => pieces.some((p) => p.square.r === r && p.square.c === c);
    const myPieces = pieces.filter((p) => p.color === myColor);
    let played = false;
    for (const piece of myPieces) {
      if (played) break;
      for (const to of diagCandidates(piece.square)) {
        if (occupied(to.r, to.c)) continue;
        // Move wire shape is packages/shared/src/dto.ts moveSchema:
        // { from: {r,c}, path: [{r,c}, ...], captures: [{r,c}, ...], promotion }
        const move = { from: piece.square, path: [to], captures: [], promotion: false };
        const illegalP = waitFor(socket, EV.matchIllegal, 1500).catch(() => null);
        const movedP = waitFor(socket, EV.matchMoved, 1500).catch(() => null);
        socket.emit(EV.matchMove, { matchId, move });
        const res = await Promise.race([illegalP, movedP]);
        if (res && res.move) {
          lastState = res.state;
          movesPlayed++;
          played = true;
          break;
        }
      }
    }
    if (!played) {
      // Nothing worked this round (maybe a forced-capture rule blocked all
      // simple moves) — wait for opponent/bot and retry.
      continue;
    }
  }

  console.log(JSON.stringify({ ok: true, matchId, movesPlayed, myColor, user: user.username }));
  socket.disconnect();
}

const [, , cmd, ...args] = process.argv;
try {
  if (cmd === "login") await cmdLogin(...args);
  else if (cmd === "get-match") await cmdGetMatch(...args);
  else if (cmd === "join-room") await cmdJoinRoom(...args);
  else throw new Error(`unknown command ${cmd}`);
  process.exit(0);
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: String(err?.message ?? err) }));
  process.exit(1);
}
