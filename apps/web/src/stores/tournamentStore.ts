import { create } from "zustand";
import { EV } from "@dama/shared";
import { connectSocket, getSocket } from "../lib/socket";
import { useOnlineStore } from "./onlineStore";
import type { TournamentMyMatch } from "../features/tournaments/types";

/**
 * tournamentStore — the live half of the Cups pages.
 *
 * The tournament page loads `myMatch` over REST, so it is already correct before
 * this store does anything. All this adds is liveness: press Ready, see the
 * opponent's Ready land without refreshing, and get pushed onto the board the
 * instant the server starts the match.
 *
 * The start handoff is deliberately the same shape as roomStore's EV.roomStart
 * handler — by the time the event arrives the server has already created the
 * Match, seeded it in Redis and joined our socket to its room, so all that is
 * left client-side is to point onlineStore at it and resync.
 */

export type TournamentReadyError = { code: string; message: string };

type TournamentStore = {
  /** Latest server truth for our current slot (null = we have no open match). */
  myMatch: TournamentMyMatch | null;
  /** Set when the server starts our match, so the page can navigate. Cleared by consumeStart(). */
  startedMatchId: string | null;
  /** Last ready failure, for a toast. Cleared by consumeError(). */
  error: TournamentReadyError | null;
  /** True between pressing Ready and the server echoing our readiness back. */
  pending: boolean;

  bind: () => Promise<void>;
  /** Seed from the REST payload on page load / refetch. */
  hydrate: (myMatch: TournamentMyMatch | null) => void;
  ready: (tmId: string) => void;
  consumeStart: () => void;
  consumeError: () => TournamentReadyError | null;
  reset: () => void;
};

let bound = false;

export const useTournamentStore = create<TournamentStore>((set, get) => ({
  myMatch: null,
  startedMatchId: null,
  error: null,
  pending: false,

  bind: async () => {
    if (bound) return;
    // connectSocket resolves once the socket is authenticated and live; binding
    // before that would attach handlers to a socket that immediately reconnects.
    let s: Awaited<ReturnType<typeof connectSocket>>;
    try {
      s = await connectSocket();
    } catch {
      return; // offline — the REST payload still renders the card correctly
    }
    if (bound) return; // a second bind() resolved while we were awaiting
    bound = true;

    s.on(EV.tournamentMatchState, (p: TournamentMyMatch | { error: TournamentReadyError } | null) => {
      if (p && typeof p === "object" && "error" in p) {
        set({ error: p.error, pending: false });
        return;
      }
      set({ myMatch: p ?? null, pending: false });
    });

    s.on(
      EV.tournamentStart,
      (p: { tournamentId: string; tmId: string; matchId: string; yourColor: "red" | "blue" }) => {
        // Our socket is already in the match room; hand the match to onlineStore
        // (which owns live board rendering) and ask for the opening state.
        const opp = get().myMatch?.opponent ?? null;
        useOnlineStore.setState({
          status: "playing",
          matchId: p.matchId,
          myColor: p.yourColor,
          opponent: opp
            ? {
                id: opp.userId,
                username: opp.username,
                displayName: opp.username,
                tag: opp.tag,
                avatarUrl: opp.avatarUrl,
                trophies: 0,
                rankTier: "squire",
              }
            : null,
          state: null,
          selected: null,
          moveTargets: [],
          captureTargets: [],
          mustCapture: false,
          end: null,
          error: null,
          chat: [],
          offeredByMe: false,
          offeredByOpponent: false,
          rematchDeclined: false,
        });
        s.emit(EV.matchResync, { matchId: p.matchId });
        set({ startedMatchId: p.matchId, pending: false });
      },
    );
  },

  hydrate: (myMatch) => set({ myMatch }),

  ready: (tmId) => {
    set({ pending: true, error: null });
    try {
      getSocket().emit(EV.tournamentReady, { tmId });
    } catch {
      // Socket down — surface it rather than leaving the button spinning.
      set({ pending: false, error: { code: "OFFLINE", message: "You're offline — reconnecting…" } });
    }
  },

  consumeStart: () => set({ startedMatchId: null }),

  consumeError: () => {
    const e = get().error;
    if (e) set({ error: null });
    return e;
  },

  reset: () => set({ myMatch: null, startedMatchId: null, error: null, pending: false }),
}));
