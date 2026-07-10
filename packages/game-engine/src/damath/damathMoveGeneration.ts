import type {
  DamathCoord,
  DamathGameState,
  DamathLegalMove,
  DamathOperator,
  DamathPiece,
  DamathPlayerId,
} from "@dama/shared";
import { operatorAt } from "./damathBoard.js";

const DIAGONALS: DamathCoord[] = [
  { x: -1, y: -1 },
  { x: -1, y: 1 },
  { x: 1, y: -1 },
  { x: 1, y: 1 },
];

const inBounds = (x: number, y: number) => x >= 0 && x < 8 && y >= 0 && y < 8;

/** Red (bottom) moves −y; Blue (top) moves +y. */
const forwardDir = (player: DamathPlayerId) => (player === "red" ? -1 : 1);

/** Back rank a man promotes on: Red → y=0, Blue → y=7. */
const backRank = (player: DamathPlayerId) => (player === "red" ? 0 : 7);

const pieceAt = (pieces: DamathPiece[], x: number, y: number) =>
  pieces.find((p) => p.pos.x === x && p.pos.y === y);

/** Quiet (non-capturing) moves for one piece. Men move forward only; a flying
 *  dama slides any distance along an empty diagonal. */
function quietMoves(state: DamathGameState, piece: DamathPiece): DamathLegalMove[] {
  const out: DamathLegalMove[] = [];
  const dirs = piece.dama
    ? DIAGONALS
    : DIAGONALS.filter((d) => d.y === forwardDir(piece.player));

  for (const d of dirs) {
    let x = piece.pos.x + d.x;
    let y = piece.pos.y + d.y;
    if (piece.dama && state.options.allowFlyingDama) {
      while (inBounds(x, y) && !pieceAt(state.pieces, x, y)) {
        out.push(quietMove(piece, { x, y }));
        x += d.x;
        y += d.y;
      }
    } else if (inBounds(x, y) && !pieceAt(state.pieces, x, y)) {
      out.push(quietMove(piece, { x, y }));
    }
  }
  return out;
}

function quietMove(piece: DamathPiece, to: DamathCoord): DamathLegalMove {
  return {
    pieceId: piece.id,
    from: { ...piece.pos },
    path: [to],
    capturedIds: [],
    landingOperators: [],
    promotion: !piece.dama && to.y === backRank(piece.player),
  };
}

/**
 * All capture chains for one piece, as full DamathLegalMoves. A man captures
 * forward AND backward (when allowBackwardCaptureForRegularPiece); a flying
 * dama captures a single enemy along a ray with ≥1 empty landing beyond and
 * may choose among the landing squares. Mid-chain promotion of a man stops
 * the chain (§5.2). The recursion works over a snapshot of piece positions,
 * removing victims as it descends.
 */
function captureChains(state: DamathGameState, piece: DamathPiece): DamathLegalMove[] {
  const opts = state.options;
  const flying = piece.dama && opts.allowFlyingDama;
  const promotesAt = backRank(piece.player);

  // position → occupying piece (the mover included, at its origin).
  const occ = new Map<string, DamathPiece>();
  for (const p of state.pieces) occ.set(`${p.pos.x},${p.pos.y}`, p);

  const results: DamathLegalMove[] = [];

  // `at` = current square of the (possibly mid-chain) mover.
  // `removed` = ids of victims already captured this chain (treated empty).
  const recurse = (
    at: DamathCoord,
    isDama: boolean,
    removed: Set<string>,
    path: DamathCoord[],
    capturedIds: string[],
    landingOps: DamathOperator[],
  ): void => {
    const victimAt = (x: number, y: number): DamathPiece | undefined => {
      const o = occ.get(`${x},${y}`);
      if (!o || o.id === piece.id || o.player === piece.player || removed.has(o.id)) {
        return undefined;
      }
      return o;
    };
    const isEmpty = (x: number, y: number): boolean => {
      if (!inBounds(x, y)) return false;
      const o = occ.get(`${x},${y}`);
      return !o || o.id === piece.id || removed.has(o.id);
    };

    let extended = false;

    const jump = (victim: DamathPiece, landing: DamathCoord): void => {
      const op = operatorAt(landing.x, landing.y) as DamathOperator; // captures always land playable
      const nextPath = [...path, landing];
      const nextCaptured = [...capturedIds, victim.id];
      const nextOps = [...landingOps, op];
      const promotes = !isDama && landing.y === promotesAt;
      if (promotes) {
        // mid-chain promotion stops the chain — emit as a complete move.
        results.push(makeMove(piece, nextPath, nextCaptured, nextOps, true));
        return;
      }
      recurse(landing, isDama, new Set(removed).add(victim.id), nextPath, nextCaptured, nextOps);
    };

    for (const d of DIAGONALS) {
      if (flying) {
        // slide to the first non-empty square along the ray.
        let x = at.x + d.x;
        let y = at.y + d.y;
        while (isEmpty(x, y)) {
          x += d.x;
          y += d.y;
        }
        const victim = victimAt(x, y);
        if (!victim) continue;
        // any empty square beyond the victim is a valid landing.
        let lx = x + d.x;
        let ly = y + d.y;
        while (isEmpty(lx, ly)) {
          extended = true;
          jump(victim, { x: lx, y: ly });
          lx += d.x;
          ly += d.y;
        }
      } else {
        const victim = victimAt(at.x + d.x, at.y + d.y);
        if (victim && isEmpty(at.x + 2 * d.x, at.y + 2 * d.y)) {
          extended = true;
          jump(victim, { x: at.x + 2 * d.x, y: at.y + 2 * d.y });
        }
      }
    }

    if (!extended && capturedIds.length > 0) {
      results.push(makeMove(piece, path, capturedIds, landingOps, false));
    }
  };

  recurse({ ...piece.pos }, piece.dama, new Set(), [], [], []);
  return results;
}

function makeMove(
  piece: DamathPiece,
  path: DamathCoord[],
  capturedIds: string[],
  landingOps: DamathOperator[],
  promotedMidChain: boolean,
): DamathLegalMove {
  const landing = path[path.length - 1];
  return {
    pieceId: piece.id,
    from: { ...piece.pos },
    path: path.map((c) => ({ ...c })),
    capturedIds: [...capturedIds],
    landingOperators: [...landingOps],
    promotion: promotedMidChain || (!piece.dama && landing.y === backRank(piece.player)),
  };
}

/** Legal moves for a single piece, after the game-wide capture filters. */
export function getLegalDamathMoves(
  state: DamathGameState,
  pieceId: string,
): DamathLegalMove[] {
  return getAllLegalDamathMoves(state).filter((m) => m.pieceId === pieceId);
}

/** All legal moves for the side to move, after mandatory/max/dama filtering. */
export function getAllLegalDamathMoves(state: DamathGameState): DamathLegalMove[] {
  const mine = state.pieces.filter((p) => p.player === state.turn);

  const captures: DamathLegalMove[] = [];
  const quiets: DamathLegalMove[] = [];
  for (const piece of mine) {
    captures.push(...captureChains(state, piece));
    quiets.push(...quietMoves(state, piece));
  }

  if (captures.length > 0) return filterCaptures(state, captures);
  return quiets;
}

/** Max-capture-by-COUNT, then dama-capture-priority among survivors (§5.2). */
function filterCaptures(
  state: DamathGameState,
  captures: DamathLegalMove[],
): DamathLegalMove[] {
  let pool = captures;
  if (state.options.mustTakeMaximumPieces) {
    const max = Math.max(...pool.map((m) => m.capturedIds.length));
    pool = pool.filter((m) => m.capturedIds.length === max);
  }
  if (state.options.damaCapturePriority) {
    const byDama = pool.filter(
      (m) => state.pieces.find((p) => p.id === m.pieceId)?.dama === true,
    );
    if (byDama.length > 0) pool = byDama;
  }
  return pool;
}
