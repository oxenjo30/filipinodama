import { useEffect, useRef, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useAuth, type AdminRole } from "./lib/auth";
import { api } from "./lib/api";
import { useToast } from "./lib/ui";
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
import { Financials } from "./pages/Financials";

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
  ["/financials", "Financials", "#4bd6a0", "Economy", "ECONOMY"],
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

// ── Header global search (handoffv3 row 16) ─────────────────────────────────
type SearchPlayer = { id: string; displayName: string; tag: string; trophies: number; rankTier: string };
type SearchGuild = { id: string; name: string; tag: string; members: number };
type SearchCup = { id: string; name: string; format: string; status: string };
type SearchResults = { players: SearchPlayer[]; guilds: SearchGuild[]; cups: SearchCup[] };

/**
 * Deep-link convention for search results: navigate to the section route with
 * `?open=<id>` — Players/Guilds/Tournaments all already have a per-record
 * detail view (drawer) keyed by id, so each page reads `?open=` once on mount
 * and opens that same drawer, then strips the param from the URL.
 */
function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults(null);
      return;
    }
    const t = setTimeout(() => {
      api
        .get<SearchResults>(`/api/admin/search?q=${encodeURIComponent(query)}`)
        .then(setResults)
        .catch(() => setResults({ players: [], guilds: [], cups: [] }));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const go = (path: string) => {
    setOpen(false);
    setQ("");
    setResults(null);
    navigate(path);
  };

  const hasQuery = q.trim().length > 0;
  const hasResults = !!results && (results.players.length > 0 || results.guilds.length > 0 || results.cups.length > 0);

  return (
    <div className="gs-wrap fd-hide-sm" ref={wrapRef}>
      <input
        className="input gs-input"
        placeholder="Search players, guilds, cups…"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && hasQuery && (
        <div className="gs-dropdown">
          {hasResults ? (
            <>
              {results!.players.map((p) => (
                <button key={`p-${p.id}`} className="gs-row abtn" onClick={() => go(`/players?open=${p.id}`)}>
                  <span className="gs-row-badge" style={{ background: "#4a2d7a" }}>{(p.displayName || "?").slice(0, 2).toUpperCase()}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="gs-row-label">{p.displayName} {p.tag}</span>
                    <span className="gs-row-sub">{p.rankTier} · {p.trophies.toLocaleString()} trophies</span>
                  </span>
                  <span className="gs-row-kind">Player</span>
                </button>
              ))}
              {results!.guilds.map((g) => (
                <button key={`g-${g.id}`} className="gs-row abtn" onClick={() => go(`/guilds?open=${g.id}`)}>
                  <span className="gs-row-badge" style={{ background: "#2f6f5b" }}>G</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="gs-row-label">{g.name}</span>
                    <span className="gs-row-sub">[{g.tag}]</span>
                  </span>
                  <span className="gs-row-kind">Guild</span>
                </button>
              ))}
              {results!.cups.map((t) => (
                <button key={`t-${t.id}`} className="gs-row abtn" onClick={() => go(`/tournaments?open=${t.id}`)}>
                  <span className="gs-row-badge" style={{ background: "#7a4bbf" }}>T</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="gs-row-label">{t.name}</span>
                    <span className="gs-row-sub">{t.format}</span>
                  </span>
                  <span className="gs-row-kind">Cup</span>
                </button>
              ))}
            </>
          ) : (
            <div className="gs-empty">No matches</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Account chip → dropdown menu + sign-out interstitial (handoffv3 rows 17-18) ──
function AccountMenu({
  me, realRole, onSignedOut,
}: {
  me: { id: string; displayName: string; email: string | null; username: string };
  realRole: AdminRole;
  onSignedOut: () => void;
}) {
  const navigate = useNavigate();
  const auth = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const initials = (me.displayName || me.username).slice(0, 2).toUpperCase();

  const manage = () => {
    setOpen(false);
    if (realRole === "SUPERADMIN") {
      navigate("/admins");
      toast("ok", "Opened admin & role management.");
    } else {
      toast("err", "Account settings are managed by your Superadmin.");
    }
  };
  const activity = () => {
    setOpen(false);
    // Prototype routes to Settings → Config with the same copy; production has
    // a real per-actor audit filter (actorId, SUPERADMIN-only endpoint), so
    // route there instead — an improvement over the mockup's generic settings
    // tab, per the delta plan. Non-SUPERADMIN admins land on /audit too but
    // the server 403s the fetch; the page's existing empty/error state covers it.
    navigate(`/audit?actor=${encodeURIComponent(me.id)}`);
    toast("ok", "Your actions appear in the audit log.");
  };
  const signOut = () => {
    setOpen(false);
    onSignedOut();
    // logout() ends the real session server-side (writes the session.signout
    // audit row there — see auth/routes.ts) and flips auth to "anon"; the
    // sign-out screen is rendered as an overlay ON TOP of the (about to
    // unmount) shell so it's visible during that transition.
    void auth.logout();
  };

  return (
    <div className="acct-wrap">
      <button className="abtn acct-chip" onClick={() => setOpen((o) => !o)}>
        <div className="userchip av" style={{ width: 30, height: 30 }}>{initials}</div>
        <div className="fd-hide-sm" style={{ textAlign: "left" }}>
          <div style={{ font: "700 12px var(--sans)", color: "var(--ink-2)", lineHeight: 1 }}>{me.displayName}</div>
          <div style={{ font: "600 10px var(--sans)", color: "var(--dim)", marginTop: 2 }}>{ROLE_LABEL[realRole]}</div>
        </div>
        <span className="acct-caret">▾</span>
      </button>
      {open && (
        <>
          <button aria-label="Close menu" className="acct-menu-backdrop" onClick={() => setOpen(false)} />
          <div className="acct-menu">
            <div className="acct-menu-head">
              <div className="acct-menu-name">{me.displayName}</div>
              <div className="acct-menu-email">{me.email ?? me.username}</div>
              <div className="acct-menu-role">{ROLE_LABEL[realRole]}</div>
            </div>
            <div className="acct-menu-items">
              <button className="acct-menu-item" onClick={manage}>⚙ Manage account</button>
              <button className="acct-menu-item" onClick={activity}>🕑 My activity log</button>
              <button className="acct-menu-item danger" onClick={signOut}>⎋ Sign out</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Full-screen sign-out interstitial (handoffv3 row 18), 1:1 with the mockup.
 * Adaptation note: the prototype shows this as an in-app `signedOut` state
 * with "Sign back in"/"Switch account" both re-entering the SAME session
 * (`signBackIn()` just flips state back). The real app can't do that — logout()
 * clears the session cookie server-side, so both buttons route to the real
 * admin login screen instead (there is no "switch account" concept without a
 * second stored session, so both buttons share the same honest behavior).
 */
function SignOutScreen({ me, signOutTime }: { me: { displayName: string; email: string | null; username: string }; signOutTime: string }) {
  const initials = (me.displayName || me.username).slice(0, 2).toUpperCase();
  const goToLogin = () => {
    // auth.logout() already flipped state to "anon"; a reload is the simplest
    // reliable way back to a clean Login screen from this overlay.
    window.location.assign("/");
  };
  return (
    <div className="signout-screen">
      <div className="signout-card">
        <div className="signout-mark">D</div>
        <div className="signout-name">FilipinoDama</div>
        <div className="signout-sub">ADMIN CONSOLE</div>

        <div className="signout-check">✓</div>
        <div className="signout-title">You've been signed out</div>
        <div className="signout-body">Your session on this device has ended. Your work is saved and every action stays in the audit log.</div>

        <div className="signout-pill">
          <div className="signout-pill-av">{initials}</div>
          <div>
            <div className="signout-pill-name">{me.displayName}</div>
            <div className="signout-pill-email">{me.email ?? me.username}</div>
          </div>
        </div>

        <button className="abtn" style={{ display: "block", width: "100%", marginTop: 26, padding: 14, borderRadius: 11, border: "1px solid rgba(217,145,31,.5)", color: "#3a2405", background: "linear-gradient(150deg,#f5d783,#c99a2e)", font: "800 13px var(--sans)", letterSpacing: ".4px", cursor: "pointer" }} onClick={goToLogin}>Sign back in</button>
        <button className="abtn" style={{ display: "block", width: "100%", marginTop: 10, padding: 13, borderRadius: 11, border: "1px solid rgba(232,184,75,.16)", color: "#c9b8e8", background: "transparent", font: "700 12px var(--sans)", cursor: "pointer" }} onClick={goToLogin}>Switch account</button>

        <div className="signout-footer">Session ended · {signOutTime}</div>
      </div>
    </div>
  );
}

export function App() {
  const auth = useAuth();
  const loc = useLocation();
  // "Viewing as" preview role — a SUPERADMIN can preview lower-role views. This
  // only affects what the CLIENT shows; the server still enforces the real gate.
  const [viewAs, setViewAs] = useState<AdminRole | null>(null);
  // Sign-out interstitial (handoffv3 row 18) — set just before logout() clears
  // the session, so the overlay renders while auth flips from "ok" to "anon"
  // (see AccountMenu.signOut). Captured here (not in AccountMenu) so it can
  // render ON TOP of the whole shell, matching the mockup's full-screen overlay.
  const [signOutInfo, setSignOutInfo] = useState<{ me: { displayName: string; email: string | null; username: string }; time: string } | null>(null);

  if (auth.status === "loading") return <Center>Loading console…</Center>;
  if (signOutInfo) return <SignOutScreen me={signOutInfo.me} signOutTime={signOutInfo.time} />;
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

  const { me } = auth;
  const realRole = me.adminRole;
  const effRole = viewAs ?? realRole; // the role used for client gating
  const can = (min: AdminRole) => RANK[effRole] >= RANK[min];
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
            {/* Global search — handoffv3 row 16 (players/guilds/cups, ≤6/4/4). */}
            <GlobalSearch />
            {/* Viewing-as — SUPERADMIN can preview lower-role views (client-only). */}
            {realRole === "SUPERADMIN" && (
              <div className="viewingas fd-hide-sm">
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
            {/* Account chip → dropdown menu + real sign-out — handoffv3 row 17. */}
            <AccountMenu
              me={me}
              realRole={realRole}
              onSignedOut={() => setSignOutInfo({ me, time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }) })}
            />
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
            <Route path="/financials" element={<Financials />} />
            {/* Phase-2 stub */}
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
