import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth, type AdminRole } from "./lib/auth";
import { Login } from "./pages/Login";
import { PlayersPage } from "./pages/Players";
import { EconomyPage } from "./pages/Economy";
import { AuditPage } from "./pages/Audit";
import { Phase2 } from "./pages/Phase2";

/** Page eyebrow + title per route (matches the approved topbar). */
const TITLES: Record<string, { eyebrow: string; title: string }> = {
  "/players": { eyebrow: "Player Management", title: "Players" },
  "/economy": { eyebrow: "Economy", title: "Grants & Ledger" },
  "/audit": { eyebrow: "System", title: "Audit Log" },
};

/**
 * Admin shell — grouped sidebar (role-gated, hidden when can() fails) + routed
 * main. Phase-1 sections are wired to real endpoints; Phase-2 sections render a
 * visible "not yet wired" stub (never faked). Server enforces the real role gate.
 */

type NavItem = { to: string; label: string; min: AdminRole; phase2?: boolean };
type NavGroup = { title: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    title: "Operations",
    items: [
      { to: "/players", label: "Players", min: "SUPPORT" },
      { to: "/moderation", label: "Moderation", min: "MODERATOR", phase2: true },
    ],
  },
  {
    title: "Economy",
    items: [
      { to: "/economy", label: "Grants & Ledger", min: "ECONOMY" },
      { to: "/store", label: "Store Catalog", min: "ECONOMY", phase2: true },
      { to: "/liveops", label: "Seasons & Quests", min: "ECONOMY", phase2: true },
      { to: "/financials", label: "Financials", min: "ECONOMY", phase2: true },
    ],
  },
  {
    title: "Community",
    items: [
      { to: "/guilds", label: "Guilds", min: "MODERATOR", phase2: true },
      { to: "/matches", label: "Matches / Anti-cheat", min: "MODERATOR", phase2: true },
      { to: "/broadcast", label: "Broadcast", min: "SUPPORT", phase2: true },
    ],
  },
  {
    title: "System",
    items: [
      { to: "/admins", label: "Admin Users", min: "SUPERADMIN", phase2: true },
      { to: "/audit", label: "Audit Log", min: "SUPERADMIN" },
      { to: "/settings", label: "Config & Flags", min: "SUPERADMIN", phase2: true },
    ],
  },
];

export function App() {
  const auth = useAuth();
  const loc = useLocation();

  if (auth.status === "loading") return <Center>Loading console…</Center>;
  if (auth.status === "anon") return <Login />;
  if (auth.status === "forbidden")
    return (
      <Center>
        <div style={{ textAlign: "center", maxWidth: 380 }}>
          <div className="lm" style={{ margin: "0 auto 14px", width: 46, height: 46, borderRadius: 12, background: "rgba(194,73,90,.18)", border: "1px solid rgba(194,73,90,.4)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--red-lt)", fontSize: 22 }}>⛔</div>
          <h1 style={{ color: "var(--red-lt)", font: "800 22px var(--serif)" }}>Not authorized</h1>
          <p className="dim">This account doesn't have admin access.</p>
          <button className="btn" style={{ marginTop: 10 }} onClick={() => auth.logout()}>Sign out</button>
        </div>
      </Center>
    );

  const { me, can, logout } = auth;
  const initials = (me.displayName || me.username).slice(0, 2).toUpperCase();
  const head = TITLES[loc.pathname] ?? { eyebrow: "Admin", title: "Console" };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="mark">☀</span>
          <span className="name">DAMA ADMIN</span>
        </div>
        {NAV.map((g) => {
          const items = g.items.filter((i) => can(i.min));
          if (!items.length) return null;
          return (
            <div key={g.title}>
              <div className="navsec">{g.title}</div>
              {items.map((i) => (
                <NavLink key={i.to} to={i.to} className={({ isActive }) => `navitem${isActive ? " on" : ""}`}>
                  {i.label}
                  {i.phase2 && <span className="badge" style={{ background: "rgba(240,207,114,.15)", color: "var(--amber)", border: "1px solid rgba(240,207,114,.35)" }}>P2</span>}
                </NavLink>
              ))}
            </div>
          );
        })}
        <div className="foot">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--green)", boxShadow: "0 0 8px var(--green)" }} />
            All systems operational
          </div>
          <div style={{ marginTop: 5, fontFamily: "var(--mono)" }}>v1.0.0 · prod</div>
        </div>
      </aside>

      <div className="body">
        <header className="topbar">
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow">{head.eyebrow}</div>
            <div className="title">{head.title}</div>
          </div>
          <div style={{ flex: 1 }} />
          <div className="userchip">
            <div className="av">{initials}</div>
            <div>
              <div style={{ font: "700 12px var(--sans)", color: "var(--ink-2)", lineHeight: 1 }}>{me.displayName}</div>
              <div style={{ font: "600 10px var(--sans)", color: "var(--dim)", marginTop: 2 }}>{me.adminRole}</div>
            </div>
          </div>
          <button className="btn" onClick={() => logout()}>Sign out</button>
        </header>

        <main className="main">
          <Routes>
          <Route path="/" element={<Navigate to="/players" replace />} />
          <Route path="/players" element={<PlayersPage />} />
          <Route path="/economy" element={<EconomyPage />} />
          <Route path="/audit" element={<AuditPage />} />
          {/* Phase-2 stubs — real sections, not-yet-wired */}
          <Route path="/moderation" element={<Phase2 title="Moderation Queue" note="Reports intake + queue. Coming in Phase 1.5." />} />
          <Route path="/store" element={<Phase2 title="Store Catalog" note="Item CRUD over the existing StoreItem model." />} />
          <Route path="/liveops" element={<Phase2 title="Seasons & Quests" note="Live-ops authoring." />} />
          <Route path="/financials" element={<Phase2 title="Financials" note="Blocked — real-money top-up is disabled for legal compliance." />} />
          <Route path="/guilds" element={<Phase2 title="Guilds" note="Guild oversight (rename/disband)." />} />
          <Route path="/matches" element={<Phase2 title="Matches / Anti-cheat" note="Read-only match viewer + void (needs detection subsystem)." />} />
          <Route path="/broadcast" element={<Phase2 title="Broadcast" note="Segmented notifications + campaigns." />} />
          <Route path="/admins" element={<Phase2 title="Admin Users" note="Role management." />} />
          <Route path="/settings" element={<Phase2 title="Config & Flags" note="Runtime feature flags + economy constants (needs a config table)." />} />
          <Route path="*" element={<Navigate to="/players" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>{children}</div>;
}
