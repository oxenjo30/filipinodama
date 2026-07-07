/**
 * play-bot.mts — a headless "player" that drives the SAME online-match protocol
 * the browser uses (apps/web/src/stores/onlineStore.ts): log in over HTTP, open
 * the Socket.IO /rt connection authenticated by the login JWT, join the queue,
 * and play legal moves the server accepts until the match ends.
 *
 * It is intentionally a faithful mirror of the client:
 *   login → EV.mmJoin → EV.mmFound → EV.matchResync → EV.matchState
 *         → (on our turn) pick a legalMoves() move → EV.matchMove
 *         → EV.matchMoved / EV.matchEnded
 *
 * Move choice: capture-first (Dama forces captures anyway), else a random legal
 * quiet move — enough to play a real game to completion without an AI.
 *
 * Usage:
 *   npx tsx scripts/play-bot.mts --email <e> --password <p> --mode RANKED [--api http://localhost:4000]
 *
 * Env fallbacks: BOT_EMAIL, BOT_PASSWORD, BOT_MODE, API_URL.
 */
import { io, type Socket } from "socket.io-client";
import { EV, sameSquare, type GameState, type Move, type PieceColor } from "@dama/shared";
import { legalMoves } from "@dama/game-engine";

// ── args ──
function arg(name: string, envKey: string, dflt = ""): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return process.env[envKey] ?? dflt;
}
const API = arg("api", "API_URL", "http://localhost:4000");
const EMAIL = arg("email", "BOT_EMAIL");
const PASSWORD = arg("password", "BOT_PASSWORD");
const MODE = (arg("mode", "BOT_MODE", "RANKED").toUpperCase() as "RANKED" | "CASUAL");
const LABEL = EMAIL.split("@")[0] || "bot";

if (!EMAIL || !PASSWORD) {
  console.error(`[${LABEL}] missing --email/--password`);
  process.exit(2);
}

const log = (...a: unknown[]) => console.log(`[${LABEL}]`, ...a);

// ── 1. login → grab the fd_access JWT from Set-Cookie ──
async function login(): Promise<string> {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) {
    throw new Error(`login failed: ${res.status} ${JSON.stringify(body?.error ?? body)}`);
  }
  const setCookie = res.headers.get("set-cookie") ?? "";
  const m = /fd_access=([^;]+)/.exec(setCookie);
  if (!m) throw new Error("no fd_access cookie in login response");
  const user = body?.data?.user ?? body?.user ?? body?.data;
  log(`logged in as ${user?.displayName ?? EMAIL} (trophies ${user?.trophies ?? "?"})`);
  return m[1];
}

/** Pick a move: prefer a capture (Dama mandates it anyway), else a random quiet move. */
function pickMove(state: GameState, myColor: PieceColor): Move | null {
  const mine = legalMoves(state).filter((mv) => mv.from && state.pieces.some((p) => sameSquare(p.square, mv.from) && p.color === myColor));
  const all = mine.length ? mine : legalMoves(state);
  if (!all.length) return null;
  const caps = all.filter((m) => m.captures.length > 0);
  const pool = caps.length ? caps : all;
  // vary selection so the two bots don't lock into a repetition draw immediately
  return pool[Math.floor(Math.random() * pool.length)];
}

async function main() {
  const token = await login();

  const socket: Socket = io(API, {
    path: "/rt",
    transports: ["websocket"],
    auth: { token },
    reconnection: false,
  });

  let matchId: string | null = null;
  let myColor: PieceColor | null = null;
  let moves = 0;
  let done = false;

  const finish = (code: number, why: string) => {
    if (done) return;
    done = true;
    log(why);
    socket.close();
    // small grace so the log flushes
    setTimeout(() => process.exit(code), 150);
  };

  // safety timeout so a hung queue/match never blocks forever
  const HARD_TIMEOUT_MS = 90_000;
  const killer = setTimeout(() => finish(3, "TIMEOUT — no completion within 90s"), HARD_TIMEOUT_MS);

  function maybeMove(state: GameState) {
    if (!myColor || state.result) return;
    if (state.turn !== myColor) return; // not our turn
    const move = pickMove(state, myColor);
    if (!move) {
      log("no legal move available on our turn");
      return;
    }
    moves++;
    socket.emit(EV.matchMove, { matchId, move });
  }

  socket.on("connect", () => {
    log("socket connected → joining", MODE, "queue");
    socket.emit(EV.mmJoin, { mode: MODE });
  });

  socket.on("connect_error", (e: Error) => finish(4, `socket connect_error: ${e.message}`));

  socket.on(EV.mmSearching, () => log("searching for opponent…"));

  socket.on(EV.mmFound, (p: { matchId: string; opponent: { displayName?: string } | null; yourColor: PieceColor }) => {
    matchId = p.matchId;
    myColor = p.yourColor;
    log(`MATCH FOUND vs ${p.opponent?.displayName ?? "?"} — I am ${myColor} (match ${matchId.slice(0, 8)})`);
    socket.emit(EV.matchResync, { matchId });
  });

  socket.on(EV.mmCancelled, (p: { reason?: string }) => {
    if (p?.reason && p.reason !== "left") log("queue cancelled:", p.reason);
  });

  socket.on(EV.matchState, (p: { state: GameState; yourColor: PieceColor | null }) => {
    if (p.yourColor) myColor = p.yourColor;
    maybeMove(p.state);
  });

  socket.on(EV.matchMoved, (p: { move: Move; state: GameState }) => {
    maybeMove(p.state);
  });

  socket.on(EV.matchIllegal, (p: { reason?: string }) => {
    // Shouldn't happen (we only send legalMoves() output), but recover: resync.
    log("server rejected a move:", p?.reason ?? "?", "→ resyncing");
    if (matchId) socket.emit(EV.matchResync, { matchId });
  });

  socket.on(EV.matchEnded, (p: { result: { winner: string; reason: string }; winnerId: string | null }) => {
    clearTimeout(killer);
    const outcome =
      p.result.winner === "draw"
        ? "DRAW"
        : p.result.winner === myColor
          ? "I WON"
          : "I LOST";
    finish(0, `MATCH ENDED after ${moves} of my moves → ${outcome} (winner=${p.result.winner}, reason=${p.result.reason})`);
  });
}

main().catch((e) => {
  console.error(`[${LABEL}] fatal:`, e.message);
  process.exit(1);
});
