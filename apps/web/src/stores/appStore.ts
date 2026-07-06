import { create } from "zustand";

/**
 * appStore — light-weight global UI state that isn't part of a match: the
 * player's placeholder profile/currency balances shown in the nav, and a simple
 * toast queue used to give feedback for "coming soon" actions so no control is
 * ever dead.
 */

export type Toast = { id: number; message: string };

export type AppStore = {
  // ── placeholder profile / currencies (no backend yet) ──
  displayName: string;
  playerTag: string;
  avatar: string;
  gold: number;
  diamonds: number;
  trophies: number;

  // ── toasts ──
  toasts: Toast[];
  showToast: (message: string) => void;
  dismissToast: (id: number) => void;
};

let toastId = 0;

export const useAppStore = create<AppStore>((set) => ({
  displayName: "DamaMaster",
  playerTag: "#0000",
  avatar: "champion",
  gold: 12480,
  diamonds: 320,
  trophies: 1250,

  toasts: [],
  showToast: (message) => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts, { id, message }] }));
    window.setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 2600);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
