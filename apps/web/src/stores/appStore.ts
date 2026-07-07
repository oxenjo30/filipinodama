import { create } from "zustand";

/**
 * appStore — light-weight global UI state that isn't part of a match. Currently
 * just the toast queue. Real user identity + currency balances live in authStore
 * (useAuthStore().me), sourced from the server — they are NEVER duplicated here
 * with placeholder values (a previous placeholder set leaked fake
 * "DamaMaster / 12,480 gold" into the UI when logged out).
 */

export type Toast = { id: number; message: string };

export type AppStore = {
  toasts: Toast[];
  showToast: (message: string) => void;
  dismissToast: (id: number) => void;
};

let toastId = 0;

export const useAppStore = create<AppStore>((set) => ({
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
