import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * cartStore — the Store's shopping cart, persisted to localStorage so it SURVIVES
 * a page refresh (previously the cart was plain React state and emptied on every
 * reload).
 *
 * We persist only the item IDs — never names/prices. StorePage re-hydrates each
 * line's display fields from the LIVE catalog (GET /api/store/items) on load, so
 * a price change or a removed/owned item can never leave a stale line in the
 * cart. Per-device (localStorage), matching the app's settings-store convention.
 */
export type CartStore = {
  /** ids of items currently in the cart (order preserved) */
  ids: string[];
  add: (id: string) => void;
  remove: (id: string) => void;
  /** replace the whole cart (used after checkout: keep only unpurchased lines) */
  setIds: (ids: string[]) => void;
  clear: () => void;
  has: (id: string) => boolean;
};

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      ids: [],
      add: (id) => set((s) => (s.ids.includes(id) ? s : { ids: [...s.ids, id] })),
      remove: (id) => set((s) => ({ ids: s.ids.filter((x) => x !== id) })),
      setIds: (ids) => set({ ids }),
      clear: () => set({ ids: [] }),
      has: (id) => get().ids.includes(id),
    }),
    { name: "fdr.cart" },
  ),
);
