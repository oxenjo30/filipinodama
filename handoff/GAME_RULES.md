# GAME_RULES.md — Filipino Dama Ruleset (Server Engine Spec)

The engine in `packages/game-engine` implements these rules. It is the single source of truth for legality and outcomes. The client may mirror it for hints/offline play, but the **server's result is authoritative**.

Filipino Dama is played like international-style draughts on the dark squares of an 8×8 board, with **forced (mandatory) captures** and **flying kings**. The exact ruleset below is what we ship — implement it precisely and lock it with tests.

---

## 1. Board & coordinates

- 8×8 grid. Playable squares are the **dark** squares only (a square `(row, col)` is playable when `(row + col)` is odd — pick one parity convention and keep it consistent; the prototype uses dark = `(r+c) % 2 === 1`).
- Rows `0..7` top→bottom, cols `0..7` left→right. Represent the board as a flat array of 32 playable squares OR an 8×8 array where light squares are always empty. Store canonically; expose a stable index for move notation.
- Two players: **Red** (bottom, moves up / decreasing row) and **Blue** (top, moves down / increasing row). (Prototype colors: Red `#A0303A`, Blue `#2E6BC6`.)

## 2. Starting position

- Each side has **12 men** on the dark squares of the three rows nearest to them (rows 0–2 for Blue, rows 5–7 for Red). Middle two rows (3–4) start empty.

## 3. Piece types

- **Man (peon):** moves and captures diagonally.
- **King (Dama):** created when a man reaches the far row; a "flying king" that moves any distance along a diagonal.

## 4. Movement (non-capturing)

- **Man:** moves one square diagonally **forward only** (Red upward, Blue downward) to an empty square.
- **King:** moves any number of empty squares along any diagonal (forward or backward), like a bishop, stopping on any empty square before the first occupied one.

## 5. Capturing (mandatory)

- **Capture is compulsory.** If any capture is available to the side to move, the player **must** capture; non-capturing moves are illegal that turn.
- **Man capture:** jumps diagonally over an **adjacent enemy** piece into the **empty square immediately beyond**. Men may capture **forward and backward** (capturing is not restricted to the forward direction, even for men — this is standard in Filipino Dama).
- **King capture:** flies along a diagonal, jumps a single enemy piece with any number of empty squares before it, and lands on any empty square beyond it along the same diagonal.
- **Multi-capture (chain):** after a capturing jump, if the **same piece** can capture again from its new square, it **must** continue. The turn ends only when no further capture is available from the landing square.
- You cannot jump your own pieces, cannot jump the same enemy piece twice in one chain, and cannot jump two pieces at once (there must be exactly one enemy piece with empty landing beyond).
- **Captured pieces are removed** only after the whole chain completes (they remain on the board as "locked/blocking" during the chain so you can't re-jump them — track a `capturedThisTurn` set; those squares block landing but the pieces are removed at chain end). Implement the standard rule: captured pieces are not removed until the sequence is finished, and you may not pass over the same square/piece twice.

### Maximum-capture rule (configurable, default ON)
Filipino Dama commonly enforces **majority/maximum capture**: when multiple capture sequences exist, the player must choose one that captures the **greatest number of pieces**. Make this a room/match setting `forcedMaxCapture: boolean` (default `true`). When `true`, the engine's legal-move generator returns only the maximal-length capture chains.

## 6. Promotion (becoming Dama)

- A **man** that ends its move on the opponent's **far row** (back rank) is promoted to **King**.
- **Promotion during a capture chain:** if a man reaches the back rank as the landing square of a capture **and could continue capturing as a king**, the standard Filipino rule is that **reaching the back rank ends the turn** (the man promotes and the chain stops), UNLESS it lands on the back rank only in passing. Implement: promotion occurs at end of move; if the piece lands *and stays* on the back rank, it promotes and the turn ends. Expose this as a covered test case.

## 7. Turn structure

1. Determine side to move.
2. Generate all legal moves (captures first; if any exist and `forcedMaxCapture`, keep only maximal chains).
3. Player picks one legal move (or one legal capture chain). For multi-step chains the client may submit the full path or step-by-step; server validates each step.
4. Apply move, resolve promotion, remove captured pieces.
5. Check outcome; if game continues, pass turn.

## 8. Win / draw conditions

- **Win:** opponent has **no pieces left**, OR opponent has **no legal move** on their turn (stalemate = loss for the player who cannot move — standard draughts rule).
- **Resignation / timeout / abandonment:** counts as a loss for that player (server-enforced via clocks + disconnect grace).
- **Draw:** by mutual agreement; and by the **inactivity/repetition rule** — implement a draw when there have been **40 consecutive king moves by both sides with no capture and no man move** (configurable `drawMoveLimit`, default 40), and threefold repetition of the exact position + side-to-move. Expose `offerDraw` / `acceptDraw`.

## 9. Move timing (rooms/ranked)

- Optional **move timer** (room setting): per-move seconds (e.g. 15/30/60) and/or a total game clock. Server owns the clock; on timeout the mover loses. Client shows a countdown but never enforces it.

## 10. Serialized state (shared type)

The engine works on and returns a serializable `GameState` (see `packages/shared`):

```ts
type PieceColor = 'red' | 'blue';
type Square = { r: number; c: number };
type Piece = { id: string; color: PieceColor; king: boolean; square: Square };
type Move = {
  from: Square;
  path: Square[];          // landing square(s); length > 1 for multi-jumps
  captures: Square[];      // squares of pieces removed
  promotion: boolean;
};
type GameState = {
  id: string;
  pieces: Piece[];
  turn: PieceColor;
  moveNumber: number;
  history: Move[];         // full move list → powers replays
  settings: { forcedMaxCapture: boolean; drawMoveLimit: number; moveTimerSec?: number };
  result?: { winner: PieceColor | 'draw'; reason: 'capture-all' | 'no-moves' | 'resign' | 'timeout' | 'abandon' | 'agreement' | 'repetition' | 'inactivity' };
  clocks?: { red: number; blue: number };
};
```

### Required engine API
```ts
createInitialState(settings): GameState
legalMoves(state, color?): Move[]              // captures-only + maximal when forced
applyMove(state, move): GameState              // throws on illegal move
isLegal(state, move): boolean
checkOutcome(state): GameState['result'] | undefined
// AI
bestMove(state, difficulty: 'easy'|'normal'|'hard'): Move   // minimax + alpha-beta; depth by difficulty
```

## 11. AI opponent

- Server-side minimax with alpha-beta pruning over `legalMoves`.
- Evaluation: material (man=1, king≈2.5–3), advancement, back-rank defense, center control, mobility.
- Difficulty = search depth + a small randomization/blunder chance: **easy** depth ~2 (+ occasional random legal move), **normal** depth ~4, **hard** depth ~6–8 with move ordering. Add a hard time cap per move.

## 12. Test matrix (Vitest — all must pass before the engine branch merges)

**Setup & movement**
- Initial position has 12 red + 12 blue men on correct squares; turn = red.
- Man moves one diagonal forward to empty; cannot move sideways/backward/onto occupied/onto light square.
- King moves multiple empty squares any diagonal; blocked by first occupied square.

**Captures**
- Single man capture forward and backward.
- Multi-jump chain (2 and 3 captures) is required to continue to the end.
- King flying capture over a distant piece, landing on multiple possible squares.
- Cannot jump own piece / cannot jump two pieces at once / cannot re-jump a piece in the same chain.
- Captured pieces block landing during the chain and are removed only at chain end.

**Forced / maximum capture**
- When a capture exists, non-capturing moves are excluded from `legalMoves`.
- With `forcedMaxCapture=true`, only the longest capture chain(s) are legal; shorter captures are rejected by `isLegal`.

**Promotion**
- Man reaching back rank on a quiet move promotes; turn ends.
- Man reaching back rank as capture landing promotes and the chain stops.

**Outcome**
- Win by capturing all opponent pieces.
- Win when opponent has zero legal moves (stalemate = loss for blocked side).
- Draw by inactivity limit and by threefold repetition.

**Determinism / serialization**
- `applyMove` is pure (does not mutate input); `GameState` round-trips through `JSON.stringify`.
- Replaying `history` from `createInitialState` reproduces the final position exactly (powers the replay feature).
