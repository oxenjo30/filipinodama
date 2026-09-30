import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, EV, type GameState, type Piece } from "@dama/shared";
import { legalMoves } from "../src/engine.js";
import { boardMoves } from "../../../apps/web/src/components/boardMoves";
import { useGameStore } from "../../../apps/web/src/stores/gameStore";
import { useOnlineStore } from "../../../apps/web/src/stores/onlineStore";

const { emit } = vi.hoisted(() => ({ emit: vi.fn() }));
vi.mock("../../../apps/web/src/lib/socket", () => ({
  getSocket: () => ({ emit }), connectSocket: vi.fn(),
}));

const piece = (id: string, color: Piece["color"], r: number, c: number, king = false): Piece =>
  ({ id, color, square: { r, c }, king });
const stateWith = (pieces: Piece[], forcedMaxCapture = true): GameState => ({
  id: "feedback", pieces, turn: "red", moveNumber: 1, history: [],
  settings: { ...DEFAULT_SETTINGS, forcedMaxCapture },
});
const maxFixture = (forced = true) => stateWith([
  piece("r1", "red", 5, 0), piece("r2", "red", 7, 6),
  piece("b1", "blue", 4, 1), piece("b2", "blue", 2, 3), piece("b3", "blue", 6, 5),
], forced);
const branchFixture = () => stateWith([
  piece("r", "red", 4, 7, true), piece("b1", "blue", 6, 3),
  piece("b2", "blue", 3, 6), piece("b3", "blue", 3, 4), piece("b4", "blue", 1, 2),
]);
const routes = (state: GameState) => legalMoves(state).filter((m) =>
  m.path.at(-1)?.r === 7 && m.path.at(-1)?.c === 4,
);
const offline = (state: GameState) => useGameStore.setState({
  state, selected: null, mode: "local", status: "playing", moveTargets: [], captureTargets: [],
});
const online = (state: GameState) => useOnlineStore.setState({
  state, selected: null, myColor: "red", matchId: "match", pendingMove: false,
  pendingBaseState: null, moveTargets: [], captureTargets: [], status: "playing",
});

beforeEach(() => { emit.mockClear(); offline(branchFixture()); online(branchFixture()); });

describe("Reddit board feedback regressions", () => {
  it("advertises only maximum-length capture sources when enabled", () => {
    expect(boardMoves(maxFixture()).captureSources).toEqual([{ r: 5, c: 0 }]);
    expect(boardMoves(maxFixture(false)).captureSources).toEqual([{ r: 5, c: 0 }, { r: 7, c: 6 }]);
    offline(maxFixture()); useGameStore.getState().onSquareClick({ r: 7, c: 6 });
    expect(useGameStore.getState().selected).toBeNull();
    offline(maxFixture(false)); useGameStore.getState().onSquareClick({ r: 7, c: 6 });
    expect(useGameStore.getState().selected).toEqual({ r: 7, c: 6 });
  });

  it("commits the second same-endpoint route and its distinct victims", () => {
    const state = useGameStore.getState().state;
    const second = routes(state).find((m) => m.path[0].r === 0)!;
    expect(second).toBeDefined();
    useGameStore.getState().onSquareClick(second.from);
    useGameStore.getState().onMoveClick(second);
    const next = useGameStore.getState().state;
    expect(next.history).toEqual([second]);
    expect(next.pieces.some((p) => p.id === "b3")).toBe(true);
    expect(next.pieces.some((p) => p.id === "b4")).toBe(false);
  });

  it("keeps ordinary endpoint taps on the first route", () => {
    const first = routes(useGameStore.getState().state)[0];
    useGameStore.getState().onSquareClick(first.from);
    useGameStore.getState().onSquareClick({ r: 7, c: 4 });
    expect(useGameStore.getState().state.history).toEqual([first]);
  });

  it("uses canonical metadata and rejects incomplete or stale routes", () => {
    const state = useGameStore.getState().state;
    const first = routes(state)[0];
    useGameStore.getState().onSquareClick(first.from);
    useGameStore.getState().onMoveClick({ ...first, path: first.path.slice(0, 1) });
    expect(useGameStore.getState().state).toBe(state);
    useGameStore.getState().onMoveClick({ ...first, captures: [], promotion: true });
    expect(useGameStore.getState().state.history).toEqual([first]);
    const committed = useGameStore.getState().state;
    useGameStore.getState().onMoveClick(first);
    expect(useGameStore.getState().state).toBe(committed);
  });

  it("clears only uncommitted UI, preserving history and mandatory capture", () => {
    const state = maxFixture(); offline(state);
    useGameStore.getState().onSquareClick({ r: 5, c: 0 });
    useGameStore.getState().clearSelection();
    expect(useGameStore.getState()).toMatchObject({ state, selected: null, captureTargets: [], moveTargets: [], mustCapture: true });
    expect(useGameStore.getState().state).toBe(state);
    const move = legalMoves(state)[0];
    useGameStore.getState().onSquareClick(move.from); useGameStore.getState().onMoveClick(move);
    const committed = useGameStore.getState().state; useGameStore.getState().clearSelection();
    expect(useGameStore.getState().state).toBe(committed);
    expect(committed.history).toEqual([move]);
  });

  it("emits the exact canonical online route and preserves rollback base", () => {
    const state = useOnlineStore.getState().state!;
    const second = routes(state).find((m) => m.path[0].r === 0)!;
    useOnlineStore.getState().onSquareClick(second.from);
    useOnlineStore.getState().onMoveClick({ ...second, captures: [], promotion: true });
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(EV.matchMove, { matchId: "match", move: second });
    expect(useOnlineStore.getState().pendingBaseState).toBe(state);
    expect(useOnlineStore.getState().pendingMove).toBe(true);
    expect(useOnlineStore.getState().state!.history).toEqual([second]);
  });

  it("rejects illegal online routes and pending submissions or clearing", () => {
    const state = useOnlineStore.getState().state!; const first = routes(state)[0];
    useOnlineStore.getState().onSquareClick(first.from);
    useOnlineStore.getState().onMoveClick({ ...first, path: [] });
    expect(emit).not.toHaveBeenCalled(); expect(useOnlineStore.getState().state).toBe(state);
    useOnlineStore.getState().clearSelection();
    expect(useOnlineStore.getState().selected).toBeNull(); expect(useOnlineStore.getState().state).toBe(state);
    useOnlineStore.getState().onSquareClick(first.from);
    useOnlineStore.setState({ pendingMove: true });
    const selected = useOnlineStore.getState().selected;
    useOnlineStore.getState().clearSelection(); useOnlineStore.getState().onMoveClick(first);
    expect(useOnlineStore.getState().selected).toBe(selected);
    expect(emit).not.toHaveBeenCalled(); expect(useOnlineStore.getState().state).toBe(state);
  });
});
