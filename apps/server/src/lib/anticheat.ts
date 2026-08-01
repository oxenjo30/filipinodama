import { createInitialState, legalMoves, applyMove, analysisBestMove } from "@dama/game-engine";
import { DEFAULT_SETTINGS, type GameSettings, type GameState, type Move } from "@dama/shared";

/**
 * Anti-cheat detection — engine-assistance analysis over a finished match.
 *
 * The signal we can actually derive from what we store is ENGINE AGREEMENT:
 * replay the match ply by ply and ask, at each of a player's turns, whether the
 * move they played is the one the engine would pick. A human who is feeding the
 * position to a solver agrees with it far more often than a human who is not.
 *
 * The measurement only means something if it is taken over positions where the
 * player actually had a CHOICE. Dama forces captures, so long stretches of a
 * game have exactly one legal move — everyone "agrees with the engine" there,
 * cheater and beginner alike. Counting those would push every player's rate
 * toward the same high number and make the metric worthless. So forced plies
 * are excluded from both numerator and denominator, and `decisionCount` (not
 * `moveCount`) is the sample size that matters.
 *
 * What this deliberately does NOT do:
 *  - It does not accuse. It produces a score and reasons; a human moderator
 *    decides. Engine agreement is evidence, not proof — a strong player on a
 *    tactically forced game can score high honestly, which is exactly why the
 *    sample-size floor and the review step exist.
 *  - It is not cheap: the reference search dominates, so analysis runs as a
 *    background job (lib/anticheat-service.ts), never inside a request.
 *  - It does not analyse move TIMING. Stored moves are {from, path, captures,
 *    promotion} with no timestamps, so per-move think time cannot be recovered
 *    for existing matches. Uniform think time is one of the strongest tells for
 *    engine use, so this is the biggest gap in the signal set — see
 *    `avgSecPerMove`, which is a whole-match average shared by both players and
 *    is reported as context only, never scored.
 */

/** A stored move as it appears in Match.moves — mirrors shared moveSchema. */
export type StoredMove = Move;

export type Side = "red" | "blue";

export interface SideAnalysis {
  side: Side;
  /** Every ply this side played. */
  moveCount: number;
  /** Plies where this side had more than one legal move — the real sample. */
  decisionCount: number;
  /** Of those, how many matched the engine's pick. */
  engineMatchCount: number;
  /** engineMatchCount / decisionCount, or null when there were no decisions. */
  engineMatchRate: number | null;
  /**
   * 0-100. Rises with agreement rate and with how much evidence there is.
   * Null when the sample is too small to say anything.
   */
  suspicion: number | null;
  /** Human-readable justifications, shown verbatim to the moderator. */
  reasons: string[];
}

export interface MatchAnalysis {
  /** Total plies replayed. */
  moveCount: number;
  /** Whole-match seconds per ply. Context only — it is not attributable to one player. */
  avgSecPerMove: number | null;
  red: SideAnalysis | null;
  blue: SideAnalysis | null;
  /** Set when the match could not be replayed (corrupt or truncated moves). */
  error?: string;
}

/**
 * Below this many DECISIONS a rate is noise — a 4-decision game at 100% is
 * meaningless. Matches under the floor are analysed and stored, but never
 * scored or flagged.
 */
export const MIN_DECISIONS = 12;

/**
 * Agreement at or above this over a sufficient sample is what we surface for
 * review. Chosen deliberately high: the cost of a false accusation is a banned
 * legitimate player, so this errs toward missing cheaters rather than catching
 * innocents. Raised from 0.85 to 0.90 when the reference depth was lowered
 * (below) — a shallower engine plays more "obvious" moves that strong humans
 * also find, so the honest-player baseline is higher and the bar must rise with
 * it. Tune from observed data before it ever drives an automatic action.
 */
export const FLAG_RATE = 0.9;

/**
 * Search depth of the reference engine.
 *
 * Depth 7 (the gameplay "hard" tier) would be the better reference, but it is
 * unusable in bulk. Measured on this codebase, one call takes ~2.4s in the
 * opening and ~13.3s mid-game, so a single match costs minutes — even as a
 * background job that does not scale. Depth 4 is ~0.14-0.52s per call, putting
 * a match in the seconds range.
 *
 * We deliberately do NOT use `bestMove(state, "normal")`, which is also depth 4:
 * it applies an 8% BLUNDER, returning a random legal move that often. A
 * reference that disagrees with itself cannot measure agreement, so analysis
 * uses `analysisBestMove`, the deterministic no-blunder search.
 */
const REFERENCE_DEPTH = 4;

function sameSquare(a: { r: number; c: number }, b: { r: number; c: number }): boolean {
  return a.r === b.r && a.c === b.c;
}

/** Two moves are the same if they start and end on the same squares via the same path. */
function sameMove(a: Move, b: Move): boolean {
  if (!sameSquare(a.from, b.from)) return false;
  if (a.path.length !== b.path.length) return false;
  for (let i = 0; i < a.path.length; i += 1) {
    if (!sameSquare(a.path[i]!, b.path[i]!)) return false;
  }
  return true;
}

/**
 * Score agreement into 0-100. Deliberately conservative and easy to reason
 * about rather than a tuned curve: below the flag rate it stays low, above it
 * it climbs, and it is damped when the sample is thin so a short game cannot
 * produce a high score on its own.
 */
function scoreSuspicion(rate: number, decisions: number): number {
  const over = Math.max(0, rate - FLAG_RATE) / (1 - FLAG_RATE); // 0..1 above the line
  const base = rate * 55; // agreement alone, even when below the line
  const excess = over * 45; // the part that actually indicates something
  const confidence = Math.min(1, decisions / (MIN_DECISIONS * 2)); // thin samples damped
  return Math.round(Math.min(100, (base + excess) * confidence));
}

function analyseSide(
  side: Side,
  moveCount: number,
  decisionCount: number,
  engineMatchCount: number
): SideAnalysis {
  const rate = decisionCount > 0 ? engineMatchCount / decisionCount : null;
  const reasons: string[] = [];
  let suspicion: number | null = null;

  if (rate === null || decisionCount < MIN_DECISIONS) {
    reasons.push(
      `Sample too small to score — ${decisionCount} position${decisionCount === 1 ? "" : "s"} with a real choice (need ${MIN_DECISIONS}).`
    );
  } else {
    suspicion = scoreSuspicion(rate, decisionCount);
    const pct = Math.round(rate * 100);
    if (rate >= FLAG_RATE) {
      reasons.push(
        `Agreed with the engine on ${pct}% of ${decisionCount} free choices (flag threshold ${Math.round(FLAG_RATE * 100)}%).`
      );
    } else {
      reasons.push(`Agreed with the engine on ${pct}% of ${decisionCount} free choices — below the ${Math.round(FLAG_RATE * 100)}% threshold.`);
    }
  }

  reasons.push(
    `${moveCount} total plies, of which ${moveCount - decisionCount} were forced (single legal move) and excluded.`
  );

  return { side, moveCount, decisionCount, engineMatchCount, engineMatchRate: rate, suspicion, reasons };
}

/**
 * Replay a stored match and measure engine agreement for both sides.
 *
 * Pure and side-effect free so it can be unit-tested without a database. The
 * caller supplies the raw `moves` JSON and the match settings; anything that
 * fails to replay (illegal or truncated move list) returns an `error` rather
 * than throwing, because one corrupt row must never break a moderator's queue.
 */
export function analyseMatch(
  rawMoves: unknown,
  rawSettings: unknown,
  durationSec: number | null
): MatchAnalysis {
  const moves = Array.isArray(rawMoves) ? (rawMoves as StoredMove[]) : [];
  const empty: MatchAnalysis = {
    moveCount: moves.length,
    avgSecPerMove: durationSec !== null && moves.length > 0 ? durationSec / moves.length : null,
    red: null,
    blue: null,
  };
  if (moves.length === 0) return { ...empty, error: "Match has no recorded moves." };

  // Settings come out of a Json column, so validate rather than cast. A row
  // written by an older build may be missing fields; falling back to defaults
  // keeps a replay possible instead of discarding the match.
  const raw = (rawSettings ?? {}) as Partial<GameSettings>;
  const settings: GameSettings = {
    forcedMaxCapture:
      typeof raw.forcedMaxCapture === "boolean" ? raw.forcedMaxCapture : DEFAULT_SETTINGS.forcedMaxCapture,
    drawMoveLimit:
      typeof raw.drawMoveLimit === "number" && raw.drawMoveLimit > 0
        ? raw.drawMoveLimit
        : DEFAULT_SETTINGS.drawMoveLimit,
    ...(typeof raw.moveTimerSec === "number" ? { moveTimerSec: raw.moveTimerSec } : {}),
  };
  let state: GameState;
  try {
    state = createInitialState(settings);
  } catch {
    return { ...empty, error: "Match settings could not be loaded." };
  }

  const tally: Record<Side, { moves: number; decisions: number; matches: number }> = {
    red: { moves: 0, decisions: 0, matches: 0 },
    blue: { moves: 0, decisions: 0, matches: 0 },
  };

  for (let i = 0; i < moves.length; i += 1) {
    const played = moves[i]!;
    const mover = state.turn as Side;
    let options: Move[];
    try {
      options = legalMoves(state);
    } catch {
      return { ...empty, error: `Could not compute legal moves at ply ${i + 1}.` };
    }
    if (options.length === 0) break; // game already over; trailing moves are junk

    const chosen = options.find((m) => sameMove(m, played));
    if (!chosen) {
      // The stored move is not legal from this position: the record is corrupt
      // or was written by an older engine. Report rather than guess.
      return { ...empty, error: `Ply ${i + 1} is not a legal move from the replayed position.` };
    }

    tally[mover].moves += 1;
    // Only positions with a genuine choice carry information.
    if (options.length > 1) {
      tally[mover].decisions += 1;
      try {
        if (sameMove(analysisBestMove(state, REFERENCE_DEPTH), chosen)) tally[mover].matches += 1;
      } catch {
        // A single engine hiccup should not void the whole analysis; that ply
        // simply contributes a non-match, which is the conservative direction.
      }
    }

    try {
      state = applyMove(state, chosen);
    } catch {
      return { ...empty, error: `Replay diverged at ply ${i + 1}.` };
    }
  }

  return {
    moveCount: moves.length,
    avgSecPerMove: durationSec !== null && moves.length > 0 ? durationSec / moves.length : null,
    red: analyseSide("red", tally.red.moves, tally.red.decisions, tally.red.matches),
    blue: analyseSide("blue", tally.blue.moves, tally.blue.decisions, tally.blue.matches),
  };
}

/** True when a side's result is strong enough to put in front of a moderator. */
export function shouldFlag(side: SideAnalysis | null): boolean {
  if (!side || side.engineMatchRate === null) return false;
  return side.decisionCount >= MIN_DECISIONS && side.engineMatchRate >= FLAG_RATE;
}
