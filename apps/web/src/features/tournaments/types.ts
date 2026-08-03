/** Shared shapes for the player-facing Tournaments ("Cups") feature — mirrors
 *  the real API in apps/server/src/modules/tournaments.ts. No fabricated
 *  fields: every value here comes straight off the server response. */

export type TournamentFormat = "SINGLE_ELIM" | "DOUBLE_ELIM" | "SWISS" | "ROUND_ROBIN";
export type TournamentStatus = "DRAFT" | "OPEN" | "RUNNING" | "COMPLETED" | "CANCELLED";

/** One row from GET /api/tournaments. */
export type TournamentListItem = {
  id: string;
  name: string;
  format: TournamentFormat;
  status: TournamentStatus;
  entryFeeGold: number;
  prizePoolGold: number;
  maxPlayers: number;
  registered: number;
  startsAt: string;
  minTrophies: number;
  joined: boolean;
};

export type TournamentEntryUser = {
  id: string;
  username: string;
  tag: string;
  avatarUrl: string | null;
};

export type TournamentEntry = {
  id: string;
  seed: number | null;
  eliminated: boolean;
  placement: number | null;
  user: TournamentEntryUser;
};

/** True for formats with no elimination bracket — ranked by a win/loss
 * standings table instead of a bracket tree. */
export function isStandingsFormat(format: TournamentFormat): boolean {
  return format === "ROUND_ROBIN" || format === "SWISS";
}

/** DOUBLE_ELIM has THREE sub-brackets (winners/losers/grand final) instead of
 * one — every other elimination format's matches all carry `bracket:"W"`
 * (the schema default), so they keep the single flat round list. */
export function isDoubleElim(format: TournamentFormat): boolean {
  return format === "DOUBLE_ELIM";
}

export const BRACKET_LABEL: Record<string, string> = { W: "Winners bracket", L: "Losers bracket", GF: "Grand final" };

export type TournamentMatch = {
  id: string;
  tournamentId: string;
  round: number;
  slot: number;
  bracket: string; // "W" | "L" | "GF" — DOUBLE_ELIM only
  redEntryId: string | null;
  blueEntryId: string | null;
  winnerEntryId: string | null;
  status: string; // "pending" | "ready" | "done"
  resolvedAt: string | null;
  /** Non-null while this slot is being played right now (ready-check auto-start). */
  matchId: string | null;
  redReadyAt: string | null;
  blueReadyAt: string | null;
  readyDeadlineAt: string | null;
};

/**
 * The signed-in player's current playable slot, or null. Served both by
 * GET /api/tournaments/:id (so the page is right on a cold load) and pushed on
 * EV.tournamentMatchState — identical shape, so one renderer handles both.
 */
export type TournamentMyMatch = {
  tournamentId: string;
  tmId: string;
  round: number;
  bracket: string;
  roundLabel: string;
  opponent: { userId: string; username: string; tag: string; avatarUrl: string | null; frameId: string | null } | null;
  iAmReady: boolean;
  opponentReady: boolean;
  /** ISO. Non-null once EITHER player has readied — the no-show countdown. */
  deadlineAt: string | null;
  /** Non-null once the match is live; the player should be on the board. */
  matchId: string | null;
  yourColor: "red" | "blue";
};

/** GET /api/tournaments/:id — the Tournament row plus entries/bracket/myEntry. */
export type TournamentDetail = {
  id: string;
  name: string;
  format: TournamentFormat;
  status: TournamentStatus;
  entryFeeGold: number;
  prizePoolGold: number;
  maxPlayers: number;
  registeredCount: number;
  minTrophies: number;
  startsAt: string;
  entries: TournamentEntry[];
  bracket: Record<string, TournamentMatch[]>;
  myEntry: { id: string; seed: number | null; eliminated: boolean; placement: number | null } | null;
  myMatch: TournamentMyMatch | null;
};

/** Whole seconds left on a ready deadline, floored at 0. */
export function secondsUntil(iso: string | null): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - Date.now();
  return Number.isNaN(ms) ? 0 : Math.max(0, Math.floor(ms / 1000));
}

/** "4:07" / "0:38" — a countdown, not a clock time. */
export function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export const FORMAT_LABEL: Record<TournamentFormat, string> = {
  SINGLE_ELIM: "Single Elimination",
  DOUBLE_ELIM: "Double Elimination",
  SWISS: "Swiss",
  ROUND_ROBIN: "Round Robin",
};

/** Status badge label + accent colour (matches the app's existing badge language). */
export const STATUS_META: Record<TournamentStatus, { label: string; color: string; bg: string }> = {
  DRAFT: { label: "Draft", color: "var(--ink2)", bg: "rgba(255,255,255,.05)" },
  OPEN: { label: "Open", color: "#7ee6a4", bg: "rgba(47,143,91,.16)" },
  RUNNING: { label: "Live", color: "#ff9aa8", bg: "rgba(168,55,68,.18)" },
  COMPLETED: { label: "Completed", color: "var(--ink2)", bg: "rgba(255,255,255,.05)" },
  CANCELLED: { label: "Cancelled", color: "var(--ink2)", bg: "rgba(255,255,255,.05)" },
};

/** "Jul 12, 3:00 PM" — short, locale-aware start label. */
export function formatStartsAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "TBD";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
