import { create } from "zustand";
import { EV } from "@dama/shared";
import { connectSocket, getSocket } from "../lib/socket";

/**
 * presenceStore — live online/offline state for the signed-in user's friends,
 * driven by the server's presence:update socket events.
 *
 * On start() we connect the socket, ask for a snapshot (presence:ping → the
 * server replies with the currently-online friend ids), and subscribe to
 * incremental presence:update pushes (a friend coming online/offline). The UI
 * reads isOnline(userId) or the `online` set. This holds NO fake data — a friend
 * is "online" only while the server reports them connected.
 */

type PresenceStore = {
  online: Set<string>;
  started: boolean;
  isOnline: (userId: string) => boolean;
  start: () => Promise<void>;
  stop: () => void;
};

export const usePresenceStore = create<PresenceStore>((set, get) => {
  const onUpdate = (p: {
    snapshot?: string[];
    userId?: string;
    status?: "online" | "offline";
  }) => {
    if (Array.isArray(p.snapshot)) {
      set({ online: new Set(p.snapshot) });
      return;
    }
    if (p.userId && p.status) {
      const next = new Set(get().online);
      if (p.status === "online") next.add(p.userId);
      else next.delete(p.userId);
      set({ online: next });
    }
  };

  return {
    online: new Set<string>(),
    started: false,
    isOnline: (userId) => get().online.has(userId),

    start: async () => {
      if (get().started) return;
      set({ started: true });
      try {
        const s = await connectSocket();
        s.off(EV.presenceUpdate, onUpdate);
        s.on(EV.presenceUpdate, onUpdate);
        s.emit(EV.presencePing); // request the initial online-friends snapshot
      } catch {
        // live presence unavailable → everyone shows offline (honest), no crash
        set({ started: false });
      }
    },

    stop: () => {
      const s = getSocket();
      s.off(EV.presenceUpdate, onUpdate);
      set({ online: new Set(), started: false });
    },
  };
});
