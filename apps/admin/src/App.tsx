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
import { CommandPalette } from "./components/CommandPalette";
import { NotificationCenter } from "./components/NotificationCenter";

/**
 * Admin shell for the approved light workspace. Navigation, route access,
 * preview roles and account behavior remain backed by the existing app state.
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
const DESCRIPTIONS: Record<string, string> = {
  "/overview": "Live operational status across the FilipinoDama platform.",
  "/analytics": "Gameplay, audience, and economy performance over time.",
  "/players": "Find players, review activity, and take role-gated actions.",
  "/moderation": "Investigate player reports and resolve the moderation queue.",
  "/support": "Review player requests, reply, resolve, and reopen tickets.",
  "/matches": "Inspect flagged matches and engine-analysis signals.",
  "/economy": "Manage store items and player currency operations.",
  "/financials": "Review orders, receipts, revenue totals, and refunds.",
  "/fraud": "Payment risk tooling remains scheduled for Phase 2.",
  "/liveops": "Operate seasons, quests, ladder cycles, and scheduled events.",
  "/tournaments": "Manage tournament formats, brackets, and lifecycle states.",
  "/guilds": "Review guilds, applications, rosters, and community actions.",
  "/campaigns": "Compose, schedule, send, and review player campaigns.",
  "/settings": "Configure platform flags, constants, gateways, and packs.",
  "/admins": "Manage administrator access within existing role protections.",
  "/audit": "Review append-only operator activity and system changes.",
};

const ROLE_LABEL: Record<AdminRole, string> = { SUPPORT: "Support", MODERATOR: "Moderator", ECONOMY: "Economy admin", SUPERADMIN: "Superadmin" };
const RANK: Record<AdminRole, number> = { SUPPORT: 1, MODERATOR: 2, ECONOMY: 3, SUPERADMIN: 4 };

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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const initials = (me.displayName || me.username).slice(0, 2).toUpperCase();

  const closeMenu = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const manage = () => {
    closeMenu();
    if (realRole === "SUPERADMIN") {
      navigate("/admins");
      toast("ok", "Opened admin & role management.");
    } else {
      toast("err", "Account settings are managed by your Superadmin.");
    }
  };
  const activity = () => {
    closeMenu();
    // Prototype routes to Settings → Config with the same copy; production has
    // a real per-actor audit filter (actorId, SUPERADMIN-only endpoint), so
    // route there instead — an improvement over the mockup's generic settings
    // tab, per the delta plan. Non-SUPERADMIN admins land on /audit too but
    // the server 403s the fetch; the page's existing empty/error state covers it.
    navigate(`/audit?actor=${encodeURIComponent(me.id)}`);
    toast("ok", "Your actions appear in the audit log.");
  };
  const signOut = () => {
    closeMenu();
    onSignedOut();
    // logout() ends the real session server-side (writes the session.signout
    // audit row there — see auth/routes.ts) and flips auth to "anon"; the
    // sign-out screen is rendered as an overlay ON TOP of the (about to
    // unmount) shell so it's visible during that transition.
    void auth.logout();
  };

  return (
    <div className="acct-wrap">
      <button ref={triggerRef} className="abtn acct-chip" aria-haspopup="dialog" aria-expanded={open} aria-controls="admin-account-dialog" onClick={() => open ? closeMenu(true) : setOpen(true)}>
        <div className="userchip av" style={{ width: 30, height: 30 }}>{initials}</div>
        <div className="fd-hide-sm" style={{ textAlign: "left" }}>
          <div style={{ font: "700 12px var(--sans)", color: "var(--ink-2)", lineHeight: 1 }}>{me.displayName}</div>
          <div style={{ font: "600 10px var(--sans)", color: "var(--dim)", marginTop: 2 }}>{ROLE_LABEL[realRole]}</div>
        </div>
        <span className="acct-caret">▾</span>
      </button>
      {open && (
        <>
          <button aria-label="Close account menu" className="acct-menu-backdrop" onClick={() => closeMenu(true)} />
          <div ref={dialogRef} id="admin-account-dialog" className="acct-menu" role="dialog" aria-modal="false" aria-label="Account actions">
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
  // Live sidebar badge counts (open reports/tickets awaiting an admin) — fetched
  // on mount and refreshed every 45s so the red count-bubbles stay current like a
  // notification bell. A failed fetch keeps the last-known counts (never crashes
  // the nav); Map: /moderation → openReports, /support → openTickets.
  const [counts, setCounts] = useState<{ openReports: number; openTickets: number }>({ openReports: 0, openTickets: 0 });

  const signedIn = auth.status === "ok";
  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    const load = () =>
      api
        .get<{ openReports: number; openTickets: number }>("/api/admin/counts")
        .then((d) => { if (alive) setCounts(d); })
        .catch(() => {});
    load();
    const t = setInterval(load, 45_000);
    return () => { alive = false; clearInterval(t); };
  }, [signedIn]);

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
        {/* Approved light-workspace lockup: the brand stays restrained inside the plum rail. */}
        <div className="brand">
          <div className="brandtext">
            <span className="name">FILIPINODAMA</span>
            <span className="sub">Administration</span>
          </div>
        </div>
        <div className="navwrap">
          {grouped.map(({ g, items }) => (
            <div key={g}>
              <div className="navsec">{g}</div>
              {items.map(([to, label, dot, , , phase2]) => {
                // Live actionable count for this item (only Moderation/Support have one).
                const count = to === "/moderation" ? counts.openReports : to === "/support" ? counts.openTickets : 0;
                return (
                  <NavLink key={to} to={to} className={({ isActive }) => `navitem${isActive ? " on" : ""}`}>
                    {({ isActive }) => (
                      <>
                        <span className="ndot" style={{ background: dot, boxShadow: isActive ? `0 0 8px ${dot}` : "none" }} />
                        <span className="lbl">{label}</span>
                        {/* A real count takes precedence; otherwise the Phase-2 stub badge. */}
                        {count > 0 ? (
                          <span className="count">{count}</span>
                        ) : (
                          phase2 && <span className="badge" style={{ background: "rgba(240,207,114,.15)", color: "var(--amber)", border: "1px solid rgba(240,207,114,.35)" }}>P2</span>
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </div>
        <div className="foot">
          <div className="sidebar-account">{(me.displayName || me.username).slice(0, 2).toUpperCase()} &nbsp; {me.displayName || me.username} · {ROLE_LABEL[realRole]}</div>
          <div className="sidebar-account-sub">Account menu / sign out</div>
        </div>
      </aside>

      <div className="body">
        {/* Full-width sticky bar; inner content constrained to 1240px so the title/controls
            line up with the .main content column below (same max-width + centering). */}
        <header className="topbar">
          <div className="topbar-inner">
            <CommandPalette effectiveRole={effRole} />
            <div style={{ flex: 1 }} />
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
            <span className="environment-badge">{import.meta.env.PROD ? "PRODUCTION" : "LOCAL"}</span>
            <NotificationCenter />
            {/* Account chip → dropdown menu + real sign-out — handoffv3 row 17. */}
            <AccountMenu
              me={me}
              realRole={realRole}
              onSignedOut={() => setSignOutInfo({ me, time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }) })}
            />
          </div>
        </header>

        <main className="main" key={loc.pathname} aria-labelledby="admin-page-title">
          <header className="route-heading">
            <div className="route-eyebrow">{eyebrow}</div>
            <h1 id="admin-page-title">{title}</h1>
            <p>{DESCRIPTIONS[loc.pathname]}</p>
          </header>
          <div className="route-body">
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
          </div>
        </main>
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>{children}</div>;
}
