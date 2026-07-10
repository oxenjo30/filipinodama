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

export type TournamentMatch = {
  id: string;
  tournamentId: string;
  round: number;
  slot: number;
  redEntryId: string | null;
  blueEntryId: string | null;
  winnerEntryId: string | null;
  status: string; // "pending" | "ready" | "done"
  resolvedAt: string | null;
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
};

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
