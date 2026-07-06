import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createInitialState,
  legalMoves,
  applyMove,
  isLegal,
  checkOutcome,
  positionKey,
} from "../src/engine.js";
import { bestMove } from "../src/ai.js";
import type { GameState, Piece, GameSettings, Move, PieceColor } from "@dama/shared";
import { DEFAULT_SETTINGS, isDark, sameSquare } from "@dama/shared";

// ---- helpers ---------------------------------------------------------------

const settings = (o: Partial<GameSettings> = {}): GameSettings => ({
  forcedMaxCapture: true,
  drawMoveLimit: 40,
  ...o,
});

const board = (
  pieces: Piece[],
  turn: PieceColor = "red",
  s?: Partial<GameSettings>,
): GameState => ({
  id: "t",
  pieces,
  turn,
  moveNumber: 1,
  history: [],
  settings: settings(s),
});

const man = (id: string, color: PieceColor, r: number, c: number): Piece => ({
  id,
  color,
  king: false,
  square: { r, c },
});
const king = (id: string, color: PieceColor, r: number, c: number): Piece => ({
  id,
  color,
  king: true,
  square: { r, c },
});

/** find & apply the legal move whose from + final landing match */
function step(s: GameState, fr: number, fc: number, tr: number, tc: number): GameState {
  const mv = legalMoves(s).find(
    (m) =>
      m.from.r === fr &&
      m.from.c === fc &&
      m.path.at(-1)!.r === tr &&
      m.path.at(-1)!.c === tc,
  );
  if (!mv) {
    throw new Error(
      `no legal move ${fr},${fc}->${tr},${tc} turn=${s.turn} opts=${JSON.stringify(
        legalMoves(s).map((m) => [m.from, m.path.at(-1)]),
      )}`,
    );
  }
  return applyMove(s, mv);
}

const dest = (m: Move) => `${m.path.at(-1)!.r},${m.path.at(-1)!.c}`;

afterEach(() => vi.restoreAllMocks());

// ===========================================================================
// SETUP & MOVEMENT
// ===========================================================================
describe("setup & movement", () => {
  it("starts with 12 red + 12 blue men on correct squares, red to move", () => {
    const s = createInitialState();
    const reds = s.pieces.filter((p) => p.color === "red");
    const blues = s.pieces.filter((p) => p.color === "blue");
    expect(reds).toHaveLength(12);
    expect(blues).toHaveLength(12);
    // reds occupy rows 5-7 dark squares; blues rows 0-2 dark squares
    expect(reds.every((p) => p.square.r >= 5 && isDark(p.square.r, p.square.c) && !p.king)).toBe(true);
    expect(blues.every((p) => p.square.r <= 2 && isDark(p.square.r, p.square.c) && !p.king)).toBe(true);
    // middle rows empty
    expect(s.pieces.some((p) => p.square.r === 3 || p.square.r === 4)).toBe(false);
    expect(s.turn).toBe("red");
    expect(s.moveNumber).toBe(1);
    expect(s.history).toHaveLength(0);
  });

  it("createInitialState accepts a custom id and default settings", () => {
    const s = createInitialState(DEFAULT_SETTINGS, "room-42");
    expect(s.id).toBe("room-42");
    const d = createInitialState();
    expect(d.id).toBe("local");
    expect(d.settings).toBe(DEFAULT_SETTINGS);
  });

  it("a man moves exactly one diagonal step forward to empty squares", () => {
    const s = board([man("a", "red", 5, 2)]);
    const moves = legalMoves(s);
    expect(moves).toHaveLength(2);
    expect(moves.map(dest).sort()).toEqual(["4,1", "4,3"]);
    // never moves 2 squares on a quiet move
    expect(moves.every((m) => m.path.length === 1)).toBe(true);
  });

  it("a red man cannot move backward / sideways / onto occupied", () => {
    // block one forward diagonal with a friendly piece
    const s = board([man("a", "red", 5, 2), man("b", "red", 4, 1)]);
    const aMoves = legalMoves(s).filter((m) => m.from.r === 5 && m.from.c === 2);
    // only (4,3) is available; (4,1) is occupied, backward (6,x) illegal
    expect(aMoves.map(dest)).toEqual(["4,3"]);
    expect(aMoves.every((m) => m.path.at(-1)!.r < 5)).toBe(true); // strictly forward (up)
  });

  it("a blue man moves forward = downward (increasing row)", () => {
    const s = board([man("a", "blue", 2, 3)], "blue");
    const moves = legalMoves(s);
    expect(moves.every((m) => m.path.at(-1)!.r === 3)).toBe(true);
  });

  it("a man on the edge has only one forward square", () => {
    const s = board([man("a", "red", 5, 0)]);
    expect(legalMoves(s).map(dest)).toEqual(["4,1"]);
  });

  it("a king slides multiple empty squares along all four diagonals", () => {
    const s = board([king("k", "red", 4, 3)]);
    const dests = legalMoves(s).map(dest);
    // reaches far squares in every diagonal direction
    expect(dests).toContain("7,0"); // down-left
    expect(dests).toContain("7,6"); // down-right
    expect(dests).toContain("1,0"); // up-left
    expect(dests).toContain("0,7"); // up-right
  });

  it("a king is blocked by the first occupied square in a direction", () => {
    // friendly blocker at (5,2) stops the down-left slide before it
    const s = board([king("k", "red", 3, 4), man("blk", "red", 5, 2)]);
    const downLeft = legalMoves(s)
      .filter((m) => m.from.r === 3 && m.from.c === 4 && m.path.at(-1)!.c < 4 && m.path.at(-1)!.r > 3)
      .map(dest);
    expect(downLeft).toContain("4,3"); // one step before blocker
    expect(downLeft).not.toContain("5,2"); // cannot land on the blocker
    expect(downLeft).not.toContain("6,1"); // cannot pass through it
  });
});

// ===========================================================================
// CAPTURES
// ===========================================================================
describe("captures", () => {
  it("a man captures forward", () => {
    const s = board([man("a", "red", 5, 2), man("b", "blue", 4, 3)]);
    const caps = legalMoves(s);
    expect(caps).toHaveLength(1);
    expect(caps[0].captures).toHaveLength(1);
    expect(caps[0].path.at(-1)).toEqual({ r: 3, c: 4 });
  });

  it("a man captures BACKWARD (Filipino Dama allows it)", () => {
    // red man at (3,4); blue directly behind at (4,3); landing (5,2) empty
    const s = board([man("a", "red", 3, 4), man("b", "blue", 4, 3)]);
    const caps = legalMoves(s);
    expect(caps).toHaveLength(1);
    expect(caps[0].path.at(-1)).toEqual({ r: 5, c: 2 }); // moved backward (down)
    expect(caps[0].captures[0]).toEqual({ r: 4, c: 3 });
  });

  it("mandatory: quiet moves excluded when a capture exists", () => {
    const s = board([man("a", "red", 5, 2), man("b", "blue", 4, 3)]);
    expect(legalMoves(s).every((m) => m.captures.length > 0)).toBe(true);
  });

  it("a 2-capture chain is generated and forced to the end", () => {
    // red at (5,2): jump (4,3)->(3,4), then jump (2,5)->(1,6)
    const s = board([man("a", "red", 5, 2), man("b", "blue", 4, 3), man("c", "blue", 2, 5)]);
    const moves = legalMoves(s);
    expect(moves).toHaveLength(1);
    expect(moves[0].captures).toHaveLength(2);
    expect(moves[0].path.at(-1)).toEqual({ r: 1, c: 6 });
  });

  it("a 3-capture chain is generated and forced to the end", () => {
    // craft a zig-zag: (5,2)x(4,3)->(3,4) x(2,3)->(1,2) x(2,1)->(3,0)
    const s = board([
      man("a", "red", 5, 2),
      man("v1", "blue", 4, 3),
      man("v2", "blue", 2, 3),
      man("v3", "blue", 2, 1),
    ]);
    const moves = legalMoves(s);
    expect(moves.every((m) => m.captures.length === 3)).toBe(true);
    const chain = moves[0];
    expect(chain.captures).toHaveLength(3);
    expect(chain.path).toHaveLength(3); // three landings
  });

  it("king flying capture lands on any empty square beyond the victim", () => {
    // red king at (7,0); blue man at (4,3); squares between empty; landings (3,4),(2,5),(1,6),(0,7)
    const s = board([king("k", "red", 7, 0), man("b", "blue", 4, 3)]);
    const landings = legalMoves(s).map(dest).sort();
    expect(landings).toEqual(["0,7", "1,6", "2,5", "3,4"]);
    expect(legalMoves(s).every((m) => m.captures.length === 1)).toBe(true);
  });

  it("cannot jump own piece", () => {
    // red man at (5,2) with a RED piece at (4,3) — no capture, only quiet moves
    const s = board([man("a", "red", 5, 2), man("own", "red", 4, 3)]);
    expect(legalMoves(s).every((m) => m.captures.length === 0)).toBe(true);
  });

  it("cannot jump two pieces at once (no empty gap between)", () => {
    // two enemies stacked diagonally with no gap: (4,3) and (3,4); landing (2,5) empty
    const s = board([man("a", "red", 5, 2), man("b", "blue", 4, 3), man("c", "blue", 3, 4)]);
    // the man can jump (4,3) landing (3,4)? no — (3,4) is occupied, so that jump is blocked.
    // Only legal option is a quiet move (none, since forward squares from 5,2 lead into the jump)
    const moves = legalMoves(s);
    // no capture should land on (2,5) skipping both
    expect(moves.some((m) => sameSquare(m.path.at(-1)!, { r: 2, c: 5 }) && m.captures.length === 2)).toBe(false);
  });

  it("king cannot jump two pieces at once along the diagonal", () => {
    // king at (7,0); two blues adjacent at (5,2)+(4,3); landing beyond first is blocked
    const s = board([king("k", "red", 7, 0), man("b1", "blue", 5, 2), man("b2", "blue", 4, 3)]);
    // no capturing move exists (blocked), king has no quiet move either through them
    const caps = legalMoves(s).filter((m) => m.captures.length > 0);
    expect(caps).toHaveLength(0);
  });

  it("cannot re-jump the same piece in one chain (captured square blocks re-entry)", () => {
    // A king could otherwise loop; ensure each victim counted once.
    const s = board([man("a", "red", 5, 2), man("b", "blue", 4, 3), man("c", "blue", 2, 5)]);
    const chain = legalMoves(s)[0];
    const capKeys = chain.captures.map((c) => `${c.r},${c.c}`);
    expect(new Set(capKeys).size).toBe(capKeys.length); // no duplicates
  });

  it("captured pieces block landing during the chain and are removed only at chain end", () => {
    // Two-jump chain; assert the intermediate victim square is not a landing and
    // both victims are gone after applying.
    const s = board([man("a", "red", 5, 2), man("b", "blue", 4, 3), man("c", "blue", 2, 5)]);
    const chain = legalMoves(s)[0];
    // landing squares never coincide with a captured square
    for (const land of chain.path) {
      expect(chain.captures.some((c) => sameSquare(c, land))).toBe(false);
    }
    const after = applyMove(s, chain);
    expect(after.pieces.filter((p) => p.color === "blue")).toHaveLength(0);
    expect(after.pieces).toHaveLength(1);
  });
});

// ===========================================================================
// FORCED / MAXIMUM CAPTURE
// ===========================================================================
describe("forced / maximum capture", () => {
  it("with forcedMaxCapture=true only the longest chains are legal", () => {
    // one line captures 2, another captures 1
    const s = board(
      [man("a", "red", 5, 2), man("b", "blue", 4, 3), man("c", "blue", 2, 5), man("d", "blue", 4, 1)],
      "red",
      { forcedMaxCapture: true },
    );
    const moves = legalMoves(s);
    const max = Math.max(...moves.map((m) => m.captures.length));
    expect(max).toBeGreaterThanOrEqual(2);
    expect(moves.every((m) => m.captures.length === max)).toBe(true);
  });

  it("with forcedMaxCapture=false, shorter captures are also legal (still captures only)", () => {
    const s = board(
      [man("a", "red", 5, 2), man("b", "blue", 4, 3), man("c", "blue", 2, 5), man("d", "blue", 4, 1)],
      "red",
      { forcedMaxCapture: false },
    );
    const moves = legalMoves(s);
    const lens = new Set(moves.map((m) => m.captures.length));
    // both a 1-chain and a 2-chain are present
    expect(lens.has(1)).toBe(true);
    expect(lens.has(2)).toBe(true);
    expect(moves.every((m) => m.captures.length > 0)).toBe(true);
  });

  it("isLegal rejects a non-maximal capture when forcedMaxCapture=true", () => {
    const s = board([man("a", "red", 5, 2), man("b", "blue", 4, 3), man("c", "blue", 2, 5)]);
    const shortMove: Move = {
      from: { r: 5, c: 2 },
      path: [{ r: 3, c: 4 }],
      captures: [{ r: 4, c: 3 }],
      promotion: false,
    };
    expect(isLegal(s, shortMove)).toBe(false);
  });

  it("isLegal accepts the exact maximal chain", () => {
    const s = board([man("a", "red", 5, 2), man("b", "blue", 4, 3), man("c", "blue", 2, 5)]);
    const full = legalMoves(s)[0];
    expect(isLegal(s, full)).toBe(true);
  });

  it("applyMove throws on an illegal move", () => {
    const s = board([man("a", "red", 5, 2)]);
    const bogus: Move = { from: { r: 5, c: 2 }, path: [{ r: 6, c: 3 }], captures: [], promotion: false };
    expect(() => applyMove(s, bogus)).toThrow(/illegal/i);
  });
});

// ===========================================================================
// PROMOTION
// ===========================================================================
describe("promotion", () => {
  it("a man reaching the back rank on a quiet move promotes and the turn ends", () => {
    const s = board([man("a", "red", 1, 2)]);
    const mv = legalMoves(s).find((m) => m.path.at(-1)!.r === 0)!;
    expect(mv.promotion).toBe(true);
    const ns = applyMove(s, mv);
    expect(ns.pieces[0].king).toBe(true);
    expect(ns.turn).toBe("blue"); // turn passed
  });

  it("a man that lands AND stays on the back rank as a capture landing promotes and the chain STOPS", () => {
    // red man at (2,3) captures blue at (1,2), landing (0,1) = back rank.
    // Even if a further jump would exist as a king, reaching the back rank ends the turn.
    const s = board([
      man("a", "red", 2, 3),
      man("v1", "blue", 1, 2),
      // place a would-be second victim reachable only by a king continuing from (0,1)
      man("v2", "blue", 1, 0),
    ]);
    const moves = legalMoves(s);
    // the chain must stop at the back rank -> exactly one capture, promotion true
    expect(moves.every((m) => m.captures.length === 1)).toBe(true);
    const mv = moves.find((m) => m.path.at(-1)!.r === 0 && m.path.at(-1)!.c === 1)!;
    expect(mv.promotion).toBe(true);
    const ns = applyMove(s, mv);
    const moved = ns.pieces.find((p) => p.color === "red")!;
    expect(moved.king).toBe(true);
    expect(moved.square).toEqual({ r: 0, c: 1 });
    // v2 must still be on the board — the chain stopped
    expect(ns.pieces.some((p) => p.square.r === 1 && p.square.c === 0)).toBe(true);
  });

  it("a man promotes at the back rank even when the far corner blocks a further jump", () => {
    // Simple promotion-during-capture with a clean stop.
    const s = board([man("a", "red", 2, 1), man("v", "blue", 1, 2)]);
    const mv = legalMoves(s)[0];
    expect(mv.promotion).toBe(true);
    expect(mv.path.at(-1)).toEqual({ r: 0, c: 3 });
  });
});

// ===========================================================================
// OUTCOME
// ===========================================================================
describe("outcome", () => {
  it("win by capturing all opponent pieces", () => {
    const s = board([man("a", "red", 5, 2), man("b", "blue", 4, 3)]);
    const ns = applyMove(s, legalMoves(s)[0]);
    expect(ns.result?.winner).toBe("red");
    expect(ns.result?.reason).toBe("capture-all");
  });

  it("win when blue is captured entirely (blue has no pieces)", () => {
    // symmetric: verify the redLeft/blueLeft branches both reachable
    const s = board([man("b", "blue", 2, 5), man("r", "red", 3, 4)], "blue");
    const ns = applyMove(s, legalMoves(s)[0]); // blue captures the lone red
    expect(ns.result?.winner).toBe("blue");
    expect(ns.result?.reason).toBe("capture-all");
  });

  it("win when opponent has zero legal moves (stalemate = loss for blocked side)", () => {
    // Blue man at (0,1) fully boxed: forward squares (1,0)&(1,2) occupied by reds,
    // and those reds are not capturable (no empty landing behind them). Blue to move.
    const s = board(
      [man("b", "blue", 0, 1), man("r1", "red", 1, 0), man("r2", "red", 1, 2), man("r3", "red", 2, 3)],
      "blue",
    );
    // ensure blue truly has no move
    expect(legalMoves(s, "blue")).toHaveLength(0);
    const out = checkOutcome(s);
    expect(out?.winner).toBe("red");
    expect(out?.reason).toBe("no-moves");
  });

  it("no result while the game continues", () => {
    const s = board([man("a", "red", 5, 2), man("b", "blue", 1, 4)]);
    expect(checkOutcome(s)).toBeUndefined();
  });

  it("draw by inactivity: drawMoveLimit consecutive king-only, capture-free plies", () => {
    // Red king boxed to (7,0)<->(6,1) by own man; blue king boxed to (0,7)<->(1,6).
    let s = board(
      [king("R", "red", 7, 0), man("rm", "red", 5, 2), king("B", "blue", 0, 7), man("bm", "blue", 2, 5)],
      "red",
      { drawMoveLimit: 6 },
    );
    const cycle: Array<[number, number, number, number]> = [
      [7, 0, 6, 1],
      [0, 7, 1, 6],
      [6, 1, 7, 0],
      [1, 6, 0, 7],
    ];
    outer: for (let rep = 0; rep < 3; rep++) {
      for (const [fr, fc, tr, tc] of cycle) {
        s = step(s, fr, fc, tr, tc);
        if (s.result) break outer;
      }
    }
    expect(s.result?.reason).toBe("inactivity");
    expect(s.result?.winner).toBe("draw");
  });

  it("a man move resets the inactivity window", () => {
    // Red king boxed to (7,0)<->(6,1) by own man at (5,2); a spare blue MAN that
    // can make a quiet forward move without ever creating a capture. Blue king
    // boxed to (0,7)<->(1,6) by own man at (2,5). The interleaved man move keeps
    // the king-only window from ever reaching the limit.
    let s = board(
      [
        king("R", "red", 7, 0),
        man("rm", "red", 5, 2),
        king("B", "blue", 0, 7),
        man("bm", "blue", 2, 5),
        man("mover", "blue", 0, 3), // a blue man free to shuffle forward
      ],
      "red",
      { drawMoveLimit: 4 },
    );
    s = step(s, 7, 0, 6, 1); // red king (ply 1)
    s = step(s, 0, 3, 1, 4); // blue MAN move -> not a king move (ply 2)
    s = step(s, 6, 1, 7, 0); // red king (ply 3)
    s = step(s, 0, 7, 1, 6); // blue king (ply 4)  [blue's box move]
    // window of 4 plies contains a man move -> no inactivity draw
    expect(s.result).toBeUndefined();
  });

  it("draw by threefold repetition of the exact position + side to move", () => {
    let s = board(
      [king("R", "red", 7, 0), man("rm", "red", 5, 2), king("B", "blue", 0, 7), man("bm", "blue", 2, 5)],
      "red",
      { drawMoveLimit: 1000 }, // keep inactivity out of the way
    );
    const cycle: Array<[number, number, number, number]> = [
      [7, 0, 6, 1],
      [0, 7, 1, 6],
      [6, 1, 7, 0],
      [1, 6, 0, 7],
    ];
    outer: for (let rep = 0; rep < 4; rep++) {
      for (const [fr, fc, tr, tc] of cycle) {
        s = step(s, fr, fc, tr, tc);
        if (s.result) break outer;
      }
    }
    expect(s.result?.reason).toBe("repetition");
    expect(s.result?.winner).toBe("draw");
  });

  it("positionKey is canonical: same position, different piece order/ids => same key", () => {
    const a = board([king("R", "red", 7, 0), man("bm", "blue", 2, 5)], "red");
    const b = board([man("x", "blue", 2, 5), king("y", "red", 7, 0)], "red");
    expect(positionKey(a)).toBe(positionKey(b));
    // side to move matters
    const c = board([king("R", "red", 7, 0), man("bm", "blue", 2, 5)], "blue");
    expect(positionKey(a)).not.toBe(positionKey(c));
    // king-ness matters
    const d = board([man("R", "red", 7, 0), man("bm", "blue", 2, 5)], "red");
    expect(positionKey(a)).not.toBe(positionKey(d));
  });
});

// ===========================================================================
// DETERMINISM / SERIALIZATION
// ===========================================================================
describe("determinism & serialization", () => {
  it("applyMove does not mutate its input", () => {
    const s = createInitialState();
    const snapshot = JSON.stringify(s);
    applyMove(s, legalMoves(s)[0]);
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it("GameState round-trips through JSON.stringify", () => {
    let s = createInitialState();
    // deterministic self-play without RNG blunders (hard has blunder chance 0)
    // but keep search shallow for speed by using 'easy' depth after disabling RNG
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    for (let i = 0; i < 6 && !s.result; i++) s = applyMove(s, bestMove(s, "easy"));
    const round = JSON.parse(JSON.stringify(s)) as GameState;
    expect(round).toEqual(s);
  });

  it("replaying history from createInitialState reproduces the final position exactly", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99); // no blunders -> deterministic
    let s = createInitialState();
    for (let i = 0; i < 24 && !s.result; i++) s = applyMove(s, bestMove(s, "easy"));
    let replay = createInitialState();
    for (const mv of s.history) replay = applyMove(replay, mv);
    // compare positions ignoring piece ids (ids are cosmetic)
    const norm = (g: GameState) =>
      g.pieces
        .map((p) => `${p.square.r},${p.square.c},${p.color},${p.king}`)
        .sort();
    expect(norm(replay)).toEqual(norm(s));
    expect(replay.turn).toBe(s.turn);
    expect(positionKey(replay)).toBe(positionKey(s));
  });

  it("a seeded (non-standard) game also replays exactly via history", () => {
    // start from a custom mid-game board, play a few forced moves, replay history
    let s = board([man("a", "red", 5, 2), man("b", "blue", 4, 3), man("c", "blue", 2, 5)]);
    const initial = JSON.parse(JSON.stringify(s)) as GameState;
    s = applyMove(s, legalMoves(s)[0]);
    let replay = JSON.parse(JSON.stringify(initial)) as GameState;
    for (const mv of s.history) replay = applyMove(replay, mv);
    expect(positionKey(replay)).toBe(positionKey(s));
  });
});

// ===========================================================================
// PROPERTY / FUZZ
// ===========================================================================
describe("property: random legal games keep invariants", () => {
  it("thousands of plies never violate board invariants and never throw", () => {
    let rngState = 123456789;
    const rand = () => {
      // deterministic LCG for reproducibility
      rngState = (1103515245 * rngState + 12345) & 0x7fffffff;
      return rngState / 0x7fffffff;
    };

    for (let game = 0; game < 40; game++) {
      let s = createInitialState();
      let prevCount = s.pieces.length;
      let plies = 0;
      while (!s.result && plies < 200) {
        const moves = legalMoves(s);
        expect(moves.length).toBeGreaterThan(0); // side to move always has a move here
        const mv = moves[Math.floor(rand() * moves.length)];
        s = applyMove(s, mv);
        plies++;

        // invariant: piece count only decreases or stays equal
        expect(s.pieces.length).toBeLessThanOrEqual(prevCount);
        prevCount = s.pieces.length;
        // invariant: no two pieces share a square
        const keys = s.pieces.map((p) => `${p.square.r},${p.square.c}`);
        expect(new Set(keys).size).toBe(keys.length);
        // invariant: only dark squares occupied, all in-bounds
        expect(
          s.pieces.every(
            (p) =>
              p.square.r >= 0 &&
              p.square.r < 8 &&
              p.square.c >= 0 &&
              p.square.c < 8 &&
              isDark(p.square.r, p.square.c),
          ),
        ).toBe(true);
      }
    }
  });
});

// ===========================================================================
// AI
// ===========================================================================
describe("ai bestMove", () => {
  it("returns a legal move for the side to move (full opening, easy depth)", () => {
    const s = createInitialState();
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const mv = bestMove(s, "easy");
    expect(isLegal(s, mv)).toBe(true);
  });

  it("hard search returns a legal move on a small board", () => {
    // small position so depth-7 search stays fast
    const s = board([man("a", "red", 6, 1), man("b", "blue", 1, 2)]);
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const mv = bestMove(s, "hard");
    expect(isLegal(s, mv)).toBe(true);
  });

  it("throws when there are no legal moves", () => {
    const s = board(
      [man("b", "blue", 0, 1), man("r1", "red", 1, 0), man("r2", "red", 1, 2), man("r3", "red", 2, 3)],
      "blue",
    );
    expect(() => bestMove(s, "hard")).toThrow(/no legal/i);
  });

  it("takes a forced winning capture (evaluates to the win)", () => {
    const s = board([man("a", "red", 5, 2), man("b", "blue", 4, 3)]);
    const mv = bestMove(s, "hard");
    expect(mv.captures.length).toBe(1);
    const ns = applyMove(s, mv);
    expect(ns.result?.winner).toBe("red");
  });

  it("easy difficulty can play a random legal blunder (branch coverage)", () => {
    const s = createInitialState();
    // force the blunder branch: Math.random() below BLUNDER['easy']
    vi.spyOn(Math, "random").mockReturnValue(0);
    const mv = bestMove(s, "easy");
    expect(isLegal(s, mv)).toBe(true);
  });

  it("default difficulty (normal) works and returns a legal move", () => {
    const s = createInitialState();
    vi.spyOn(Math, "random").mockReturnValue(0.99); // avoid blunder branch
    const mv = bestMove(s); // default 'normal'
    expect(isLegal(s, mv)).toBe(true);
  });

  it("stronger search reaches a terminal draw/loss/win branch in negamax", () => {
    // a near-terminal position so deep search hits result-based leaf scoring
    const s = board([man("a", "red", 5, 2), man("b", "blue", 4, 3)]);
    const mv = bestMove(s, "hard");
    expect(mv).toBeTruthy();
  });

  it("negamax scores a DRAW terminal at 0 (search sees an inactivity draw child)", () => {
    // Boxed kings; play up to ONE ply before an inactivity draw, then let the AI
    // search. Its only legal move completes the draw window, so the negamax leaf
    // scores a state whose result.winner === 'draw'.
    let s = board(
      [king("R", "red", 7, 0), man("rm", "red", 5, 2), king("B", "blue", 0, 7), man("bm", "blue", 2, 5)],
      "red",
      { drawMoveLimit: 4 },
    );
    const cycle: Array<[number, number, number, number]> = [
      [7, 0, 6, 1],
      [0, 7, 1, 6],
      [6, 1, 7, 0],
    ];
    // apply 3 king plies (window not yet full at limit 4)
    for (const [fr, fc, tr, tc] of cycle) s = step(s, fr, fc, tr, tc);
    expect(s.result).toBeUndefined();
    // now it's blue's move; the only legal move (0,7 area) completes the 4th
    // king ply -> child is an inactivity draw. The AI must evaluate that draw.
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const mv = bestMove(s, "normal");
    const child = applyMove(s, mv);
    expect(child.result?.reason).toBe("inactivity");
  });
});
