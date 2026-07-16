import { create } from "zustand";
import { api } from "../lib/api";

/**
 * blockedStore — the signed-in viewer's blocked-players list, backed by
 * GET/POST/DELETE /api/blocks. Loaded lazily (once) by whichever surface
 * needs it first — PublicProfilePage (Block button), GuildChatPanel (hide
 * blocked authors + report), or the Settings "Blocked Players" list — and
 * shared after that so every surface reflects the same state.
 */

export type BlockedUser = {
  id: string;
  username: string;
  displayName: string;
  tag: string;
  avatarUrl: string | null;
  blockedAt: string;
};

type BlockedStore = {
  list: BlockedUser[];
  loaded: boolean;
  loading: boolean;
  isBlocked: (userId: string) => boolean;
  load: (force?: boolean) => Promise<void>;
  block: (user: BlockedUser) => Promise<void>;
  unblock: (userId: string) => Promise<void>;
};

export const useBlockedStore = create<BlockedStore>((set, get) => ({
  list: [],
  loaded: false,
  loading: false,

  isBlocked: (userId) => get().list.some((u) => u.id === userId),

  load: async (force = false) => {
    if (get().loading || (get().loaded && !force)) return;
    set({ loading: true });
    try {
      const res = await api.get<{ blocked: BlockedUser[] }>("/api/blocks");
      set({ list: res.blocked, loaded: true });
    } catch {
      // Leave prior state as-is (or empty on first load) — an honest
      // "couldn't load" rather than fabricated data.
    } finally {
      set({ loading: false });
    }
  },

  block: async (user) => {
    // Optimistic: reflect immediately; server call enforces the real guard
    // (self/bot/guest). On failure, roll back so the UI matches reality.
    const prev = get().list;
    if (!prev.some((u) => u.id === user.id)) set({ list: [user, ...prev] });
    try {
      await api.post("/api/blocks", { userId: user.id });
    } catch (e) {
      set({ list: prev });
      throw e;
    }
  },

  unblock: async (userId) => {
    const prev = get().list;
    set({ list: prev.filter((u) => u.id !== userId) });
    try {
      await api.del(`/api/blocks/${userId}`);
    } catch (e) {
      set({ list: prev });
      throw e;
    }
  },
}));
