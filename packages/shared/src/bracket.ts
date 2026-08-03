/**
 * Bracket DISPLAY helpers — round numbering, human round names, and the vertical
 * layout math every bracket view uses. Pure, no I/O, no DB types, so the server,
 * the web client and the admin client all render the same bracket the same way.
 *
 * The bracket MATH (seeding, drops, advancement) lives in the server's
 * lib/tournament-bracket.ts. Only the three round-offset constants are shared,
 * defined HERE as the single source of truth and re-exported there — a second
 * copy would be a silent drift risk, since a mismatch would put losers-bracket
 * matches under the wrong heading without failing any test.
 *
 * ROUND-OFFSET SCHEME: a match's sub-bracket is encoded in its round number so
 * that (tournamentId, round, slot) stays unique across all sub-brackets without
 * a schema change. Winners rounds are 1..log2(B); losers rounds are
 * 100 + localRound; the grand final is 201 (game 1) and 202 (the bracket-reset
 * game 2); group-stage rounds are 300 + localRound.
 */

export const L_ROUND_OFFSET = 100;
export const GF_ROUND = 201;
export const GF_RESET_ROUND = 202;
/**
 * Group-stage band, for GROUP_DOUBLE_ELIM. Sits ABOVE the grand-final band so
 * the existing W/L/GF numbering is untouched. A group of `g` players occupies
 * exactly `g` rounds (circle method), so even a 256-player single group tops out
 * at 556 and nothing else lives above 300.
 */
export const G_ROUND_OFFSET = 300;

/** Which sub-bracket a stored round number belongs to. */
export type BracketKey = "W" | "L" | "GF" | "G";

export function bracketOfRound(round: number): BracketKey {
  // ORDER MATTERS: the group band is numerically ABOVE the grand-final band, so
  // it has to be tested FIRST. With these two swapped, every group match reads
  // as a grand final — silently, since both are valid BracketKeys and nothing
  // else would throw.
  if (round >= G_ROUND_OFFSET) return "G";
  if (round >= 200) return "GF";
  if (round >= L_ROUND_OFFSET) return "L";
  return "W";
}

/** Section headings for the sub-brackets an event can present. */
export const BRACKET_SECTION_LABEL: Record<BracketKey, string> = {
  G: "Group Stage",
  W: "Upper Bracket",
  L: "Lower Bracket",
  GF: "Grand Final",
};

/**
 * The human name of one round column.
 *
 * `roundsInSection` is every round number present in this sub-bracket, ascending
 * — the label is derived from the round's DISTANCE FROM THE END, so it stays
 * correct for any bracket size (a 4-player Cup's round 2 is the Final; a
 * 16-player Cup's round 2 is the Quarterfinals) and needs no per-tournament
 * configuration.
 *
 * `doubleElim` switches the winners-bracket wording to the "Upper Bracket …"
 * form used when a losers bracket is also on screen; a single-elimination event
 * just says "Final" / "Semifinals" / "Round 2".
 */
export function roundLabel(round: number, roundsInSection: number[], doubleElim: boolean): string {
  const bracket = bracketOfRound(round);

  if (bracket === "GF") {
    return round === GF_RESET_ROUND ? "Grand Final (reset)" : "Grand Final";
  }

  const ordered = [...roundsInSection].sort((a, b) => a - b);
  const idx = ordered.indexOf(round);
  // fromEnd 0 = the last round of this section, 1 = the one before it, …
  const fromEnd = idx === -1 ? ordered.length - 1 : ordered.length - 1 - idx;

  if (bracket === "G") {
    // Group rounds are plain sequence numbers — there is no "final" round of a
    // round robin, every round is the same kind of thing.
    return `Group Stage — Round ${round - G_ROUND_OFFSET}`;
  }

  if (bracket === "L") {
    if (fromEnd === 0) return "Lower Bracket Final";
    if (fromEnd === 1) return "Lower Bracket Semifinal";
    if (fromEnd === 2) return "Lower Bracket Quarterfinal";
    return `Lower Bracket Round ${round - L_ROUND_OFFSET}`;
  }

  if (fromEnd === 0) return doubleElim ? "Upper Bracket Final" : "Final";
  if (fromEnd === 1) return doubleElim ? "Upper Bracket Semifinals" : "Semifinals";
  if (fromEnd === 2) return doubleElim ? "UB Quarterfinals" : "Quarterfinals";
  // Number by POSITION in the section, not by the raw round number. They agree
  // for an ordinary bracket (rounds 1..k), but GROUP_DOUBLE_ELIM never
  // materialises winners round 1 — the group stage decides it — so its winners
  // rounds start at 2 and the raw number would name the first playoff column
  // "Round 2". Only reachable at S >= 32, where three named rounds aren't enough.
  const displayRound = idx === -1 ? round : idx + 1;
  return doubleElim ? `Upper Bracket Round ${displayRound}` : `Round ${displayRound}`;
}

/** Geometry inputs for `layoutBracket`, in px (or dp — the math is unitless). */
export type BracketMetrics = {
  /** Height of one match card (both competitor rows plus its border). */
  cardH: number;
  /** Vertical gap between two adjacent round-1 cards. */
  gap: number;
};

/**
 * Vertical positions for every match in a bracket section.
 *
 * `roundSizes` is the number of matches per round column, in display order.
 * Returns `y[roundIndex][matchIndex]` — the TOP edge of each card.
 *
 * Positions are computed rather than left to the layout engine because the
 * losers bracket's column sizes do NOT simply halve: a "drop" round (where the
 * winners bracket's fresh losers enter) has the SAME number of matches as the
 * round before it, while a "consolidation" round halves it. So the feeder
 * relationship is derived from the ratio of adjacent column sizes:
 *
 *   prev === 2 * current  → this match is fed by matches 2i and 2i+1 (halving)
 *   prev === current      → this match is fed by match i (1:1 drop/consolidation)
 *
 * and a match is centred on its feeders. That single rule covers every column
 * shape `losersBracketStructure` can produce as well as every winners bracket,
 * so one function lays out all three sections.
 *
 * A column whose size matches neither case (never produced by our brackets, but
 * possible if data were ever malformed) falls back to even spacing so the view
 * degrades instead of throwing.
 */
export function layoutBracket(roundSizes: number[], metrics: BracketMetrics): number[][] {
  const { cardH, gap } = metrics;
  const out: number[][] = [];
  if (roundSizes.length === 0) return out;

  // Round 1: evenly stacked.
  const first = Array.from({ length: roundSizes[0]! }, (_, i) => i * (cardH + gap));
  out.push(first);

  const centre = (top: number) => top + cardH / 2;

  for (let r = 1; r < roundSizes.length; r++) {
    const size = roundSizes[r]!;
    const prevSize = roundSizes[r - 1]!;
    const prev = out[r - 1]!;
    const col: number[] = [];

    for (let i = 0; i < size; i++) {
      let centreY: number;
      if (prevSize === size * 2) {
        const a = prev[i * 2];
        const b = prev[i * 2 + 1];
        centreY = a != null && b != null ? (centre(a) + centre(b)) / 2 : centre(a ?? b ?? 0);
      } else if (prevSize === size) {
        centreY = centre(prev[i] ?? 0);
      } else {
        // Malformed column ratio — space evenly over the section instead of throwing.
        const totalH = Math.max(1, prev.length) * (cardH + gap);
        centreY = (totalH / size) * (i + 0.5);
      }
      col.push(centreY - cardH / 2);
    }
    out.push(col);
  }

  return out;
}

/** Total height a laid-out section needs (tallest column's lowest card bottom). */
export function bracketHeight(layout: number[][], metrics: BracketMetrics): number {
  let max = 0;
  for (const col of layout) {
    for (const y of col) max = Math.max(max, y + metrics.cardH);
  }
  return max;
}
