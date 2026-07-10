import { useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth, type AdminRole } from "./lib/auth";
import { Login } from "./pages/Login";
import { Overview } from "./pages/Overview";
import { Analytics } from "./pages/Analytics";
import { PlayersPage } from "./pages/Players";
import { Moderation } from "./pages/Moderation";
import { Support } from "./pages/Support";
import { EconomyPage } from "./pages/Economy";
import { LiveOpsPage } from "./pages/LiveOps";
import { TournamentsPage } from "./pages/Tournaments";
import { GuildsPage } from "./pages/Guilds";
import { MatchesPage } from "./pages/Matches";
import { AuditPage } from "./pages/Audit";
import { Phase2 } from "./pages/Phase2";
import { Admins } from "./pages/Admins";
import { Settings } from "./pages/Settings";
import { Campaigns } from "./pages/Campaigns";

/**
 * Admin shell — reproduces the approved FilipinoDama Admin.dc.html layout: the
 * grouped sidebar with per-item dot colors + live count badges, the sticky topbar
 * with eyebrow + Cinzel title + "Viewing as" role preview + user chip.
 *
 * navDefs / secTitles / role order are copied verbatim from the prototype so the
 * structure matches 1:1. Sections with no live wiring yet show a Phase-2 stub.
 */

// [route, label, dot color, group, min-role, phase2?]
type Nav = [string, string, string, string, AdminRole, boolean?];
const NAV: Nav[] = [
  ["/overview", "Overview", "#E8B84B", "Monitor", "SUPPORT"],
  ["/analytics", "Analytics", "#5fd0e0", "Monitor", "ECONOMY"],
  ["/players", "Players", "#7fb0ff", "Players & safety", "SUPPORT"],
  ["/moderation", "Moderation", "#c2495a", "Players & safety", "MODERATOR"],
  ["/support", "Support", "#5fd08a", "Players & safety", "SUPPORT"],
  ["/matches", "Anti-cheat", "#d98a3a", "Players & safety", "MODERATOR"],
  ["/economy", "Store & economy", "#f0cf72", "Economy", "ECONOMY"],
  ["/financials", "Financials", "#4bd6a0", "Economy", "ECONOMY", true],
  ["/fraud", "Fraud & AML", "#ff7a7a", "Economy", "ECONOMY", true],
  ["/liveops", "Live ops", "#4fd0c0", "Engagement", "ECONOMY"],
  ["/tournaments", "Tournaments", "#e0a24a", "Engagement", "ECONOMY"],
  ["/guilds", "Guilds", "#e39aa8", "Engagement", "MODERATOR"],
  ["/campaigns", "Campaigns", "#ff9ec4", "Engagement", "ECONOMY"],
  ["/settings", "Settings", "#b98cff", "System & access", "SUPERADMIN"],
  ["/admins", "Admins", "#7fe0c0", "System & access", "SUPERADMIN"],
  ["/audit", "Audit log", "#8b78ad", "System & access", "SUPERADMIN"],
];
const GROUPS = ["Monitor", "Players & safety", "Economy", "Engagement", "System & access"];

// eyebrow + title per route (from the prototype's secTitles)
const TITLES: Record<string, [string, string]> = {
  "/overview": ["Operations", "Overview"],
  "/analytics": ["Insights", "Analytics deep-dive"],
  "/players": ["Player Management", "Players"],
  "/moderation": ["Trust & Safety", "Moderation queue"],
  "/support": ["Player Support", "Support tickets"],
  "/matches": ["Integrity", "Matches & anti-cheat"],
  "/economy": ["Economy", "Store & currency"],
  "/financials": ["Revenue & Payments", "Financials"],
  "/fraud": ["Risk", "Fraud & AML monitoring"],
  "/liveops": ["Live Ops", "Seasons, quests & events"],
  "/tournaments": ["Live Ops", "Tournaments"],
  "/guilds": ["Community", "Guilds"],
  "/campaigns": ["Growth", "Campaign composer"],
  "/settings": ["Platform", "Settings"],
  "/admins": ["Access Control", "Admin users"],
  "/audit": ["Governance", "Audit log"],
};

const ROLE_LABEL: Record<AdminRole, string> = { SUPPORT: "Support", MODERATOR: "Moderator", ECONOMY: "Economy admin", SUPERADMIN: "Superadmin" };
const RANK: Record<AdminRole, number> = { SUPPORT: 1, MODERATOR: 2, ECONOMY: 3, SUPERADMIN: 4 };

export function App() {
  const auth = useAuth();
  const loc = useLocation();
  // "Viewing as" preview role — a SUPERADMIN can preview lower-role views. This
  // only affects what the CLIENT shows; the server still enforces the real gate.
  const [viewAs, setViewAs] = useState<AdminRole | null>(null);

  if (auth.status === "loading") return <Center>Loading console…</Center>;
  if (auth.status === "anon") return <Login />;
  if (auth.status === "forbidden")
    return (
      <Center>
        <div style={{ textAlign: "center", maxWidth: 380 }}>
          <div style={{ margin: "0 auto 14px", width: 46, height: 46, borderRadius: 12, background: "rgba(194,73,90,.18)", border: "1px solid rgba(194,73,90,.4)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--red-lt)", fontSize: 22 }}>⛔</div>
          <h1 style={{ color: "var(--red-lt)", font: "800 22px var(--serif)" }}>Not authorized</h1>
          <p className="dim">This account doesn't have admin access.</p>
          <button className="btn" style={{ marginTop: 10 }} onClick={() => auth.logout()}>Sign out</button>
        </div>
      </Center>
    );

  const { me, logout } = auth;
  const realRole = me.adminRole;
  const effRole = viewAs ?? realRole; // the role used for client gating
  const can = (min: AdminRole) => RANK[effRole] >= RANK[min];
  const initials = (me.displayName || me.username).slice(0, 2).toUpperCase();
  const [eyebrow, title] = TITLES[loc.pathname] ?? ["Admin", "Console"];

  const grouped = GROUPS.map((g) => ({ g, items: NAV.filter((n) => n[3] === g && can(n[4])) })).filter((x) => x.items.length);

  return (
    <div className="app">
      <aside className="sidebar">
        {/* Logo lockup — exact mockup: gold-gradient "D" tile + FilipinoDama / ADMIN CONSOLE */}
        <div className="brand">
          <span className="mark">D</span>
          <div className="brandtext">
            <span className="name">FilipinoDama</span>
            <span className="sub">ADMIN CONSOLE</span>
          </div>
        </div>
        <div className="navwrap">
          {grouped.map(({ g, items }) => (
            <div key={g}>
              <div className="navsec">{g}</div>
              {items.map(([to, label, dot, , , phase2]) => (
                <NavLink key={to} to={to} className={({ isActive }) => `navitem${isActive ? " on" : ""}`}>
                  {({ isActive }) => (
                    <>
                      <span className="ndot" style={{ background: dot, boxShadow: isActive ? `0 0 8px ${dot}` : "none" }} />
                      <span className="lbl">{label}</span>
                      {phase2 && <span className="badge" style={{ background: "rgba(240,207,114,.15)", color: "var(--amber)", border: "1px solid rgba(240,207,114,.35)" }}>P2</span>}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </div>
        <div className="foot">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--green)", boxShadow: "0 0 8px var(--green)" }} />
            All systems operational
          </div>
          <div style={{ marginTop: 5, fontFamily: "var(--mono)" }}>v1.0.0 · prod</div>
        </div>
      </aside>

      <div className="body">
        {/* Full-width sticky bar; inner content constrained to 1240px so the title/controls
            line up with the .main content column below (same max-width + centering). */}
        <header className="topbar">
          <div className="topbar-inner">
            <div style={{ minWidth: 0 }}>
              <div className="eyebrow">{eyebrow}</div>
              <div className="title">{title}</div>
            </div>
            <div style={{ flex: 1 }} />
            {/* Viewing-as — SUPERADMIN can preview lower-role views (client-only). */}
            {realRole === "SUPERADMIN" && (
              <div className="viewingas">
                <span>VIEWING AS</span>
                <select className="select" style={{ width: "auto", padding: "7px 10px", color: "var(--gold-lt)", font: "700 11px var(--sans)" }}
                  value={effRole} onChange={(e) => setViewAs(e.target.value === realRole ? null : (e.target.value as AdminRole))}>
                  <option value="SUPPORT">Support</option>
                  <option value="MODERATOR">Moderator</option>
                  <option value="ECONOMY">Economy admin</option>
                  <option value="SUPERADMIN">Superadmin</option>
                </select>
              </div>
            )}
            <div className="userchip">
              <div className="av">{initials}</div>
              <div>
                <div style={{ font: "700 12px var(--sans)", color: "var(--ink-2)", lineHeight: 1 }}>{me.displayName}</div>
                <div style={{ font: "600 10px var(--sans)", color: "var(--dim)", marginTop: 2 }}>{ROLE_LABEL[realRole]}</div>
              </div>
            </div>
            <button className="btn" onClick={() => logout()}>Sign out</button>
          </div>
        </header>

        <main className="main">
          <Routes>
            <Route path="/" element={<Navigate to="/overview" replace />} />
            <Route path="/overview" element={<Overview />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/players" element={<PlayersPage />} />
            <Route path="/moderation" element={<Moderation />} />
            <Route path="/support" element={<Support />} />
            <Route path="/matches" element={<MatchesPage />} />
            <Route path="/economy" element={<EconomyPage />} />
            {/* Store catalog merged into the single "Store & economy" page (mockup secEconomy is one section). Old link redirects. */}
            <Route path="/store" element={<Navigate to="/economy" replace />} />
            <Route path="/liveops" element={<LiveOpsPage />} />
            <Route path="/tournaments" element={<TournamentsPage />} />
            <Route path="/guilds" element={<GuildsPage />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/admins" element={<Admins />} />
            {/* Phase-2 stubs */}
            <Route path="/financials" element={<Phase2 title="Financials" note="Blocked — real-money top-up is disabled for legal compliance." />} />
            <Route path="/fraud" element={<Phase2 title="Fraud & AML" note="Payment-driven risk engine (blocked on payments)." />} />
            <Route path="*" element={<Navigate to="/overview" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>{children}</div>;
}
