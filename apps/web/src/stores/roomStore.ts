import { create } from "zustand";
import { EV, DEFAULT_SETTINGS, type GameSettings, type MatchMode, type PieceColor } from "@dama/shared";
import { connectSocket, getSocket } from "../lib/socket";
import { useOnlineStore } from "./onlineStore";

/**
 * roomStore — client state for a PRIVATE ROOM over the socket (server-owned).
 *
 * The server owns the true room (host/guest/spectators/settings). This store is
 * a thin mirror: it emits the room intents (create/join/spectate/settings/kick/
 * ban/start/leave/chat) and renders whatever the server broadcasts back on
 * EV.roomState + "room:chat". Nothing here is fabricated — every member, chip and
 * chat line comes from a real server event.
 *
 * When the host starts the match, the server seeds a real server-authoritative
 * Match and emits EV.roomStart {matchId,yourColor} to both players (and updates
 * roomState.matchId for spectators). We hand that match off to the onlineStore
 * (setting it to "playing" and asking the server to resync the opening state) and
 * expose `startedMatchId` so the page can navigate into the online match view.
 */

/** A room member as broadcast by the server (publicMember shape). */
export type RoomMember = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  tag: string;
};

/** A single relayed room chat line (ephemeral; server does not persist these). */
export type RoomChatMsg = {
  id: string;
  from: RoomMember;
  body: string;
  at: number;
};

/** Why the room is no longer available to us (drives the page's error banner). */
export type RoomError =
  | { kind: "not-found"; code: string }
  | { kind: "banned"; code: string }
  | { kind: "closed" } // host left / room torn down
  | { kind: "kicked" }
  | { kind: "you-banned" }; // host banned us

export type RoomStore = {
  /** Live room snapshot (null until we've created/joined one). */
  code: string | null;
  hostId: string | null;
  host: RoomMember | null;
  guest: RoomMember | null;
  spectators: RoomMember[];
  settings: GameSettings;
  mode: MatchMode;
  /** Set by the server once the host starts (spectators observe this too). */
  matchId: string | null;

  /** Live relayed room chat, oldest → newest. */
  chat: RoomChatMsg[];

  /** Non-null while the socket is connecting/creating (drives button states). */
  connecting: boolean;
  /** Present when the room became unavailable (not-found / banned / closed / …). */
  error: RoomError | null;

  /**
   * Set to the started match id (once EV.roomStart arrives for us as a player) so
   * the page can navigate into /play/online. The page clears it after navigating.
   */
  startedMatchId: string | null;

  create: (mode?: MatchMode) => Promise<void>;
  join: (code: string) => Promise<void>;
  spectate: (code: string) => Promise<void>;
  setSettings: (settings: Partial<GameSettings>) => void;
  kick: (userId: string) => void;
  ban: (userId: string) => void;
  start: () => void;
  leave: () => void;
  sendChat: (body: string) => void;

  /** Clear the startedMatchId flag after the page has navigated. */
  consumeStart: () => void;
  /** Dismiss the current error banner (e.g. after showing it). */
  clearError: () => void;
  /** Reset the whole store to its empty state (on unmount). */
  reset: () => void;
};

/** The server's EV.roomState broadcast — either a full snapshot or a status flag. */
type RoomStatePayload =
  | {
      code: string;
      hostId: string;
      host: RoomMember;
      guest: RoomMember | null;
      spectators: RoomMember[];
      settings: GameSettings;
      mode: MatchMode;
      matchId: string | null;
    }
  | { code: string; error: "not-found" | "banned" }
  | { code: string; closed: true }
  | { code: string; kicked: string }
  | { code: string; banned: string };

const EMPTY = {
  code: null,
  hostId: null,
  host: null,
  guest: null,
  spectators: [] as RoomMember[],
  settings: { ...DEFAULT_SETTINGS },
  mode: "PRIVATE" as MatchMode,
  matchId: null,
  chat: [] as RoomChatMsg[],
  connecting: false,
  error: null as RoomError | null,
  startedMatchId: null as string | null,
};

let wired = false;

export const useRoomStore = create<RoomStore>((set, get) => {
  /** Attach the room socket listeners exactly once (shared singleton socket). */
  function wire() {
    if (wired) return;
    wired = true;
    const s = getSocket();

    s.on(EV.roomState, (p: RoomStatePayload) => {
      // Error / status flags first — these tell us the room is gone for us.
      if ("error" in p) {
        set({
          error: p.error === "banned" ? { kind: "banned", code: p.code } : { kind: "not-found", code: p.code },
          connecting: false,
        });
        return;
      }
      if ("closed" in p) {
        // Host left / room torn down. Only surface if it's the room we're in.
        if (get().code === p.code) set({ ...EMPTY, error: { kind: "closed" } });
        return;
      }
      if ("kicked" in p) {
        if (get().code === p.code) set({ ...EMPTY, error: { kind: "kicked" } });
        return;
      }
      if ("banned" in p) {
        if (get().code === p.code) set({ ...EMPTY, error: { kind: "you-banned" } });
        return;
      }

      // Full snapshot — mirror it verbatim (nothing fabricated).
      set({
        code: p.code,
        hostId: p.hostId,
        host: p.host,
        guest: p.guest,
        spectators: p.spectators ?? [],
        settings: p.settings,
        mode: p.mode,
        matchId: p.matchId,
        connecting: false,
        error: null,
      });
    });

    s.on(EV.roomStart, (p: { matchId: string; yourColor: PieceColor }) => {
      // The server has already seeded a real match and joined our socket to its
      // room. Hand it to the onlineStore (which owns live match rendering) so the
      // online match view resyncs into it, then flag the page to navigate.
      // Carry the REAL opponent identity from the room state so the match view
      // shows the actual player, not a generic "Opponent". yourColor red ⇒ host,
      // so the opponent is the guest (and vice-versa).
      const rs = get();
      const opp = p.yourColor === "red" ? rs.guest : rs.host;
      const opponent = opp
        ? {
            id: opp.userId,
            username: opp.name,
            displayName: opp.name,
            tag: opp.tag,
            avatarUrl: opp.avatarUrl,
            trophies: 0,
            rankTier: "squire",
          }
        : null;
      useOnlineStore.setState({
        status: "playing",
        matchId: p.matchId,
        myColor: p.yourColor,
        opponent,
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
      set({ matchId: p.matchId, startedMatchId: p.matchId });
    });

    s.on("room:chat", (p: { from: RoomMember; body: string; at: number }) => {
      set((st) => ({
        chat: [
          ...st.chat,
          { id: `${p.at}-${p.from.userId}-${st.chat.length}`, from: p.from, body: p.body, at: p.at },
        ],
      }));
    });
  }

  /** Ensure a live socket + listeners before emitting a room intent. */
  async function ready(): Promise<boolean> {
    try {
      await connectSocket();
      wire();
      return true;
    } catch {
      set({ connecting: false, error: null });
      return false;
    }
  }

  return {
    ...EMPTY,

    create: async (mode) => {
      set({ ...EMPTY, connecting: true });
      if (!(await ready())) return;
      getSocket().emit(EV.roomCreate, mode ? { mode } : {});
    },

    join: async (code) => {
      const trimmed = code.trim().toUpperCase();
      if (!trimmed) return;
      set({ ...EMPTY, connecting: true });
      if (!(await ready())) return;
      getSocket().emit(EV.roomJoin, { code: trimmed });
    },

    spectate: async (code) => {
      const trimmed = code.trim().toUpperCase();
      if (!trimmed) return;
      set({ ...EMPTY, connecting: true });
      if (!(await ready())) return;
      getSocket().emit(EV.roomSpectate, { code: trimmed });
    },

    setSettings: (settings) => {
      // Host-only on the server; the broadcast echoes the authoritative result.
      getSocket().emit(EV.roomSettings, { settings });
    },

    kick: (userId) => {
      getSocket().emit(EV.roomKick, { userId });
    },

    ban: (userId) => {
      getSocket().emit(EV.roomBan, { userId });
    },

    start: () => {
      // Host-only, requires a guest — the server validates. On success it emits
      // EV.roomStart back to both players (handled above).
      getSocket().emit(EV.roomStart);
    },

    leave: () => {
      try {
        getSocket().emit(EV.roomLeave);
      } catch {
        /* socket may be down — nothing to leave */
      }
      set({ ...EMPTY });
    },

    sendChat: (body) => {
      const text = body.trim().slice(0, 300);
      if (!text) return;
      getSocket().emit("room:chat", { body: text });
    },

    consumeStart: () => set({ startedMatchId: null }),
    clearError: () => set({ error: null }),
    reset: () => set({ ...EMPTY }),
  };
});
