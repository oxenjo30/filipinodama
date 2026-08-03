import { useMemo } from "react";
import { layoutBracket, bracketHeight, roundLabel, BRACKET_SECTION_LABEL, type BracketKey } from "@dama/shared";
import { Avatar } from "../../components";
import type { TournamentEntry, TournamentFormat, TournamentMatch } from "./types";

/**
 * BracketView — the tournament bracket, drawn the way an esports bracket is
 * drawn: a named header over each round column, one card per match with a row
 * per competitor, and elbow connectors running from each match into the one it
 * feeds.
 *
 * WHY POSITIONS ARE COMPUTED, NOT FLOWED. A winners bracket halves every round,
 * so plain flex columns with space-around would very nearly work. The losers
 * bracket does not: a "drop" round (where the winners bracket's fresh losers
 * enter) has the SAME match count as the round before it. Feeding is therefore
 * derived from the ratio of adjacent column sizes and every card is placed at
 * the midpoint of the matches that feed it — see layoutBracket in @dama/shared,
 * which the Android client uses too so the two render the same shape.
 *
 * NO SCORE COLUMN. Real esports brackets show a series score (2-1); our slots
 * are a single game, replayed only on a draw, so a score here would be invented.
 * The winner's row gets a check instead.
 */

const CARD_H = 60; // two 27px competitor rows + borders
const GAP = 20; // vertical gap between adjacent round-1 cards
const COL_W = 230;
const COL_GAP = 56;
const HEADER_H = 34;
const HEADER_GAP = 14;

const METRICS = { cardH: CARD_H, gap: GAP };

const colX = (roundIndex: number) => roundIndex * (COL_W + COL_GAP);

type SlotSide = {
  entry: TournamentEntry | null;
  isWinner: boolean;
  isBye: boolean;
  isMe: boolean;
};

function CompetitorRow({ side, decided, top }: { side: SlotSide; decided: boolean; top: boolean }) {
  const { entry, isWinner, isBye, isMe } = side;
  // Before a result, both rows read neutral; after it, the winner is lifted and
  // the loser is dimmed — the single strongest signal in a bracket.
  const dimmed = decided && !isWinner;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: CARD_H / 2 - 1,
        padding: "0 10px",
        borderBottom: top ? "1px solid rgba(232,184,75,.12)" : "none",
        background: isWinner ? "rgba(47,143,91,.14)" : "transparent",
        opacity: dimmed ? 0.5 : 1,
        minWidth: 0,
      }}
    >
      {entry ? (
        <>
          <Avatar src={entry.user.avatarUrl ?? "champion"} size={20} ring={false} />
          <span
            style={{
              flex: 1,
              minWidth: 0,
              font: `${isWinner ? 800 : 600} 12.5px Inter`,
              color: isWinner ? "#a9f0c4" : "#f2e9d2",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {entry.user.username}
            {isMe && (
              <span style={{ marginLeft: 6, font: "800 9px Inter", letterSpacing: ".5px", color: "var(--gold)" }}>YOU</span>
            )}
          </span>
          <span style={{ flex: "none", width: 14, textAlign: "center", font: "800 12px Inter", color: "#7ee6a4" }}>
            {isWinner ? "✓" : ""}
          </span>
        </>
      ) : (
        <span style={{ font: "600 12px Inter", color: "var(--ink2)", fontStyle: "italic" }}>{isBye ? "BYE" : "TBD"}</span>
      )}
    </div>
  );
}

function MatchCard({
  match,
  entryById,
  myEntryId,
  x,
  y,
}: {
  match: TournamentMatch;
  entryById: Map<string, TournamentEntry>;
  myEntryId: string | undefined;
  x: number;
  y: number;
}) {
  const red = match.redEntryId ? (entryById.get(match.redEntryId) ?? null) : null;
  const blue = match.blueEntryId ? (entryById.get(match.blueEntryId) ?? null) : null;
  const decided = match.status === "done" && !!match.winnerEntryId;
  // A bye is a slot that RESOLVED with only one competitor — the server seeds it
  // already `done`. A half-filled slot that is still pending is not a bye, it is
  // simply waiting on the match that feeds its empty side, and must read TBD.
  const bye = decided && (!match.redEntryId || !match.blueEntryId);
  const live = !!match.matchId && match.status !== "done";
  const mine = !!myEntryId && (match.redEntryId === myEntryId || match.blueEntryId === myEntryId);

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: COL_W,
        height: CARD_H,
        borderRadius: 8,
        overflow: "hidden",
        background: "rgba(0,0,0,.34)",
        border: mine ? "1.5px solid var(--gold)" : "1px solid rgba(232,184,75,.16)",
        boxShadow: mine ? "0 0 0 3px rgba(232,184,75,.12)" : "none",
      }}
    >
      <CompetitorRow
        top
        decided={decided}
        side={{ entry: red, isWinner: decided && match.winnerEntryId === match.redEntryId, isBye: bye && !red, isMe: !!myEntryId && match.redEntryId === myEntryId }}
      />
      <CompetitorRow
        top={false}
        decided={decided}
        side={{ entry: blue, isWinner: decided && match.winnerEntryId === match.blueEntryId, isBye: bye && !blue, isMe: !!myEntryId && match.blueEntryId === myEntryId }}
      />
      {live && (
        <span
          style={{
            position: "absolute",
            top: -1,
            right: -1,
            font: "800 8.5px Inter",
            letterSpacing: ".6px",
            padding: "2px 6px",
            borderRadius: "0 7px 0 6px",
            background: "rgba(168,55,68,.9)",
            color: "#ffe8ec",
          }}
        >
          LIVE
        </span>
      )}
    </div>
  );
}

/** One sub-bracket (winners / losers / grand final), or the whole thing for single-elim. */
function BracketSection({
  title,
  rounds,
  matchesByRound,
  entryById,
  myEntryId,
  doubleElim,
}: {
  title: string | null;
  rounds: number[];
  matchesByRound: Map<number, TournamentMatch[]>;
  entryById: Map<string, TournamentEntry>;
  myEntryId: string | undefined;
  doubleElim: boolean;
}) {
  const sizes = rounds.map((r) => (matchesByRound.get(r) ?? []).length);
  const layout = useMemo(() => layoutBracket(sizes, METRICS), [sizes.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const bodyH = bracketHeight(layout, METRICS);
  const totalW = rounds.length * COL_W + Math.max(0, rounds.length - 1) * COL_GAP;

  // Elbow connectors: each match runs a horizontal stub out of its right edge,
  // a vertical to its parent's centre line, then a horizontal into the parent.
  const paths: string[] = [];
  for (let r = 1; r < rounds.length; r++) {
    const size = sizes[r]!;
    const prevSize = sizes[r - 1]!;
    const feedersFor = (i: number): number[] => {
      if (prevSize === size * 2) return [i * 2, i * 2 + 1];
      if (prevSize === size) return [i];
      return [];
    };
    for (let i = 0; i < size; i++) {
      const parentY = (layout[r]?.[i] ?? 0) + CARD_H / 2;
      const parentX = colX(r);
      const midX = colX(r - 1) + COL_W + COL_GAP / 2;
      for (const f of feedersFor(i)) {
        const childY = layout[r - 1]?.[f];
        if (childY == null) continue;
        const cy = childY + CARD_H / 2;
        paths.push(`M ${colX(r - 1) + COL_W} ${cy} H ${midX} V ${parentY} H ${parentX}`);
      }
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {title && (
        <div style={{ font: "800 12px Inter", letterSpacing: ".7px", textTransform: "uppercase", color: "var(--gold)" }}>
          {title}
        </div>
      )}
      <div style={{ overflowX: "auto", paddingBottom: 8 }}>
        <div style={{ position: "relative", width: totalW, height: HEADER_H + HEADER_GAP + bodyH, minWidth: totalW }}>
          {/* Round headers */}
          {rounds.map((r, ri) => (
            <div
              key={`h-${r}`}
              style={{
                position: "absolute",
                left: colX(ri),
                top: 0,
                width: COL_W,
                height: HEADER_H,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 6,
                background: "rgba(255,255,255,.05)",
                border: "1px solid rgba(232,184,75,.14)",
                font: "700 11.5px Inter",
                letterSpacing: ".3px",
                color: "#e7dcc2",
                textAlign: "center",
                padding: "0 8px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={roundLabel(r, rounds, doubleElim)}
            >
              {roundLabel(r, rounds, doubleElim)}
            </div>
          ))}

          {/* Connectors sit UNDER the cards */}
          <svg
            width={totalW}
            height={bodyH}
            style={{ position: "absolute", left: 0, top: HEADER_H + HEADER_GAP, pointerEvents: "none" }}
            aria-hidden="true"
          >
            {paths.map((d, i) => (
              <path key={i} d={d} fill="none" stroke="rgba(232,184,75,.42)" strokeWidth={1.5} />
            ))}
          </svg>

          {/* Match cards */}
          {rounds.map((r, ri) =>
            (matchesByRound.get(r) ?? []).map((m, mi) => (
              <MatchCard
                key={m.id}
                match={m}
                entryById={entryById}
                myEntryId={myEntryId}
                x={colX(ri)}
                y={HEADER_H + HEADER_GAP + (layout[ri]?.[mi] ?? 0)}
              />
            )),
          )}
        </div>
      </div>
    </div>
  );
}

export function BracketView({
  matches,
  entries,
  format,
  myEntryId,
}: {
  matches: TournamentMatch[];
  entries: TournamentEntry[];
  format: TournamentFormat;
  myEntryId: string | undefined;
}) {
  const entryById = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);
  const doubleElim = format === "DOUBLE_ELIM";

  const sections = useMemo(() => {
    const byBracket = new Map<BracketKey, TournamentMatch[]>();
    for (const m of matches) {
      const key = (m.bracket === "L" || m.bracket === "GF" ? m.bracket : "W") as BracketKey;
      const list = byBracket.get(key) ?? [];
      list.push(m);
      byBracket.set(key, list);
    }

    const order: BracketKey[] = ["W", "L", "GF"];
    return order
      .filter((k) => (byBracket.get(k) ?? []).length > 0)
      .map((k) => {
        const list = byBracket.get(k)!;
        const matchesByRound = new Map<number, TournamentMatch[]>();
        for (const m of list) {
          const arr = matchesByRound.get(m.round) ?? [];
          arr.push(m);
          matchesByRound.set(m.round, arr);
        }
        for (const arr of matchesByRound.values()) arr.sort((a, b) => a.slot - b.slot);
        const rounds = [...matchesByRound.keys()].sort((a, b) => a - b);
        // Only label sections when there is more than one to tell apart.
        const title = doubleElim ? BRACKET_SECTION_LABEL[k] : null;
        return { key: k, title, rounds, matchesByRound };
      });
  }, [matches, doubleElim]);

  if (sections.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      {sections.map((s) => (
        <BracketSection
          key={s.key}
          title={s.title}
          rounds={s.rounds}
          matchesByRound={s.matchesByRound}
          entryById={entryById}
          myEntryId={myEntryId}
          doubleElim={doubleElim}
        />
      ))}
    </div>
  );
}

export default BracketView;
