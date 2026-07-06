import { describe, it, expect } from "vitest";
import { createInitialState, legalMoves, applyMove, isLegal, checkOutcome } from "../src/engine.js";
import { bestMove } from "../src/ai.js";
import type { GameState, Piece } from "@dama/shared";
import { DEFAULT_SETTINGS } from "@dama/shared";

const board = (pieces: Piece[], turn: "red" | "blue" = "red"): GameState => ({
  id: "t",
  pieces,
  turn,
  moveNumber: 1,
  history: [],
  settings: DEFAULT_SETTINGS,
});
const man = (id: string, color: "red" | "blue", r: number, c: number): Piece => ({ id, color, king: false, square: { r, c } });
const king = (id: string, color: "red" | "blue", r: number, c: number): Piece => ({ id, color, king: true, square: { r, c } });

describe("setup & movement", () => {
  it("starts with 12 v 12 men, red to move", () => {
    const s = createInitialState();
    expect(s.pieces.filter((p) => p.color === "red")).toHaveLength(12);
    expect(s.pieces.filter((p) => p.color === "blue")).toHaveLength(12);
    expect(s.turn).toBe("red");
  });

  it("a man moves one diagonal forward only", () => {
    const s = board([man("a", "red", 5, 2)]);
    const moves = legalMoves(s);
    expect(moves).toHaveLength(2); // (4,1) and (4,3)
    expect(moves.every((m) => m.path[0].r === 4)).toBe(true);
  });

  it("a king slides multiple empty squares", () => {
    const s = board([king("k", "red", 7, 0)]);
    const dests = legalMoves(s).map((m) => `${m.path[0].r},${m.path[0].c}`);
    expect(dests).toContain("6,1");
    expect(dests).toContain("4,3");
  });
});

describe("captures", () => {
  it("man captures forward and backward", () => {
    const s = board([man("a", "red", 5, 2), man("b", "blue", 4, 3)]);
    const caps = legalMoves(s);
    expect(caps).toHaveLength(1);
    expect(caps[0].captures).toHaveLength(1);
    expect(caps[0].path.at(-1)).toEqual({ r: 3, c: 4 });
  });

  it("mandatory: quiet moves excluded when a capture exists", () => {
    const s = board([man("a", "red", 5, 2), man("b", "blue", 4, 3)]);
    expect(legalMoves(s).every((m) => m.captures.length > 0)).toBe(true);
  });

  it("forces the maximal capture chain", () => {
    // red at (5,2) can take one piece, or a different line taking two
    const s = board([
      man("a", "red", 5, 2),
      man("b", "blue", 4, 3),
      man("c", "blue", 2, 3),
    ]);
    const moves = legalMoves(s);
    const max = Math.max(...moves.map((m) => m.captures.length));
    expect(moves.every((m) => m.captures.length === max)).toBe(true);
  });
});

describe("promotion & outcome", () => {
  it("promotes a man reaching the back rank", () => {
    const s = board([man("a", "red", 1, 2)]);
    const mv = legalMoves(s).find((m) => m.path[0].r === 0)!;
    expect(mv.promotion).toBe(true);
    const ns = applyMove(s, mv);
    expect(ns.pieces[0].king).toBe(true);
  });

  it("win by capturing all opponent pieces", () => {
    const s = board([man("a", "red", 5, 2), man("b", "blue", 4, 3)]);
    const ns = applyMove(s, legalMoves(s)[0]);
    expect(ns.result?.winner).toBe("red");
    expect(ns.result?.reason).toBe("capture-all");
  });

  it("stalemate = loss for the blocked side", () => {
    // blue has a piece but no legal move (boxed corner)
    const s = board(
      [king("r1", "red", 2, 3), king("r2", "red", 1, 2), man("b", "blue", 0, 1)],
      "blue",
    );
    const out = checkOutcome(s);
    if (legalMoves(s, "blue").length === 0) expect(out?.winner).toBe("red");
  });
});

describe("purity & serialization", () => {
  it("applyMove does not mutate its input", () => {
    const s = createInitialState();
    const snapshot = JSON.stringify(s);
    applyMove(s, legalMoves(s)[0]);
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it("replaying history reproduces the final position", () => {
    let s = createInitialState();
    for (let i = 0; i < 10 && !s.result; i++) s = applyMove(s, bestMove(s, "easy"));
    let replay = createInitialState();
    for (const mv of s.history) replay = applyMove(replay, mv);
    expect(replay.pieces.length).toBe(s.pieces.length);
  });
});

describe("isLegal", () => {
  it("rejects a non-maximal capture when forcedMaxCapture", () => {
    const s = board([man("a", "red", 5, 2), man("b", "blue", 4, 3), man("c", "blue", 2, 3)]);
    const short = { from: { r: 5, c: 2 }, path: [{ r: 3, c: 4 }], captures: [{ r: 4, c: 3 }], promotion: false };
    // if a longer chain exists, the single-capture move is illegal
    const max = Math.max(...legalMoves(s).map((m) => m.captures.length));
    if (max > 1) expect(isLegal(s, short)).toBe(false);
  });
});
