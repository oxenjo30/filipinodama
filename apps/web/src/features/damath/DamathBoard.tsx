import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { DamathCoord, DamathGameState, DamathPiece as DamathPieceModel } from "@dama/shared";
import { DAMATH_OPERATOR_BOARD, isDamathPlayable } from "@dama/game-engine";
import { DamathPiece } from "./DamathPiece";

/** Procedural marble squares (parity is opposite Classic: playable ⇔ x+y even). */
const MARBLE = {
  dark: "radial-gradient(120% 120% at 25% 20%,#454b59 0%,#2a2f3b 45%,#181b23 100%)",
  light: "radial-gradient(120% 120% at 25% 20%,#faf6ec 0%,#ece5d5 45%,#d4cbb6 100%)",
} as const;

/** Operator glyph colour — a faint teal-gold so it reads as a hint, not noise. */
const OP_COLOR = "rgba(245,215,131,.34)";

export type DamathBoardProps = {
  state: DamathGameState;
  legalTargets?: DamathCoord[];
  captureTargets?: DamathCoord[];
  selected?: DamathCoord | null;
  mustCapture?: boolean;
  onSquareClick?: (sq: DamathCoord) => void;
  flip?: boolean;
  className?: string;
  style?: CSSProperties;
};

const same = (a: DamathCoord | null | undefined, x: number, y: number) =>
  !!a && a.x === x && a.y === y;
const has = (list: DamathCoord[] | undefined, x: number, y: number) =>
  !!list && list.some((s) => s.x === x && s.y === y);

/** 8×8 lookup of pieces from the flat pieces array. */
function toGrid(pieces: DamathPieceModel[]): (DamathPieceModel | null)[][] {
  const grid: (DamathPieceModel | null)[][] = Array.from({ length: 8 }, () =>
    Array<DamathPieceModel | null>(8).fill(null),
  );
  for (const p of pieces) {
    const { x, y } = p.pos;
    if (x >= 0 && x < 8 && y >= 0 && y < 8) grid[y][x] = p;
  }
  return grid;
}

/**
 * DamathBoard — the operation board. Same craft as Classic's <Board/> (perfect
 * 8×8 grid, sliding piece overlay keyed by id, capture-fade ghosts, marble-gold
 * frame) but: opposite parity, a faint operator on every playable square, and
 * numbered chips. Move-legality + scoring live in the engine; the board only
 * renders state and forwards taps.
 */
export function DamathBoard({
  state,
  legalTargets,
  captureTargets,
  selected,
  mustCapture = false,
  onSquareClick,
  flip = false,
  className,
  style,
}: DamathBoardProps) {
  const grid = toGrid(state.pieces);

  // Capture-fade ghosts: diff against previous pieces, keep removed ones a beat.
  const prevRef = useRef<DamathPieceModel[]>(state.pieces);
  const [ghosts, setGhosts] = useState<DamathPieceModel[]>([]);
  useEffect(() => {
    const nowIds = new Set(state.pieces.map((p) => p.id));
    const removed = prevRef.current.filter((p) => !nowIds.has(p.id));
    prevRef.current = state.pieces;
    if (removed.length) {
      setGhosts(removed);
      const t = window.setTimeout(() => setGhosts([]), 320);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [state.pieces]);

  const order = flip ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

  const cells: JSX.Element[] = [];
  for (const y of order) {
    for (const x of order) {
      const playable = isDamathPlayable(x, y);
      const op = DAMATH_OPERATOR_BOARD[y][x];
      const isSel = same(selected, x, y);
      const isMove = has(legalTargets, x, y);
      const isCap = has(captureTargets, x, y);
      const p = grid[y][x];
      const glow = mustCapture && !!p && p.player === state.turn && canCapture(grid, x, y, state.turn, state.options.allowFlyingDama);

      const kids: JSX.Element[] = [];

      // faint operator glyph on every playable square (the teaching layer)
      if (playable && op) {
        kids.push(
          <div
            key="op"
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: OP_COLOR,
              font: "700 clamp(16px,4.4vw,34px) 'JetBrains Mono',monospace",
              pointerEvents: "none",
            }}
          >
            {op}
          </div>,
        );
      }
      // quiet-move dot
      if (isMove && !isCap) {
        kids.push(
          <div
            key="dot"
            style={{
              position: "absolute",
              inset: 0,
              margin: "auto",
              width: "26%",
              height: "26%",
              borderRadius: "50%",
              background: "radial-gradient(circle,rgba(99,224,150,.95),rgba(63,191,111,.5))",
              boxShadow: "0 0 14px rgba(63,191,111,.75)",
              animation: "fdpulse 1.5s ease infinite",
            }}
          />,
        );
      }
      // capture landing ring
      if (isCap) {
        kids.push(
          <div
            key="cap"
            style={{
              position: "absolute",
              inset: "8%",
              borderRadius: "50%",
              border: "2px solid rgba(99,224,150,.95)",
              boxShadow: "inset 0 0 16px rgba(63,191,111,.5), 0 0 14px rgba(63,191,111,.6)",
              animation: "fdpulse 1.2s ease infinite",
            }}
          />,
        );
      }

      const cellBg = playable ? MARBLE.dark : MARBLE.light;
      const cellShadow =
        (playable ? "inset 0 0 18px rgba(0,0,0,.45), " : "inset 0 0 12px rgba(0,0,0,.25), ") +
        "inset 0 0 0 1px rgba(232,184,75,.22)" +
        (isSel ? ", inset 0 0 0 3px rgba(245,215,131,.95)" : "") +
        (glow && !isSel ? ", inset 0 0 0 3px rgba(245,215,131,.6)" : "");

      cells.push(
        <div
          key={`${x}-${y}`}
          onClick={playable && onSquareClick ? () => onSquareClick({ x, y }) : undefined}
          style={{
            position: "relative",
            background: cellBg,
            cursor: playable && onSquareClick ? "pointer" : "default",
            boxShadow: cellShadow,
            animation: glow ? "fdglow 1.6s ease-in-out infinite" : undefined,
          }}
        >
          {kids}
        </div>,
      );
    }
  }

  // pieces overlay — absolutely positioned, keyed by id, slides between squares.
  const cellPct = 100 / 8;
  const posOf = (sq: DamathCoord) => {
    const xx = flip ? 7 - sq.x : sq.x;
    const yy = flip ? 7 - sq.y : sq.y;
    return { left: `${xx * cellPct}%`, top: `${yy * cellPct}%` };
  };
  const selectedId = selected ? grid[selected.y]?.[selected.x]?.id : undefined;
  const glowIds = new Set(
    state.pieces
      .filter((p) => mustCapture && p.player === state.turn && canCapture(grid, p.pos.x, p.pos.y, state.turn, state.options.allowFlyingDama))
      .map((p) => p.id),
  );

  const piecesOverlay = (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {state.pieces.map((p) => {
        const { left, top } = posOf(p.pos);
        return (
          <div
            key={p.id}
            style={{
              position: "absolute",
              left,
              top,
              width: `${cellPct}%`,
              height: `${cellPct}%`,
              transition: "left .26s cubic-bezier(.4,.9,.3,1), top .26s cubic-bezier(.4,.9,.3,1)",
              willChange: "left, top",
            }}
          >
            <DamathPiece
              player={p.player}
              value={p.value}
              dama={p.dama}
              selected={p.id === selectedId}
              glow={glowIds.has(p.id)}
            />
          </div>
        );
      })}
      {ghosts.map((p) => {
        const { left, top } = posOf(p.pos);
        return (
          <div
            key={`ghost-${p.id}`}
            style={{
              position: "absolute",
              left,
              top,
              width: `${cellPct}%`,
              height: `${cellPct}%`,
              animation: "fdcapture .3s ease-out forwards",
            }}
          >
            <DamathPiece player={p.player} value={p.value} dama={p.dama} />
          </div>
        );
      })}
    </div>
  );

  const gridEl = (
    <div
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: "repeat(8,1fr)",
        aspectRatio: "1/1",
        width: "100%",
        borderRadius: 4,
        overflow: "hidden",
        boxShadow: "inset 0 0 0 2px rgba(232,184,75,.4), inset 0 0 46px rgba(0,0,0,.55)",
      }}
    >
      {cells}
      {piecesOverlay}
    </div>
  );

  const surface = (
    <div
      style={{
        padding: "clamp(8px,2.2%,18px)",
        borderRadius: 12,
        background: "linear-gradient(145deg,#f5d88a 0%,#d3a63c 45%,#8a5a1e 100%)",
        boxShadow:
          "inset 0 2px 4px rgba(255,255,255,.45), inset 0 -3px 8px rgba(0,0,0,.5), 0 18px 40px rgba(0,0,0,.5)",
      }}
    >
      {gridEl}
    </div>
  );

  return (
    <div className={className ? `fd-board-scroll ${className}` : "fd-board-scroll"} style={style}>
      <div style={{ minWidth: 280 }}>{surface}</div>
    </div>
  );
}

/** Visual-only must-capture detection for the glow (legality owned by engine).
 *  Mirrors Damath rules: a man captures forward OR backward; a flying dama
 *  slides to a lone enemy with an empty landing beyond. */
function canCapture(
  grid: (DamathPieceModel | null)[][],
  x: number,
  y: number,
  turn: DamathPieceModel["player"],
  flying: boolean,
): boolean {
  const p = grid[y][x];
  if (!p || p.player !== turn) return false;
  const at = (xx: number, yy: number) =>
    xx >= 0 && xx < 8 && yy >= 0 && yy < 8 ? grid[yy][xx] : undefined;
  const dirs = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];
  for (const [dx, dy] of dirs) {
    if (p.dama && flying) {
      let xx = x + dx;
      let yy = y + dy;
      while (at(xx, yy) === null) {
        xx += dx;
        yy += dy;
      }
      const blocker = at(xx, yy);
      if (blocker && blocker.player !== turn && at(xx + dx, yy + dy) === null) return true;
    } else {
      const mid = at(x + dx, y + dy);
      const land = at(x + 2 * dx, y + 2 * dy);
      if (mid && mid.player !== turn && land === null) return true;
    }
  }
  return false;
}

export default DamathBoard;
