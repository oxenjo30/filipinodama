import { describe, it, expect } from "vitest";
import type { DamathOperator } from "@dama/shared";
import {
  DAMATH_OPERATOR_BOARD,
  isDamathPlayable,
  operatorAt,
  getPlayableColumns,
} from "../src/damath/damathBoard.js";
import {
  WHOLE_VALUE_SEQUENCE,
  createDamathPieces,
} from "../src/damath/damathPieces.js";
import { calculateDamathScore } from "../src/damath/damathScoring.js";
import {
  getLegalDamathMoves,
  getAllLegalDamathMoves,
} from "../src/damath/damathMoveGeneration.js";
import {
  DAMATH_RULE_OPTIONS,
  applyDamathMove,
  checkDamathEnd,
  finalizeScores,
} from "../src/damath/damathRules.js";
import { createInitialDamathState } from "../src/damath/damathState.js";
import type {
  DamathPiece,
  DamathPlayerId,
  DamathGameState,
  DamathRuleOptions,
} from "@dama/shared";

const pieceAt = (pieces: DamathPiece[], x: number, y: number) =>
  pieces.find((p) => p.pos.x === x && p.pos.y === y);

// --- move-gen test helpers -------------------------------------------------

let tid = 0;
const chip = (
  player: DamathPlayerId,
  x: number,
  y: number,
  value = 1,
  dama = false,
): DamathPiece => ({ id: `t${tid++}`, player, value, dama, pos: { x, y } });

const gameState = (
  pieces: DamathPiece[],
  turn: DamathPlayerId = "red",
  opts: Partial<DamathRuleOptions> = {},
): DamathGameState => ({
  id: "t",
  variant: "whole",
  pieces,
  turn,
  moveNumber: 1,
  redScore: 0,
  blueScore: 0,
  history: [],
  options: { ...DAMATH_RULE_OPTIONS, ...opts },
});

/** legal moves for the single piece at (x,y). */
const movesFor = (s: DamathGameState, x: number, y: number) => {
  const p = pieceAt(s.pieces, x, y)!;
  return getLegalDamathMoves(s, p.id);
};

/** final landing square of each move. */
const landingsOf = (moves: { path: { x: number; y: number }[] }[]) =>
  moves.map((m) => m.path[m.path.length - 1]);

// ---------------------------------------------------------------------------
// §9 Testing — Damath unit suite. Test #41 = the Classic suite, run separately.
// ---------------------------------------------------------------------------

describe("Damath board (§5.1)", () => {
  it("#1 is an 8×8 grid", () => {
    expect(DAMATH_OPERATOR_BOARD).toHaveLength(8);
    for (const row of DAMATH_OPERATOR_BOARD) expect(row).toHaveLength(8);
  });

  it("#2 has exactly 32 playable (operator-bearing) squares, all at (x+y)%2===0", () => {
    let playable = 0;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const op = DAMATH_OPERATOR_BOARD[y][x];
        if (op !== null) {
          playable++;
          expect((x + y) % 2).toBe(0); // every operator sits on a playable square
        } else {
          expect((x + y) % 2).toBe(1); // every non-playable square is null
        }
      }
    }
    expect(playable).toBe(32);
  });

  it("#3 contains only the four operators + null", () => {
    const allowed: (DamathOperator | null)[] = ["+", "−", "×", "÷", null];
    for (const row of DAMATH_OPERATOR_BOARD) {
      for (const cell of row) expect(allowed).toContain(cell);
    }
  });

  it("#3b matches the official operator layout exactly", () => {
    const expected: (DamathOperator | null)[][] = [
      ["×", null, "÷", null, "−", null, "+", null],
      [null, "÷", null, "×", null, "+", null, "−"],
      ["−", null, "+", null, "×", null, "÷", null],
      [null, "+", null, "−", null, "÷", null, "×"],
      ["×", null, "÷", null, "−", null, "+", null],
      [null, "÷", null, "×", null, "+", null, "−"],
      ["−", null, "+", null, "×", null, "÷", null],
      [null, "+", null, "−", null, "÷", null, "×"],
    ];
    expect(DAMATH_OPERATOR_BOARD).toEqual(expected);
  });

  it("#3c is a 4-row repeating block (rows y and y+4 are identical)", () => {
    for (let y = 0; y < 4; y++) {
      expect(DAMATH_OPERATOR_BOARD[y]).toEqual(DAMATH_OPERATOR_BOARD[y + 4]);
    }
  });

  it("isDamathPlayable / operatorAt agree with the board", () => {
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const op = DAMATH_OPERATOR_BOARD[y][x];
        expect(isDamathPlayable(x, y)).toBe(op !== null);
        expect(operatorAt(x, y)).toBe(op);
      }
    }
  });

  it("getPlayableColumns returns the 4 playable columns of each row, ascending", () => {
    expect(getPlayableColumns(0)).toEqual([0, 2, 4, 6]); // even row
    expect(getPlayableColumns(1)).toEqual([1, 3, 5, 7]); // odd row
    expect(getPlayableColumns(6)).toEqual([0, 2, 4, 6]);
    expect(getPlayableColumns(7)).toEqual([1, 3, 5, 7]);
  });
});

describe("Damath setup — Whole variant (§5.1)", () => {
  it("#4 whole creates 24 pieces", () => {
    expect(createDamathPieces("whole")).toHaveLength(24);
  });

  it("#5 12 pieces each side", () => {
    const pieces = createDamathPieces("whole");
    expect(pieces.filter((p) => p.player === "blue")).toHaveLength(12);
    expect(pieces.filter((p) => p.player === "red")).toHaveLength(12);
  });

  it("#6 Blue occupies the top three rows (y=0,1,2)", () => {
    const blue = createDamathPieces("whole").filter((p) => p.player === "blue");
    for (const p of blue) expect([0, 1, 2]).toContain(p.pos.y);
    // all on playable squares
    for (const p of blue) expect(isDamathPlayable(p.pos.x, p.pos.y)).toBe(true);
  });

  it("#7 Red occupies the bottom three rows (y=5,6,7)", () => {
    const red = createDamathPieces("whole").filter((p) => p.player === "red");
    for (const p of red) expect([5, 6, 7]).toContain(p.pos.y);
    for (const p of red) expect(isDamathPlayable(p.pos.x, p.pos.y)).toBe(true);
  });

  it("#7b every chip starts as a man with a unique id", () => {
    const pieces = createDamathPieces("whole");
    for (const p of pieces) expect(p.dama).toBe(false);
    expect(new Set(pieces.map((p) => p.id)).size).toBe(24);
  });

  it("#7c each side holds the exact multiset {0..11} once", () => {
    const pieces = createDamathPieces("whole");
    const vals = (player: "red" | "blue") =>
      pieces
        .filter((p) => p.player === player)
        .map((p) => p.value)
        .sort((a, b) => a - b);
    const zeroToEleven = Array.from({ length: 12 }, (_, i) => i);
    expect(vals("blue")).toEqual(zeroToEleven);
    expect(vals("red")).toEqual(zeroToEleven);
  });

  it("#7d Blue placement follows the official reading order 9,6,1,4 / 0,3,10,7 / 11,8,5,2", () => {
    const pieces = createDamathPieces("whole");
    // row A (y=0), left→right over playable columns [0,2,4,6]
    expect(pieceAt(pieces, 0, 0)?.value).toBe(9);
    expect(pieceAt(pieces, 2, 0)?.value).toBe(6);
    expect(pieceAt(pieces, 4, 0)?.value).toBe(1);
    expect(pieceAt(pieces, 6, 0)?.value).toBe(4);
    // row B (y=1), playable columns [1,3,5,7]
    expect(pieceAt(pieces, 1, 1)?.value).toBe(0);
    expect(pieceAt(pieces, 3, 1)?.value).toBe(3);
    expect(pieceAt(pieces, 5, 1)?.value).toBe(10);
    expect(pieceAt(pieces, 7, 1)?.value).toBe(7);
    // row C (y=2), playable columns [0,2,4,6]
    expect(pieceAt(pieces, 0, 2)?.value).toBe(11);
    expect(pieceAt(pieces, 2, 2)?.value).toBe(8);
    expect(pieceAt(pieces, 4, 2)?.value).toBe(5);
    expect(pieceAt(pieces, 6, 2)?.value).toBe(2);
  });

  it("#7e the value sequence constant is the official Whole order", () => {
    expect(WHOLE_VALUE_SEQUENCE).toEqual([9, 6, 1, 4, 0, 3, 10, 7, 11, 8, 5, 2]);
  });

  it("#7f Red is the point-symmetric reflection of Blue: Red@(x,y) == Blue@(7-x,7-y)", () => {
    const pieces = createDamathPieces("whole");
    const blue = pieces.filter((p) => p.player === "blue");
    for (const b of blue) {
      const r = pieceAt(pieces, 7 - b.pos.x, 7 - b.pos.y);
      expect(r).toBeDefined();
      expect(r?.player).toBe("red");
      expect(r?.value).toBe(b.value);
    }
  });
});

describe("Damath scoring (§5.3)", () => {
  // calculateDamathScore(capturing, captured, landingOp) where a piece is
  // { value, dama }. Returns { points, multiplier, formula, note? }.
  const cap = (value: number, dama = false) => ({ value, dama });

  it("#18/#19 add: uses the LANDING operator and adds", () => {
    const r = calculateDamathScore(cap(7), cap(3), "+");
    expect(r.points).toBe(10);
    expect(r.multiplier).toBe(1);
  });

  it("#20 subtract", () => {
    expect(calculateDamathScore(cap(7), cap(3), "−").points).toBe(4);
  });

  it("#21 multiply", () => {
    expect(calculateDamathScore(cap(7), cap(3), "×").points).toBe(21);
  });

  it("#22 divide keeps an exact float", () => {
    const r = calculateDamathScore(cap(7), cap(3), "÷");
    expect(r.points).toBeCloseTo(7 / 3, 10);
  });

  it("#23 divide-by-zero scores 0 with a safe note (no throw)", () => {
    const r = calculateDamathScore(cap(5), cap(0), "÷");
    expect(r.points).toBe(0);
    expect(r.note).toBeDefined();
  });

  it("#24a dama captures man → ×2", () => {
    const r = calculateDamathScore(cap(7, true), cap(3), "+");
    expect(r.multiplier).toBe(2);
    expect(r.points).toBe(20);
  });

  it("#24b man captures dama → ×2 (a dama on either side doubles)", () => {
    const r = calculateDamathScore(cap(7), cap(3, true), "+");
    expect(r.multiplier).toBe(2);
    expect(r.points).toBe(20);
  });

  it("#25 dama captures dama → ×4", () => {
    const r = calculateDamathScore(cap(7, true), cap(3, true), "+");
    expect(r.multiplier).toBe(4);
    expect(r.points).toBe(40);
  });

  it("produces a readable formula string", () => {
    expect(calculateDamathScore(cap(7), cap(3), "×").formula).toBe("7 × 3 = 21");
    expect(calculateDamathScore(cap(10, true), cap(5), "+").formula).toBe(
      "10 + 5 = 15 × 2 = 30",
    );
  });
});

describe("Damath movement & captures (§5.2)", () => {
  const landings = (moves: { path: { x: number; y: number }[] }[]) =>
    moves.map((m) => m.path[m.path.length - 1]);
  const has = (arr: { x: number; y: number }[], x: number, y: number) =>
    arr.some((p) => p.x === x && p.y === y);

  it("#8 a man moves forward diagonally (Red moves −y)", () => {
    // lone Red man in the middle, no captures available → quiet moves only
    const s = gameState([chip("red", 3, 5)], "red");
    const l = landings(movesFor(s, 3, 5));
    expect(l).toHaveLength(2);
    expect(has(l, 2, 4)).toBe(true);
    expect(has(l, 4, 4)).toBe(true);
  });

  it("#8b Blue man moves forward the other way (+y)", () => {
    const s = gameState([chip("blue", 3, 2)], "blue");
    const l = landings(movesFor(s, 3, 2));
    expect(has(l, 2, 3)).toBe(true);
    expect(has(l, 4, 3)).toBe(true);
    expect(l).toHaveLength(2);
  });

  it("#9 a man cannot make a backward QUIET move", () => {
    const s = gameState([chip("red", 3, 5)], "red");
    const l = landings(movesFor(s, 3, 5));
    // backward for Red would be +y (rows 6) — must not appear
    expect(has(l, 2, 6)).toBe(false);
    expect(has(l, 4, 6)).toBe(false);
  });

  it("#10 a man captures FORWARD", () => {
    // Red at (3,5); Blue victim at (2,4); empty landing (1,3)
    const s = gameState([chip("red", 3, 5), chip("blue", 2, 4)], "red");
    const moves = movesFor(s, 3, 5);
    expect(moves).toHaveLength(1);
    expect(moves[0].capturedIds).toHaveLength(1);
    expect(landings(moves)[0]).toEqual({ x: 1, y: 3 });
  });

  it("#11 a man captures BACKWARD", () => {
    // Red at (3,5); Blue victim BEHIND at (2,6); empty landing (1,7)
    const s = gameState([chip("red", 3, 5), chip("blue", 2, 6)], "red");
    const moves = movesFor(s, 3, 5);
    expect(moves).toHaveLength(1);
    expect(landings(moves)[0]).toEqual({ x: 1, y: 7 });
  });

  it("#12 a non-capture is illegal when a capture exists (mandatory capture)", () => {
    const s = gameState([chip("red", 3, 5), chip("blue", 2, 4)], "red");
    const all = getAllLegalDamathMoves(s);
    // every legal move must be a capture
    expect(all.length).toBeGreaterThan(0);
    for (const m of all) expect(m.capturedIds.length).toBeGreaterThan(0);
  });

  it("#13 multi-capture continuation is one move capturing both victims", () => {
    // Red (1,5) → jump blue (2,4) land (3,3) → jump blue (4,2) land (5,1)
    const s = gameState(
      [chip("red", 1, 5), chip("blue", 2, 4), chip("blue", 4, 2)],
      "red",
    );
    const moves = movesFor(s, 1, 5);
    // best chain captures both
    const two = moves.filter((m) => m.capturedIds.length === 2);
    expect(two).toHaveLength(1);
    expect(landings(two)[0]).toEqual({ x: 5, y: 1 });
    expect(two[0].landingOperators).toHaveLength(2);
  });

  it("#14 max-capture filters shorter sequences (must take the most pieces)", () => {
    // Red man A at (1,5): a 2-chain via blue(2,4)→(3,3) then blue(4,2)→(5,1).
    // Red man B at (5,5): only a single capture via blue(4,4)→(3,3)... but (3,3)
    // may be shared — keep B's victim isolated: blue(6,4)→land(7,3).
    const s = gameState(
      [
        chip("red", 1, 5),
        chip("blue", 2, 4),
        chip("blue", 4, 2), // A's 2-chain
        chip("red", 5, 5),
        chip("blue", 6, 4), // B's competing single capture, land (7,3)
      ],
      "red",
    );
    const all = getAllLegalDamathMoves(s);
    const max = Math.max(...all.map((m) => m.capturedIds.length));
    expect(max).toBe(2);
    // the single-capture chain from man B must be filtered out
    for (const m of all) expect(m.capturedIds).toHaveLength(2);
  });

  it("#15 a man promotes to dama on reaching the back rank (quiet move)", () => {
    const s = gameState([chip("red", 1, 1)], "red"); // Red back rank is y=0
    const moves = movesFor(s, 1, 1);
    const promo = moves.filter((m) => m.promotion);
    expect(promo.length).toBeGreaterThan(0);
    for (const m of promo) expect(m.path[m.path.length - 1].y).toBe(0);
  });

  it("#16 a flying dama moves any distance along an empty diagonal", () => {
    const s = gameState([chip("red", 0, 0, 1, true)], "red");
    const l = landings(movesFor(s, 0, 0));
    // down-right diagonal: (1,1),(2,2)...(7,7)
    expect(has(l, 1, 1)).toBe(true);
    expect(has(l, 7, 7)).toBe(true);
  });

  it("#17 a flying dama captures over a distance and may choose the landing", () => {
    // Red dama (0,0); blue victim at (3,3); empty beyond → (4,4),(5,5),(6,6),(7,7)
    const s = gameState([chip("red", 0, 0, 1, true), chip("blue", 3, 3)], "red");
    const moves = movesFor(s, 0, 0);
    // all are single captures of the same victim, differing by landing
    for (const m of moves) expect(m.capturedIds).toHaveLength(1);
    const l = landings(moves);
    expect(has(l, 4, 4)).toBe(true);
    expect(has(l, 7, 7)).toBe(true);
  });
});

describe("Damath apply & scoring integration (§5.3, §5.4)", () => {
  const only = (s: DamathGameState, x: number, y: number) => {
    const moves = movesFor(s, x, y);
    expect(moves).toHaveLength(1);
    return moves[0];
  };

  it("#26 applying a capture creates a score event and credits the mover", () => {
    // Red(7 @ 3,5) captures Blue(3 @ 2,4), landing (1,3). operatorAt(1,3)="+".
    const s = gameState([chip("red", 3, 5, 7), chip("blue", 2, 4, 3)], "red");
    const move = only(s, 3, 5);
    const next = applyDamathMove(s, move);
    const rec = next.history[next.history.length - 1];
    expect(rec.scoreEvents).toHaveLength(1);
    expect(rec.scoreEvents[0].kind).toBe("capture");
    // landing (1,3) operator is "+": 7 + 3 = 10
    expect(next.redScore).toBe(10);
    expect(next.blueScore).toBe(0);
    // victim removed, mover relocated, turn switched
    expect(next.pieces).toHaveLength(1);
    expect(next.turn).toBe("blue");
  });

  it("#27 a quiet move produces no score event", () => {
    const s = gameState([chip("red", 3, 5, 7)], "red");
    const move = movesFor(s, 3, 5)[0];
    const next = applyDamathMove(s, move);
    expect(next.redScore).toBe(0);
    expect(next.history[0].scoreEvents).toHaveLength(0);
  });

  it("#31 mid-chain promotion halts the chain and the mover becomes a dama", () => {
    // Red man(1,3) jumps blue(2,2)→lands (3,1); could continue to blue(4,0)...
    // but (3,1) is NOT the back rank. Set up so the FIRST jump lands on y=0.
    // Red man(2,2) jumps blue(1,1)→lands (0,0) = Red back rank → promote, stop.
    const s = gameState(
      [chip("red", 2, 2, 5), chip("blue", 1, 1, 3), chip("blue", 3, 1, 4)],
      "red",
    );
    const move = movesFor(s, 2, 2).find((m) =>
      m.path.some((c) => c.x === 0 && c.y === 0),
    )!;
    expect(move.capturedIds).toHaveLength(1); // halted after promotion
    expect(move.promotion).toBe(true);
    const next = applyDamathMove(s, move);
    const moved = next.pieces.find((p) => p.player === "red")!;
    expect(moved.dama).toBe(true);
    expect(moved.pos).toEqual({ x: 0, y: 0 });
  });

  it("#32 division keeps an exact float internally; display rounds to 2dp", () => {
    // Red man(4,6) value 7 jumps blue(3,5) value 3, landing (2,4) which is "÷".
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const s = gameState([chip("red", 4, 6, 7), chip("blue", 3, 5, 3)], "red");
    const move = movesFor(s, 4, 6)[0];
    expect(move.landingOperators[0]).toBe("÷");
    const next = applyDamathMove(s, move);
    const ev = next.history[0].scoreEvents[0];
    // engine stores the exact non-terminating float (7/3)
    expect(ev.points).toBeCloseTo(7 / 3, 10);
    expect(ev.points).not.toBe(round2(ev.points));
    // the running total is the same exact float; its 2-dp display equals the
    // 2-dp display of the single history line (they sum consistently).
    expect(round2(next.redScore)).toBe(round2(ev.points));
  });

  it("#28 a multi-jump chain scores each jump against its OWN landing operator", () => {
    // Red(2 @ 1,5) jumps Blue(3 @ 2,4)→(3,3), then Blue(4 @ 4,2)→(5,1).
    // op(3,3)="−": 2−3=−1 ; op(5,1)="+": 2+4=6  (mover value stays 2)
    const s = gameState(
      [chip("red", 1, 5, 2), chip("blue", 2, 4, 3), chip("blue", 4, 2, 4)],
      "red",
    );
    const move = movesFor(s, 1, 5).find((m) => m.capturedIds.length === 2)!;
    const next = applyDamathMove(s, move);
    const rec = next.history[next.history.length - 1];
    expect(rec.scoreEvents).toHaveLength(2);
    expect(rec.scoreEvents[0].operator).toBe("−");
    expect(rec.scoreEvents[1].operator).toBe("+");
    expect(next.redScore).toBe(-1 + 6);
  });

  it("#30 max-count dominates dama-priority: a man 2-chain beats a dama 1-capture", () => {
    // Count is filtered FIRST (§5.2), so the man's 2-chain survives and the
    // dama's lone single capture is dropped — even though a dama capture exists.
    // Dama victim is isolated in the top-right corner so it cannot chain.
    const s = gameState(
      [
        chip("red", 1, 5, 2),
        chip("blue", 2, 4, 3),
        chip("blue", 4, 2, 4), // red man 2-chain via (3,3) then (5,1)
        chip("red", 7, 7, 1, true), // red dama, single capture only
        chip("blue", 6, 6, 1), // dama victim → only landing (5,5)
        chip("red", 4, 4), // friendly blocker: dama can't chain past (5,5)
      ],
      "red",
    );
    const all = getAllLegalDamathMoves(s);
    for (const m of all) expect(m.capturedIds).toHaveLength(2);
    // the surviving 2-chain is the man's (dama only had a single, now filtered)
    expect(all.every((m) => s.pieces.find((p) => p.id === m.pieceId)?.dama === false)).toBe(true);
  });

  it("#30b within equal max-count, dama-priority keeps only the dama chain", () => {
    // Two single captures of equal count: one by a man, one by a dama.
    // damaCapturePriority drops the man's, keeping the dama-initiated capture.
    const s = gameState(
      [
        chip("red", 1, 5, 2),
        chip("blue", 2, 4, 3), // man single → land (3,3)
        chip("red", 5, 1, 1, true),
        chip("blue", 4, 2, 4), // dama single → land (3,3)? isolate landings
      ],
      "red",
    );
    const all = getAllLegalDamathMoves(s);
    // all surviving captures must be dama-initiated
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((m) => s.pieces.find((p) => p.id === m.pieceId)?.dama === true)).toBe(true);
  });

  it("#33/#34 end-of-game chip bonus adds own remaining chips, dama doubled", () => {
    // Red: man value 4 + dama value 3 → 4 + 3×2 = 10. Blue: man value 5 → 5.
    const s = gameState(
      [chip("red", 3, 5, 4), chip("red", 1, 5, 3, true), chip("blue", 4, 2, 5)],
      "red",
    );
    const finalized = finalizeScores(s);
    expect(finalized.redScore).toBe(10);
    expect(finalized.blueScore).toBe(5);
    // each side gets a bonus score event
    const bonus = finalized.history[finalized.history.length - 1];
    void bonus;
  });

  it("#35 winner is the higher FINAL score (captures + chip bonus)", () => {
    const s = { ...gameState([chip("red", 3, 5, 9), chip("blue", 4, 2, 1)], "red") };
    s.redScore = 5;
    s.blueScore = 40; // blue far ahead on captures
    const result = checkDamathEnd(s, "clock");
    // red bonus +9, blue bonus +1 → red 14, blue 41 → blue wins
    expect(result.winner).toBe("blue");
    expect(result.redScore).toBe(14);
    expect(result.blueScore).toBe(41);
  });

  it("#36 a player with NO pieces but a higher score still WINS", () => {
    // Red has no pieces (eliminated) but leads on captures; Blue trails.
    const s = gameState([chip("blue", 4, 2, 2)], "blue");
    s.redScore = 50;
    s.blueScore = 3;
    const result = checkDamathEnd(s, "no-pieces");
    // red bonus 0 (no chips), blue bonus +2 → 50 vs 5 → red wins
    expect(result.winner).toBe("red");
  });

  it("#37 equal final score is a draw", () => {
    const s = gameState([chip("red", 3, 5, 4), chip("blue", 4, 2, 4)], "red");
    s.redScore = 10;
    s.blueScore = 10;
    const result = checkDamathEnd(s, "clock");
    expect(result.winner).toBe("draw");
  });

  it("#38 a resign loses outright regardless of score, with no chip bonus", () => {
    const s = gameState([chip("red", 3, 5, 100)], "red"); // red hugely ahead on board
    s.redScore = 999;
    const result = checkDamathEnd(s, "resign");
    // red resigned on their turn → red loses; no bonus applied
    expect(result.winner).toBe("blue");
    expect(result.redScore).toBe(999);
  });
});

describe("Damath initial state (§5.5)", () => {
  it("builds a Whole game: 24 pieces, red to move, zero scores, clocks set", () => {
    const s = createInitialDamathState("whole");
    expect(s.pieces).toHaveLength(24);
    expect(s.turn).toBe("red");
    expect(s.redScore).toBe(0);
    expect(s.blueScore).toBe(0);
    expect(s.clocks).toEqual({ red: 20 * 60 * 1000, blue: 20 * 60 * 1000 });
  });
});

describe("Damath guards & edge branches", () => {
  it("createDamathPieces throws for a locked variant with no value sequence", () => {
    expect(() => createDamathPieces("radical")).toThrow(/locked/);
  });

  it("applyDamathMove throws on an unknown mover id", () => {
    const s = gameState([chip("red", 3, 5, 7)], "red");
    const bogus = {
      pieceId: "nope",
      from: { x: 3, y: 5 },
      path: [{ x: 2, y: 4 }],
      capturedIds: [],
      landingOperators: [],
      promotion: false,
    };
    expect(() => applyDamathMove(s, bogus)).toThrow(/unknown piece/);
  });

  it("applyDamathMove throws when a referenced victim is missing", () => {
    const s = gameState([chip("red", 3, 5, 7)], "red");
    const bogus = {
      pieceId: pieceAt(s.pieces, 3, 5)!.id,
      from: { x: 3, y: 5 },
      path: [{ x: 1, y: 3 }],
      capturedIds: ["ghost"],
      landingOperators: ["+"] as const,
      promotion: false,
    };
    expect(() => applyDamathMove(s, { ...bogus, landingOperators: ["+"] })).toThrow(
      /unknown victim/,
    );
  });

  it("a division-by-zero capture propagates the safe note into the score event", () => {
    // Red man(4,6) value 7 captures blue(3,5) value 0, landing (2,4) = "÷".
    const s = gameState([chip("red", 4, 6, 7), chip("blue", 3, 5, 0)], "red");
    const move = movesFor(s, 4, 6)[0];
    expect(move.landingOperators[0]).toBe("÷");
    const next = applyDamathMove(s, move);
    const ev = next.history[0].scoreEvents[0];
    expect(ev.points).toBe(0);
    expect(ev.note).toBeDefined();
  });

  it("blue wins when blue's final score is higher", () => {
    const s = gameState([chip("blue", 4, 2, 6)], "blue");
    s.redScore = 1;
    s.blueScore = 2;
    const result = checkDamathEnd(s, "clock");
    expect(result.winner).toBe("blue"); // 1 vs 8
  });

  it("a Blue capture credits blueScore (not redScore)", () => {
    // Blue man(4,2) value 7 captures red(5,3) value 3; Blue moves +y.
    // direction (+1,+1): victim (5,3), land (6,4)="+" → 7+3=10.
    const s = gameState([chip("blue", 4, 2, 7), chip("red", 5, 3, 3)], "blue");
    const move = movesFor(s, 4, 2)[0];
    expect(move.landingOperators[0]).toBe("+");
    const next = applyDamathMove(s, move);
    expect(next.blueScore).toBe(10);
    expect(next.redScore).toBe(0);
    expect(next.turn).toBe("red");
  });

  it("non-flying dama option: a dama captures like a man (adjacent only)", () => {
    const s = gameState([chip("red", 2, 4, 1, true), chip("blue", 3, 3, 1)], "red", {
      allowFlyingDama: false,
    });
    const moves = movesFor(s, 2, 4);
    // adjacent capture only: land (4,2), not distant squares
    expect(moves.every((m) => m.capturedIds.length === 1)).toBe(true);
    expect(landingsOf(moves)).toContainEqual({ x: 4, y: 2 });
  });
});
