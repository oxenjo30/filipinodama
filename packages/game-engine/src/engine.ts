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
      // pieceOn() already excludes squares taken earlier in this chain, so a
      // still-present captured piece is never selected as a (re-)victim here.
      const victim = pieceOn(pieces, taken, r, c);
      if (!victim || victim.color === p.color) continue;
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
      // pieceOn() already excludes a square taken earlier in this chain, so the
      // same enemy man can never be jumped twice within one chain.
      const victim = pieceOn(pieces, taken, mr, mc);
      if (!victim || victim.color === p.color) continue;
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

/**
 * A square is "occupied" if ANY piece physically stands on it — including a
 * piece captured earlier in the current chain. Per GAME_RULES.md §5, captured
 * pieces are not removed until the chain ends: their squares still BLOCK landing
 * and a flying king cannot pass over them. So occupancy is based on physical
 * presence (`at`), not on whether the piece is still capturable.
 */
function occupied(pieces: Piece[], _taken: Square[], r: number, c: number) {
  return !!at(pieces, r, c);
}
/**
 * The capturable enemy piece on a square, if any. A piece already taken this
 * chain is NOT a valid victim (you may not re-jump the same piece), so it is
 * reported as absent for victim-selection purposes even though it still
 * physically blocks the board (see `occupied`).
 */
function pieceOn(pieces: Piece[], taken: Square[], r: number, c: number) {
  const pc = at(pieces, r, c);
  if (!pc) return undefined;
  if (taken.some((t) => t.r === r && t.c === c)) return undefined; // taken -> not a re-jumpable victim
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

/**
 * Apply a move to a board in place (mutating). Does NOT compute outcome or
 * clone. Used internally by applyMove (on a fresh clone) and by history replay
 * so that checkOutcome can reconstruct prior positions without recursing back
 * into itself through applyMove.
 */
function applyMoveRaw(state: GameState, move: Move): void {
  const p = at(state.pieces, move.from.r, move.from.c)!;
  state.pieces = state.pieces.filter(
    (pc) => !move.captures.some((cap) => sameSquare(cap, pc.square)),
  );
  const landing = move.path[move.path.length - 1];
  p.square = { ...landing };
  // Promotion is AUTHORITATIVE from the rules — a man that ends its move on its
  // back rank is always crowned. We derive it from the landing square rather
  // than trusting move.promotion, because isLegal() only matches from/path (not
  // the promotion flag), so a client could otherwise send a promoting move with
  // promotion:false and land a king-less piece on the back rank.
  if (!p.king && landing.r === backRank(p.color)) p.king = true;
  state.history.push(move);
  state.turn = opp(state.turn);
  state.moveNumber += 1;
}

export function applyMove(state: GameState, move: Move): GameState {
  if (!isLegal(state, move)) throw new Error("Illegal move");
  const next = clone(state);
  applyMoveRaw(next, move);
  next.result = checkOutcome(next);
  return next;
}

/**
 * A canonical, side-to-move-aware string key for a position. Pieces are sorted
 * by square so piece ordering / ids never affect the key. Two positions with
 * the same key are the "same position" for threefold-repetition purposes.
 */
export function positionKey(state: GameState): string {
  const parts = state.pieces
    .map((p) => `${p.square.r},${p.square.c},${p.color},${p.king ? "K" : "m"}`)
    .sort();
  return `${state.turn}|${parts.join(";")}`;
}

/**
 * Reconstruct every position the game has passed through, from the initial
 * (pre-move) position up to and including the current one, by replaying
 * `history` on a fresh clone. Never invokes checkOutcome, so it is safe to call
 * from within checkOutcome. Also reports, per ply, whether the moved piece was
 * a king at the moment it moved (used for the inactivity rule).
 */
function reconstruct(state: GameState): {
  keys: string[];
  plyWasKingMove: boolean[];
} {
  const start = startingBoard(state);
  const keys: string[] = [positionKey(start)];
  const plyWasKingMove: boolean[] = [];
  const board = clone(start);
  for (const mv of state.history) {
    const mover = at(board.pieces, mv.from.r, mv.from.c);
    plyWasKingMove.push(!!mover && mover.king);
    applyMoveRaw(board, mv);
    keys.push(positionKey(board));
  }
  return { keys, plyWasKingMove };
}

/**
 * Reconstruct the board as it was BEFORE the first move in history, by
 * un-applying each recorded move from the current position in reverse. This
 * keeps piece identities and works for arbitrary seeded start positions (tests
 * build custom boards), not just the standard opening.
 */
function startingBoard(state: GameState): GameState {
  const board = clone(state);
  board.result = undefined;
  for (let i = board.history.length - 1; i >= 0; i--) {
    const mv = board.history[i];
    board.turn = opp(board.turn);
    board.moveNumber -= 1;
    const landing = mv.path[mv.path.length - 1];
    const p = at(board.pieces, landing.r, landing.c)!;
    // move the piece back to its origin and undo promotion done by this move
    p.square = { ...mv.from };
    if (mv.promotion) p.king = false;
    // Restore captured pieces. The Move records their squares but not their
    // king-ness, so they are restored as opponent men. This is exact for the
    // common man-capture case; it can only mis-state king-ness in a historical
    // reconstruction, never in the live position. Repetition equality is
    // unaffected because any position that repeats must have identical material
    // to its earlier occurrence, so no capture can have happened between two
    // matching keys — the reconstructed captures fall outside any repeat window.
    for (const cap of mv.captures) {
      board.pieces.push({
        id: `restored-${i}-${cap.r}-${cap.c}`,
        color: opp(p.color),
        king: false,
        square: { r: cap.r, c: cap.c },
      });
    }
  }
  board.history = [];
  return board;
}

export function checkOutcome(state: GameState): GameState["result"] {
  const redLeft = state.pieces.some((p) => p.color === "red");
  const blueLeft = state.pieces.some((p) => p.color === "blue");
  if (!blueLeft) return { winner: "red", reason: "capture-all" };
  if (!redLeft) return { winner: "blue", reason: "capture-all" };
  if (legalMoves(state, state.turn).length === 0) {
    return { winner: opp(state.turn), reason: "no-moves" };
  }

  const limit = state.settings.drawMoveLimit;
  const { keys, plyWasKingMove } = reconstruct(state);

  // Threefold repetition: the current position (last key) has occurred three
  // times across the whole game history including now.
  const current = keys[keys.length - 1];
  let occurrences = 0;
  for (const k of keys) if (k === current) occurrences++;
  if (occurrences >= 3) return { winner: "draw", reason: "repetition" };

  // Inactivity: the last `limit` plies were ALL king moves (moved piece was a
  // king) with no capture and no promotion — i.e. no man moved and nothing was
  // taken over that whole window, by BOTH sides.
  if (plyWasKingMove.length >= limit) {
    const window = plyWasKingMove.slice(-limit);
    const moves = state.history.slice(-limit);
    const stale = window.every(
      (wasKing, i) => wasKing && moves[i].captures.length === 0 && !moves[i].promotion,
    );
    if (stale) return { winner: "draw", reason: "inactivity" };
  }
  return undefined;
}
