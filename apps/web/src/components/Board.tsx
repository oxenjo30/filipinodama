import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { GameState, Square, Piece as PieceModel } from "@dama/shared";
import { isDark } from "@dama/shared";
import { boardTexture, type BoardTextureKey, type PieceSkin } from "../lib/assets";
import { Piece } from "./Piece";

/** Procedural marble square gradients (default board), from the prototype. */
const MARBLE = {
  dark: "radial-gradient(120% 120% at 25% 20%,#454b59 0%,#2a2f3b 45%,#181b23 100%)",
  light: "radial-gradient(120% 120% at 25% 20%,#faf6ec 0%,#ece5d5 45%,#d4cbb6 100%)",
} as const;

/**
 * Per-theme playing field. The framed board IMAGES (ebony/obsidian/wood) are
 * hand-rendered with slightly irregular printed squares, so overlaying an 8×8
 * grid on their squares never lines up. Instead we render OUR OWN mathematically
 * perfect 8×8 checkerboard (pieces always sit dead-centre) and use the image only
 * as the decorative FRAME behind it. `frameInset` is how far in the flat playing
 * field begins (measured from each 1024² source) — our grid fills that region so
 * the ornate border stays visible around it; `dark`/`light` tint the squares to
 * match the theme.
 */
type ImageTheme = { frameInset: number; dark: string; light: string };
const IMAGE_THEMES: Record<Exclude<BoardTextureKey, "marble">, ImageTheme> = {
  // Wood: warm walnut/maple checker inside a plain wood frame.
  classic: {
    frameInset: 6.8,
    dark: "radial-gradient(120% 120% at 25% 20%,#6b4a2c 0%,#4e3417 55%,#3a2410 100%)",
    light: "radial-gradient(120% 120% at 25% 20%,#f0dcb0 0%,#e6c98c 55%,#d8b673 100%)",
  },
  wood: {
    frameInset: 6.8,
    dark: "radial-gradient(120% 120% at 25% 20%,#6b4a2c 0%,#4e3417 55%,#3a2410 100%)",
    light: "radial-gradient(120% 120% at 25% 20%,#f0dcb0 0%,#e6c98c 55%,#d8b673 100%)",
  },
  // Ebony: cream vs deep-ebony inside the gold-filigree black frame. The printed
  // playing field sits ~12–13% in (the ornate corners cut in further than the
  // plain edges), so a bit more inset keeps our grid inside the border.
  ebony: {
    frameInset: 13,
    dark: "radial-gradient(120% 120% at 25% 20%,#3a2c22 0%,#241812 55%,#160d09 100%)",
    light: "radial-gradient(120% 120% at 25% 20%,#f4e7c8 0%,#e8d6a8 55%,#dcc890 100%)",
  },
  // Obsidian: charcoal vs near-black slate inside the purple-rimmed stone frame.
  obsidian: {
    frameInset: 10.5,
    dark: "radial-gradient(120% 120% at 25% 20%,#1c1c22 0%,#101014 55%,#08080b 100%)",
    light: "radial-gradient(120% 120% at 25% 20%,#3a3a44 0%,#2a2a32 55%,#1e1e24 100%)",
  },
  // ── Batch 2 boards (Meshy-generated; colors sampled from the thumbnails) ──
  // Sapphire: deep sapphire-blue vs silver-pearl, silver filigree frame.
  sapphire: {
    frameInset: 11,
    dark: "radial-gradient(120% 120% at 25% 20%,#1c3a86 0%,#0d215c 55%,#06123f 100%)",
    light: "radial-gradient(120% 120% at 25% 20%,#eef1f6 0%,#d3d9e6 55%,#b9c2d6 100%)",
  },
  // Emerald Jade: deep emerald vs pale cream-jade, gold dragon frame.
  emeraldjade: {
    frameInset: 11,
    dark: "radial-gradient(120% 120% at 25% 20%,#256b3f 0%,#154028 55%,#0d2a1a 100%)",
    light: "radial-gradient(120% 120% at 25% 20%,#eef0d8 0%,#d6dbb0 55%,#c2c99a 100%)",
  },
  // Blood Narra: rich red narra hardwood vs dark walnut, carved wood frame.
  bloodnarra: {
    frameInset: 8,
    dark: "radial-gradient(120% 120% at 25% 20%,#7a2e22 0%,#54180f 55%,#3a0f08 100%)",
    light: "radial-gradient(120% 120% at 25% 20%,#d99a6c 0%,#c17c4c 55%,#a8633a 100%)",
  },
  // Pearl Ivory: iridescent pearl vs champagne-ivory, rose-gold frame.
  pearlivory: {
    frameInset: 10,
    dark: "radial-gradient(120% 120% at 25% 20%,#e6e0d0 0%,#d3cbb6 55%,#c2b89f 100%)",
    light: "radial-gradient(120% 120% at 25% 20%,#fbf8f0 0%,#f3eede 55%,#e9e2cc 100%)",
  },
  // Volcanic Ember: black basalt vs charcoal veined with molten orange, iron frame.
  volcanicember: {
    frameInset: 10,
    dark: "radial-gradient(120% 120% at 25% 20%,#2a2422 0%,#171210 55%,#0c0908 100%)",
    light: "radial-gradient(120% 120% at 25% 20%,#5a4a44 0%,#40332e 55%,#2c221e 100%)",
  },
  // Royal Amethyst: violet amethyst vs polished silver, silver-purple frame.
  amethyst: {
    frameInset: 11,
    dark: "radial-gradient(120% 120% at 25% 20%,#6a4f8e 0%,#432c66 55%,#2c1a48 100%)",
    light: "radial-gradient(120% 120% at 25% 20%,#f0eef5 0%,#d8d2e4 55%,#c2bad2 100%)",
  },
};

export type BoardProps = {
  /** the live game state; pieces are read from `state.pieces` */
  state: GameState;
  /** squares a selected piece may legally move to (quiet moves) */
  legalTargets?: Square[];
  /** squares that are capture landings (subset styling: red-glow target) */
  captureTargets?: Square[];
  /** currently selected square (gold ring on its piece) */
  selected?: Square | null;
  /** when true, own pieces that can capture pulse with a gold glow */
  mustCapture?: boolean;
  /** click handler for any playable square */
  onSquareClick?: (sq: Square) => void;
  /**
   * Compact/preview mode: drop the 280px min-width scroll wrapper so the board
   * shrinks to fit a tiny container (e.g. the Home "Continue Playing" mini
   * preview). Without this the board can't go below 280px and overflows/scrolls.
   */
  compact?: boolean;
  /**
   * board surface. "marble" (default) uses the procedural marble+gold squares;
   * any other key uses that full-image texture with the grid inset over it.
   */
  boardTheme?: "marble" | BoardTextureKey;
  /** equipped piece skin ("default" = glossy webp art). Used for BOTH colours
   *  unless per-colour skins are given (redSkin/blueSkin) — e.g. online, where
   *  each player's pieces show their own equipped skin. */
  skin?: PieceSkin;
  /** per-colour skin overrides (online PvP: my pieces = my skin, opponent's =
   *  theirs). Falls back to `skin` when a side's override is undefined. */
  redSkin?: PieceSkin;
  blueSkin?: PieceSkin;
  /** flip the board 180° (view from red's side) */
  flip?: boolean;
  className?: string;
  style?: CSSProperties;
};

const same = (a: Square | null | undefined, r: number, c: number) =>
  !!a && a.r === r && a.c === c;
const has = (list: Square[] | undefined, r: number, c: number) =>
  !!list && list.some((s) => s.r === r && s.c === c);

/** Build an 8×8 lookup of pieces from the flat GameState.pieces array. */
function toGrid(pieces: PieceModel[]): (PieceModel | null)[][] {
  const grid: (PieceModel | null)[][] = Array.from({ length: 8 }, () =>
    Array<PieceModel | null>(8).fill(null),
  );
  for (const p of pieces) {
    const { r, c } = p.square;
    if (r >= 0 && r < 8 && c >= 0 && c < 8) grid[r][c] = p;
  }
  return grid;
}

/**
 * Board — the marble-and-gold 8×8 Filipino Dama board (the centerpiece).
 *
 * Gold-bevel frame (linear-gradient marble bevel + heavy inset shadow), only
 * dark squares are playable and interactive. Pieces render via <Piece/> from
 * the equipped skin art. Highlights:
 *  - selected piece → gold ring (on the piece)
 *  - legal quiet move → pulsing green dot (fdpulse, prototype accent #3fbf6f)
 *  - capture target → green glow ring (fdpulse)
 *  - must-capture source → pulsing gold glow cell (fdglow)
 *
 * On very narrow screens the board scrolls horizontally inside `.fd-board-scroll`
 * rather than squashing (per DESIGN_SYSTEM breakpoints).
 */
export function Board({
  state,
  legalTargets,
  captureTargets,
  selected,
  mustCapture = false,
  onSquareClick,
  boardTheme = "marble",
  skin = "default",
  redSkin,
  blueSkin,
  flip = false,
  compact = false,
  className,
  style,
}: BoardProps) {
  // Resolve the skin for each colour: a per-colour override wins, else the shared
  // `skin`. Lets online matches paint each player's own pieces in their own skin.
  const skinFor = (color: PieceModel["color"]): PieceSkin =>
    (color === "red" ? redSkin : blueSkin) ?? skin;
  const grid = toGrid(state.pieces);
  const turn = state.turn;

  // ── Capture-fade tracking ──
  // Pieces slide between squares (overlay below, keyed by piece.id). A CAPTURED
  // piece is removed from state.pieces, so it would just vanish. To animate it
  // out, we diff against the previous piece set: any id that disappeared is kept
  // as a fading "ghost" (shrink + fade) for a beat, then dropped.
  const prevRef = useRef<PieceModel[]>(state.pieces);
  const [ghosts, setGhosts] = useState<PieceModel[]>([]);
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
  // Only render the image board for a KNOWN texture key. An unknown/invalid
  // boardTheme falls back to the marble/CSS board rather than a broken image.
  // Defensive: keeps the board visible no matter what value reaches it.
  const useImage = boardTheme !== "marble" && boardTheme in IMAGE_THEMES;
  const order = flip ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

  const cells: JSX.Element[] = [];
  for (const r of order) {
    for (const c of order) {
      const playable = isDark(r, c);
      const p = grid[r][c];
      const key = `${r}-${c}`;
      const isSel = same(selected, r, c);
      const isMove = has(legalTargets, r, c);
      const isCap = has(captureTargets, r, c);
      const glow =
        mustCapture && !!p && p.color === turn && canCapture(grid, r, c, turn);

      const kids: JSX.Element[] = [];

      // legal quiet-move destination → pulsing green dot (prototype accent #3fbf6f)
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
      // capture landing → green glow ring (prototype accent #3fbf6f)
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
      // NB: pieces are NOT rendered inside cells anymore — they live in an
      // absolutely-positioned overlay (below) keyed by piece.id so they SLIDE
      // between squares and captured pieces can fade out. Cells only draw the
      // square background + move/capture highlights + handle clicks.

      // Squares are always drawn by US (perfect 8×8). For image themes we use the
      // theme's own tints (the image behind is just the frame); for marble the
      // procedural marble. This guarantees pieces sit dead-centre on real squares
      // regardless of the framed image's irregular printed field.
      const squares = useImage ? IMAGE_THEMES[boardTheme as Exclude<BoardTextureKey, "marble">] : MARBLE;
      const cellBg = playable ? squares.dark : squares.light;
      const cellShadow =
        (playable
          ? "inset 0 0 18px rgba(0,0,0,.45), "
          : "inset 0 0 12px rgba(0,0,0,.25), ") +
        "inset 0 0 0 1px rgba(232,184,75,.22)" +
        (isSel ? ", inset 0 0 0 3px rgba(245,215,131,.95)" : "") +
        (glow && !isSel ? ", inset 0 0 0 3px rgba(245,215,131,.6)" : "");

      cells.push(
        <div
          key={key}
          onClick={playable && onSquareClick ? () => onSquareClick({ r, c }) : undefined}
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

  // ── Pieces overlay ── absolutely-positioned pieces keyed by piece.id, on top of
  // the square grid. Each is placed by its square (as a %) and TRANSITIONS its
  // position, so a move SLIDES the piece. Fading ghosts (captured pieces) shrink
  // + fade out. `flip` mirrors the coordinates so the board can be viewed from
  // either side. One cell = 12.5% of the board.
  const cellPct = 100 / 8;
  const posOf = (sq: Square) => {
    const rr = flip ? 7 - sq.r : sq.r;
    const cc = flip ? 7 - sq.c : sq.c;
    return { left: `${cc * cellPct}%`, top: `${rr * cellPct}%` };
  };
  const selectedId = selected ? grid[selected.r]?.[selected.c]?.id : undefined;
  const glowIds = new Set(
    state.pieces
      .filter((p) => mustCapture && p.color === turn && canCapture(grid, p.square.r, p.square.c, turn))
      .map((p) => p.id),
  );

  const piecesOverlay = (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {state.pieces.map((p) => {
        const { left, top } = posOf(p.square);
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
            <Piece
              color={p.color}
              king={p.king}
              skin={skinFor(p.color)}
              selected={p.id === selectedId}
              glow={glowIds.has(p.id)}
            />
          </div>
        );
      })}
      {/* captured pieces fading out where they stood */}
      {ghosts.map((p) => {
        const { left, top } = posOf(p.square);
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
            <Piece color={p.color} king={p.king} skin={skinFor(p.color)} />
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
        gridTemplateRows: useImage ? "repeat(8,1fr)" : undefined,
        aspectRatio: "1/1",
        width: "100%",
        height: useImage ? "100%" : undefined,
        borderRadius: useImage ? 3 : 4,
        overflow: "hidden",
        // A thin gold hairline + inner shadow frames OUR grid on both the marble
        // and image boards, so the perfect 8×8 reads as inset in the surround.
        boxShadow: "inset 0 0 0 2px rgba(232,184,75,.4), inset 0 0 46px rgba(0,0,0,.55)",
      }}
    >
      {cells}
      {piecesOverlay}
    </div>
  );

  // Image themes: the image is the FRAME/backdrop; OUR perfect grid sits in the
  // flat playing field (frameInset from each edge), so pieces always line up and
  // the ornate border stays visible around them.
  const surface = useImage ? (
    (() => {
      const inset = IMAGE_THEMES[boardTheme as Exclude<BoardTextureKey, "marble">].frameInset;
      return (
        <div
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "1/1",
            backgroundImage: `url(${boardTexture(boardTheme as BoardTextureKey)})`,
            backgroundSize: "100% 100%",
            backgroundRepeat: "no-repeat",
            borderRadius: 10,
            boxShadow: "0 10px 34px rgba(0,0,0,.5)",
          }}
        >
          <div style={{ position: "absolute", top: `${inset}%`, left: `${inset}%`, right: `${inset}%`, bottom: `${inset}%` }}>
            {gridEl}
          </div>
        </div>
      );
    })()
  ) : (
    // Marble default: wrap the grid in the gold-bevel frame.
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

  // Compact/preview: fill the (small) parent, no min-width, no scroll wrapper.
  if (compact) {
    return (
      <div className={className} style={{ width: "100%", height: "100%", ...style }}>
        {surface}
      </div>
    );
  }
  return (
    <div className={className ? `fd-board-scroll ${className}` : "fd-board-scroll"} style={style}>
      <div style={{ minWidth: 280 }}>{surface}</div>
    </div>
  );
}

/** Local mirror of the capture rule for highlighting must-capture sources.
 *  Filipino Dama: a man may capture forward OR backward; a king slides along a
 *  diagonal and captures a lone enemy with an empty landing beyond it. This is
 *  used only for the visual glow — move legality is owned by the game engine. */
function canCapture(
  grid: (PieceModel | null)[][],
  r: number,
  c: number,
  turn: PieceModel["color"],
): boolean {
  const p = grid[r][c];
  if (!p || p.color !== turn) return false;
  const at = (rr: number, cc: number) =>
    rr >= 0 && rr < 8 && cc >= 0 && cc < 8 ? grid[rr][cc] : undefined;
  const dirs = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];
  for (const [dr, dc] of dirs) {
    if (p.king) {
      // scan along the diagonal for the first piece; capture if it's an enemy
      // with an empty square immediately beyond it.
      let rr = r + dr;
      let cc = c + dc;
      while (at(rr, cc) === null) {
        rr += dr;
        cc += dc;
      }
      const blocker = at(rr, cc);
      if (blocker && blocker.color !== turn && at(rr + dr, cc + dc) === null) return true;
    } else {
      const mid = at(r + dr, c + dc);
      const land = at(r + 2 * dr, c + 2 * dc);
      if (mid && mid.color !== turn && land === null) return true;
    }
  }
  return false;
}

export default Board;
