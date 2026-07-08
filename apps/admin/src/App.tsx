import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useAuth, type AdminRole } from "./lib/auth";
import { PlayersPage } from "./pages/Players";
import { EconomyPage } from "./pages/Economy";
import { AuditPage } from "./pages/Audit";
import { Phase2 } from "./pages/Phase2";

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

  if (auth.status === "loading") return <Center>Loading console…</Center>;
  if (auth.status === "anon")
    return (
      <Center>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ color: "var(--gold)" }}>Admin Console</h1>
          <p className="dim">You need to sign in on the main site first, then return here.</p>
          <a className="btn gold" href="https://filipinodama.com/login" style={{ display: "inline-block", marginTop: 8 }}>Go to sign in</a>
        </div>
      </Center>
    );
  if (auth.status === "forbidden")
    return (
      <Center>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ color: "var(--red)" }}>Not authorized</h1>
          <p className="dim">Your account doesn't have admin access.</p>
        </div>
      </Center>
    );

  const { me, can } = auth;
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">☀ DAMA ADMIN</div>
        {NAV.map((g) => {
          const items = g.items.filter((i) => can(i.min));
          if (!items.length) return null;
          return (
            <div key={g.title}>
              <div className="navsec">{g.title}</div>
              {items.map((i) => (
                <NavLink key={i.to} to={i.to} className={({ isActive }) => `navitem${isActive ? " on" : ""}`}>
                  {i.label}
                  {i.phase2 && <span className="badge" style={{ background: "var(--amber)", color: "#2a1607" }}>P2</span>}
                </NavLink>
              ))}
            </div>
          );
        })}
        <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid var(--edge)", fontSize: 12 }}>
          <div style={{ fontWeight: 700 }}>{me.displayName}</div>
          <div className="dim mono">{me.tag} · {me.adminRole}</div>
        </div>
      </aside>
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
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>{children}</div>;
}
