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

type Ctx = AuthState & { can: (min: AdminRole) => boolean };

const AuthCtx = createContext<Ctx>({ status: "loading", can: () => false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const me = await api.get<AdminMe>("/api/admin/me");
        if (alive) setState({ status: "ok", me });
      } catch (e) {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 403) setState({ status: "forbidden" });
        else setState({ status: "anon" });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const role = state.status === "ok" ? state.me.adminRole : null;
  const can = (min: AdminRole) => !!role && RANK[role] >= RANK[min];

  return <AuthCtx.Provider value={{ ...state, can }}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}
