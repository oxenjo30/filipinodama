import { create } from "zustand";
import { api, ApiError, type Me } from "../lib/api";
import type { AccountState } from "../features/settings/AccountSecuritySection";

/**
 * authStore — the logged-in user (from /api/auth/me) + auth actions. The whole
 * app reads `me` from here; nav/profile/currency reflect the real account. On
 * boot, bootstrap() hydrates from the session cookie (or leaves me=null).
 */

type Providers = { email: boolean; guest: boolean; google: boolean; facebook: boolean; emailDelivery: boolean; diamondTopUp: boolean };

export type AuthStore = {
  me: Me | null;
  /** Server-derived account/security state (see AccountSecuritySection). */
  account: AccountState | null;
  loading: boolean;
  ready: boolean; // bootstrap finished
  providers: Providers;
  // Transient: true only in the session tick right after a successful register().
  // The onboarding tour reads this once to know "this account just signed up",
  // then clears it. Never persisted — a page reload leaves it false.
  justRegistered: boolean;

  bootstrap: () => Promise<void>;
  refreshProviders: () => Promise<void>;
  register: (input: { email: string; password: string; username: string }) => Promise<{ needsVerification: boolean; emailConfigured: boolean }>;
  login: (input: { email: string; password: string }) => Promise<void>;
  guest: () => Promise<void>;
  logout: () => Promise<void>;
  setMe: (me: Me | null) => void;
  patchMe: (patch: Partial<Me>) => void;
  clearJustRegistered: () => void;
};

export const useAuthStore = create<AuthStore>((set, get) => ({
  me: null,
  account: null,
  loading: false,
  ready: false,
  providers: { email: true, guest: true, google: false, facebook: false, emailDelivery: false, diamondTopUp: false },
  justRegistered: false,

  bootstrap: async () => {
    try {
      const { user, account } = await api.get<{ user: Me; account: AccountState | null }>("/api/auth/me");
      set({ me: user, account: account ?? null });
    } catch {
      set({ me: null, account: null });
    } finally {
      set({ ready: true });
    }
    get().refreshProviders();
  },

  refreshProviders: async () => {
    try {
      const p = await api.get<Providers>("/api/auth/providers");
      set({ providers: p });
    } catch {
      /* keep defaults */
    }
  },

  register: async (input) => {
    set({ loading: true });
    try {
      const res = await api.post<{ user: Me; needsVerification: boolean; emailConfigured: boolean }>("/api/auth/register", input);
      set({ me: res.user, justRegistered: true });
      return { needsVerification: res.needsVerification, emailConfigured: res.emailConfigured };
    } finally {
      set({ loading: false });
    }
  },

  login: async (input) => {
    set({ loading: true });
    try {
      const { user } = await api.post<{ user: Me }>("/api/auth/login", input);
      set({ me: user });
    } finally {
      set({ loading: false });
    }
  },

  guest: async () => {
    set({ loading: true });
    try {
      const { user } = await api.post<{ user: Me }>("/api/auth/guest");
      set({ me: user });
    } finally {
      set({ loading: false });
    }
  },

  logout: async () => {
    try {
      await api.post("/api/auth/logout");
    } catch {
      /* ignore */
    }
    set({ me: null });
  },

  setMe: (me) => set({ me }),
  patchMe: (patch) => set((s) => (s.me ? { me: { ...s.me, ...patch } } : s)),
  clearJustRegistered: () => set({ justRegistered: false }),
}));

export { ApiError };
