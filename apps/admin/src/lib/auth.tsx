import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "./api";

/**
 * Admin identity + client-side RBAC. On boot we call GET /api/admin/me; a
 * non-admin session throws 403 → we render the "not authorized" screen. The role
 * hierarchy mirrors the server (guards.ts) — but this is UX-only gating (hide /
 * disable). The server enforces the real gate on every route.
 */

export type AdminRole = "SUPPORT" | "MODERATOR" | "ECONOMY" | "SUPERADMIN";
const RANK: Record<AdminRole, number> = { SUPPORT: 1, MODERATOR: 2, ECONOMY: 3, SUPERADMIN: 4 };

export type AdminMe = { id: string; username: string; displayName: string; tag: string; adminRole: AdminRole; avatarUrl: string | null };

type AuthState =
  | { status: "loading" }
  | { status: "ok"; me: AdminMe }
  | { status: "forbidden" } // logged in but not an admin
  | { status: "anon" }; // not logged in

type Ctx = AuthState & {
  can: (min: AdminRole) => boolean;
  /** Sign in with email+password (shared session cookie), then re-check admin. */
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthCtx = createContext<Ctx>({ status: "loading", can: () => false, login: async () => {}, logout: async () => {}, refresh: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  const check = async () => {
    try {
      const me = await api.get<AdminMe>("/api/admin/me");
      setState({ status: "ok", me });
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setState({ status: "forbidden" });
      else setState({ status: "anon" });
    }
  };

  useEffect(() => {
    void check();
  }, []);

  const login = async (email: string, password: string) => {
    // The player auth endpoint issues the shared .filipinodama.com cookie; then
    // /admin/me tells us whether this account has admin access.
    await api.post("/api/auth/login", { email, password });
    await check();
  };
  const logout = async () => {
    try {
      await api.post("/api/auth/logout");
    } catch {
      /* ignore */
    }
    setState({ status: "anon" });
  };

  const role = state.status === "ok" ? state.me.adminRole : null;
  const can = (min: AdminRole) => !!role && RANK[role] >= RANK[min];

  return <AuthCtx.Provider value={{ ...state, can, login, logout, refresh: check }}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}
