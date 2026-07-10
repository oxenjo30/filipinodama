import { create } from "zustand";
import type { DamathPlayerId, DamathVariant } from "@dama/shared";
import { EV } from "@dama/shared";
import { connectSocket, getSocket } from "../lib/socket";

/**
 * damathRoomStore — client state for a Math Dama private room. The server owns
 * the room; this store sends intents (create/join/start/leave/chat) and renders
 * whatever the server broadcasts on damath:room:state + damath:room:chat.
 * Mirrors Classic's roomStore but for the Damath room events. On host-start the
 * server emits damath:room:start with the seeded matchId; the page hands off to
 * damathOnlineStore.attachMatch and navigates to the online board.
 */

export type DamathRoomMember = { userId: string; name: string; avatarUrl: string | null; tag: string } | null;
export type DamathRoomChatMsg = { id: string; from: NonNullable<DamathRoomMember>; body: string; at: number };

type StartInfo = { matchId: string; yourColor: DamathPlayerId; variant: DamathVariant } | null;
type RoomError = { kind: "not-found" | "full" | "closed" | "server"; code?: string } | null;

export type DamathRoomStore = {
  code: string | null;
  hostId: string | null;
  host: DamathRoomMember;
  guest: DamathRoomMember;
  variant: DamathVariant;
  matchId: string | null;
  chat: DamathRoomChatMsg[];
  connecting: boolean;
  error: RoomError;
  /** set once when the host starts; the page consumes it to navigate. */
  startInfo: StartInfo;

  create: (variant?: DamathVariant) => Promise<void>;
  join: (code: string) => Promise<void>;
  start: () => void;
  leave: () => void;
  sendChat: (body: string) => void;
  consumeStart: () => void;
  clearError: () => void;
  reset: () => void;
};

let wired = false;

export const useDamathRoomStore = create<DamathRoomStore>((set, get) => {
  function wire() {
    if (wired) return;
    wired = true;
    const s = getSocket();

    s.on(
      EV.damathRoomState,
      (snap: {
        code: string;
        hostId?: string;
        host?: DamathRoomMember;
        guest?: DamathRoomMember;
        variant?: DamathVariant;
        matchId?: string | null;
        error?: string;
        closed?: boolean;
      }) => {
        if (snap.closed) {
          set({ error: { kind: "closed", code: snap.code }, code: null, hostId: null, host: null, guest: null, matchId: null });
          return;
        }
        if (snap.error) {
          set({
            error:
              snap.error === "not-found"
                ? { kind: "not-found", code: snap.code }
                : snap.error === "full"
                  ? { kind: "full", code: snap.code }
                  : { kind: "server" },
          });
          return;
        }
        set({
          code: snap.code,
          hostId: snap.hostId ?? null,
          host: snap.host ?? null,
          guest: snap.guest ?? null,
          variant: snap.variant ?? get().variant,
          matchId: snap.matchId ?? null,
          error: null,
        });
      },
    );

    s.on(
      EV.damathRoomStart,
      (p: { matchId: string; yourColor: DamathPlayerId; variant: DamathVariant }) => {
        set({ startInfo: p });
      },
    );

    s.on(EV.damathRoomChat, (p: { from: NonNullable<DamathRoomMember>; body: string; at: number }) => {
      set((st) => ({
        chat: [...st.chat, { id: `${p.at}-${p.from.userId}-${st.chat.length}`, from: p.from, body: p.body, at: p.at }],
      }));
    });
  }

  async function ensure(): Promise<boolean> {
    set({ connecting: true, error: null });
    try {
      await connectSocket();
      wire();
      set({ connecting: false });
      return true;
    } catch {
      set({ connecting: false, error: { kind: "server" } });
      return false;
    }
  }

  return {
    code: null,
    hostId: null,
    host: null,
    guest: null,
    variant: "whole",
    matchId: null,
    chat: [],
    connecting: false,
    error: null,
    startInfo: null,

    create: async (variant = "whole") => {
      set({ variant, chat: [] });
      if (await ensure()) getSocket().emit(EV.damathRoomCreate, { variant });
    },

    join: async (code) => {
      const c = code.trim().toUpperCase();
      if (c.length < 4) return;
      set({ chat: [] });
      if (await ensure()) getSocket().emit(EV.damathRoomJoin, { code: c });
    },

    start: () => {
      try {
        getSocket().emit(EV.damathRoomStart);
      } catch {
        set({ error: { kind: "server" } });
      }
    },

    leave: () => {
      try {
        getSocket().emit(EV.damathRoomLeave);
      } catch {
        /* ignore */
      }
      set({ code: null, hostId: null, host: null, guest: null, matchId: null, chat: [] });
    },

    sendChat: (body) => {
      const text = body.trim();
      if (!text) return;
      try {
        getSocket().emit(EV.damathRoomChat, { body: text });
      } catch {
        /* server echoes real messages back */
      }
    },

    consumeStart: () => set({ startInfo: null }),
    clearError: () => set({ error: null }),
    reset: () =>
      set({
        code: null,
        hostId: null,
        host: null,
        guest: null,
        matchId: null,
        chat: [],
        connecting: false,
        error: null,
        startInfo: null,
      }),
  };
});
