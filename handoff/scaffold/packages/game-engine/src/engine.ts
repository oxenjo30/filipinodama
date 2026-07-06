import {
  type GameState,
  type GameSettings,
  type Move,
  type Piece,
  type PieceColor,
  type Square,
  DEFAULT_SETTINGS,
  isDark,
  sameSquare,
} from "@dama/shared";

// Red sits at the bottom (rows 5-7) and moves UP (decreasing row).
// Blue sits at the top (rows 0-2) and moves DOWN (increasing row).
const DIRS: Square[] = [
  { r: -1, c: -1 },
  { r: -1, c: 1 },
  { r: 1, c: -1 },
  { r: 1, c: 1 },
];

let idc = 0;
const nid = () => `p${idc++}`;
const inBounds = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const opp = (c: PieceColor): PieceColor => (c === "red" ? "blue" : "red");
const backRank = (c: PieceColor) => (c === "red" ? 0 : 7);
const forwardDir = (c: PieceColor) => (c === "red" ? -1 : 1);

export function createInitialState(
  settings: GameSettings = DEFAULT_SETTINGS,
  id = "local",
): GameState {
  idc = 0;
  const pieces: Piece[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (!isDark(r, c)) continue;
      if (r <= 2) pieces.push({ id: nid(), color: "blue", king: false, square: { r, c } });
      else if (r >= 5) pieces.push({ id: nid(), color: "red", king: false, square: { r, c } });
    }
  }
  return { id, pieces, turn: "red", moveNumber: 1, history: [], settings };
}

const at = (pieces: Piece[], r: number, c: number) =>
  pieces.find((p) => p.square.r === r && p.square.c === c);

/** All non-capturing moves for a single piece. */
function quietMoves(state: GameState, p: Piece): Move[] {
  const out: Move[] = [];
  const dirs = p.king ? DIRS : DIRS.filter((d) => d.r === forwardDir(p.color));
  for (const d of dirs) {
    let r = p.square.r + d.r;
    let c = p.square.c + d.c;
    if (p.king) {
      while (inBounds(r, c) && !at(state.pieces, r, c)) {
        out.push(mkMove(p, [{ r, c }], []));
        r += d.r;
        c += d.c;
      }
    } else if (inBounds(r, c) && !at(state.pieces, r, c)) {
      out.push(mkMove(p, [{ r, c }], []));
    }
  }
  return out;
}

function mkMove(p: Piece, path: Square[], captures: Square[]): Move {
  const landing = path[path.length - 1];
  const promotion = !p.king && landing.r === backRank(p.color);
  return { from: { ...p.square }, path, captures, promotion };
}

/** Recursively build all capture chains for a piece from a working board. */
function captureChains(
  pieces: Piece[],
  p: Piece,
  from: Square,
  king: boolean,
  taken: Square[],
  path: Square[],
): { path: Square[]; captures: Square[] }[] {
  const results: { path: Square[]; captures: Square[] }[] = [];
  const dirs = DIRS; // men may capture forward AND backward in Filipino Dama

  for (const d of dirs) {
    if (king) {
      // fly: scan for the first enemy piece with empty squares beyond
      let r = from.r + d.r;
      let c = from.c + d.c;
      while (inBounds(r, c) && !occupied(pieces, taken, r, c)) {
        r += d.r;
        c += d.c;
      }
      if (!inBounds(r, c)) continue;
      const victim = pieceOn(pieces, taken, r, c);
      if (!victim || victim.color === p.color) continue;
      if (taken.some((t) => t.r === r && t.c === c)) continue;
      // landing squares beyond the victim
      let lr = r + d.r;
      let lc = c + d.c;
      while (inBounds(lr, lc) && !occupied(pieces, taken, lr, lc)) {
        pushChain(results, pieces, p, { r: lr, c: lc }, king, [...taken, { r, c }], path);
        lr += d.r;
        lc += d.c;
      }
    } else {
      const mr = from.r + d.r;
      const mc = from.c + d.c;
      const lr = from.r + 2 * d.r;
      const lc = from.c + 2 * d.c;
      if (!inBounds(lr, lc)) continue;
      const victim = pieceOn(pieces, taken, mr, mc);
      if (!victim || victim.color === p.color) continue;
      if (taken.some((t) => t.r === mr && t.c === mc)) continue;
      if (occupied(pieces, taken, lr, lc)) continue;
      // promotion mid-chain ends the turn (Filipino rule)
      const promotes = lr === backRank(p.color);
      pushChain(results, pieces, p, { r: lr, c: lc }, king || promotes, [...taken, { r: mr, c: mc }], path, promotes);
    }
  }
  return results;
}

function pushChain(
  results: { path: Square[]; captures: Square[] }[],
  pieces: Piece[],
  p: Piece,
  landing: Square,
  king: boolean,
  taken: Square[],
  path: Square[],
  stop = false,
) {
  const newPath = [...path, landing];
  const cont = stop ? [] : captureChains(pieces, p, landing, king, taken, newPath);
  if (cont.length === 0) results.push({ path: newPath, captures: taken });
  else results.push(...cont);
}

/** a square is "occupied" if a live (non-taken) piece stands there */
function occupied(pieces: Piece[], taken: Square[], r: number, c: number) {
  return !!pieceOn(pieces, taken, r, c);
}
function pieceOn(pieces: Piece[], taken: Square[], r: number, c: number) {
  const pc = at(pieces, r, c);
  if (!pc) return undefined;
  if (taken.some((t) => t.r === r && t.c === c)) return undefined; // captured this chain still blocks re-jump but not landing
  return pc;
}

/** Legal moves for the side to move (or a given color). Captures are mandatory;
 *  when settings.forcedMaxCapture, only the longest chains survive. */
export function legalMoves(state: GameState, color: PieceColor = state.turn): Move[] {
  const mine = state.pieces.filter((p) => p.color === color);
  const captures: Move[] = [];
  for (const p of mine) {
    const chains = captureChains(state.pieces, p, p.square, p.king, [], [p.square]);
    for (const ch of chains) {
      const realPath = ch.path.slice(1); // drop origin
      captures.push(mkMove(p, realPath, ch.captures));
    }
  }
  if (captures.length > 0) {
    if (!state.settings.forcedMaxCapture) return captures;
    const max = Math.max(...captures.map((m) => m.captures.length));
    return captures.filter((m) => m.captures.length === max);
  }
  const quiet: Move[] = [];
  for (const p of mine) quiet.push(...quietMoves(state, p));
  return quiet;
}

export function isLegal(state: GameState, move: Move): boolean {
  return legalMoves(state).some(
    (m) =>
      sameSquare(m.from, move.from) &&
      m.path.length === move.path.length &&
      m.path.every((s, i) => sameSquare(s, move.path[i])),
  );
}

export function applyMove(state: GameState, move: Move): GameState {
  if (!isLegal(state, move)) throw new Error("Illegal move");
  const next = clone(state);
  const p = at(next.pieces, move.from.r, move.from.c)!;
  // remove captured
  next.pieces = next.pieces.filter((pc) => !move.captures.some((cap) => sameSquare(cap, pc.square)));
  const landing = move.path[move.path.length - 1];
  p.square = { ...landing };
  if (move.promotion) p.king = true;
  next.history.push(move);
  next.turn = opp(state.turn);
  next.moveNumber += 1;
  next.result = checkOutcome(next);
  return next;
}

export function checkOutcome(state: GameState): GameState["result"] {
  const redLeft = state.pieces.some((p) => p.color === "red");
  const blueLeft = state.pieces.some((p) => p.color === "blue");
  if (!blueLeft) return { winner: "red", reason: "capture-all" };
  if (!redLeft) return { winner: "blue", reason: "capture-all" };
  if (legalMoves(state, state.turn).length === 0) {
    return { winner: opp(state.turn), reason: "no-moves" };
  }
  // draw by inactivity: N consecutive king moves w/ no capture and no man move
  const limit = state.settings.drawMoveLimit;
  const recent = state.history.slice(-limit);
  if (
    recent.length >= limit &&
    recent.every((m) => m.captures.length === 0 && !m.promotion)
  ) {
    // (a fuller impl also checks the moved piece was a king; kept simple here)
    return { winner: "draw", reason: "inactivity" };
  }
  return undefined;
}
