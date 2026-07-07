import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { rankTierFor } from "@dama/shared";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";
import { usePresenceStore } from "../../stores/presenceStore";
import { useDmStore } from "../../stores/dmStore";
import { ICONS, BRAND, avatar as avatarUrl } from "../../lib/assets";
import { Toasts } from "../shared/Toasts";
import { TopUpModal } from "../store/TopUpModal";
import { NotificationsMenu } from "../nav/NotificationsMenu";
import { Footer } from "./Footer";

/**
 * AppLayout — the top nav + mobile nav + fixed background, reproduced VERBATIM
 * from the prototype (handoff/FilipinoDama Royal.dc.html header, lines 74-181).
 * Routed screens render into <Outlet/>. Bindings resolve to the real appStore.
 */

const NAV: { label: string; to: string; mobileLabel?: string }[] = [
  { label: "Home", to: "/" },
  { label: "Play", to: "/play" },
  { label: "Quests", to: "/quests" },
  { label: "Leaderboard", to: "/leaderboard", mobileLabel: "Ranks" },
  { label: "Learn", to: "/learn" },
  { label: "Store", to: "/store" },
  { label: "Blog", to: "/blog" },
];

function Icon({ src, alt, size = 18 }: { src: string; alt: string; size?: number }) {
  return <img src={src} alt={alt} width={size} height={size} style={{ objectFit: "contain", flex: "none" }} />;
}

export function AppLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // The nav ALWAYS reflects the real logged-in user. When logged out we show a
  // neutral "Guest / Sign in" state with zeroed values — never a fake identity
  // or fake balances (no placeholder DamaMaster / Bayani / 12,480 gold).
  const me = useAuthStore((s) => s.me);
  const logout = useAuthStore((s) => s.logout);
  const showToast = useAppStore((s) => s.showToast);
  const startPresence = usePresenceStore((s) => s.start);
  const stopPresence = usePresenceStore((s) => s.stop);
  const dmUnread = useDmStore((s) => s.unread);
  const refreshDmUnread = useDmStore((s) => s.unreadTotal);
  const [acctOpen, setAcctOpen] = useState(false);

  // Start live presence once signed in (guests included) so friends' online
  // dots + presence-driven UI work app-wide; tear down on sign-out.
  useEffect(() => {
    if (me) void startPresence();
    else stopPresence();
  }, [me, startPresence, stopPresence]);

  // Keep the DM unread badge fresh: fetch on sign-in, and refresh on route
  // changes (cheap) so it reflects reads/new messages without extra plumbing.
  useEffect(() => {
    if (me && !me.isGuest) void refreshDmUnread();
  }, [me, pathname, refreshDmUnread]);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifUnread, setNotifUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false); // mobile hamburger drawer

  // Close the mobile drawer on any route change (tapping a link navigates → close).
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // While the drawer is open: lock body scroll + close on Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const registered = !!me && !me.isGuest; // a real (non-guest) account
  const displayName = me?.displayName ?? "Guest";
  const playerTag = me?.tag ?? "";
  const gold = me?.gold ?? 0;
  const diamonds = me?.diamonds ?? 0;
  const trophies = me?.trophies ?? 0;
  const avatarSrc = me?.avatarUrl ?? "champion";

  const tier = rankTierFor(trophies);
  const isOn = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  // Unread direct-messages total — LIVE from the DM store (GET /api/dm/unread-total,
  // refreshed on sign-in + route change). Lights up the nav avatar badge and the
  // mobile Profile-tab badge when > 0. Real count, never fabricated.
  const unreadMessages = registered ? dmUnread : 0;

  async function signOut() {
    await logout();
    showToast("Signed out.");
    navigate("/login");
  }

  // Account menu — reproduced VERBATIM from the prototype accountMenu array
  // (FilipinoDama Royal.dc.html line 4314).
  const acctItems = [
    { icon: "👤", label: "View Profile", on: () => navigate("/profile") },
    { icon: "🛡️", label: "Guild Hall", on: () => navigate("/guilds") },
    { icon: "👥", label: "Friends", on: () => navigate("/friends") },
    { icon: "🎒", label: "Inventory", on: () => navigate("/inventory") },
    { icon: "🧾", label: "Purchase History", on: () => navigate("/orders") },
    { icon: "🎯", label: "Quests", on: () => navigate("/quests") },
    { icon: "✏️", label: "Edit Profile", on: () => navigate("/profile?edit=1") },
    { icon: "⚙️", label: "Settings", on: () => navigate("/settings") },
  ];

  const avatarToken = (
    <div style={{ width: 40, height: 40, borderRadius: "50%", overflow: "hidden", border: "2px solid var(--gold)", flex: "none" }}>
      <img src={avatarUrl(avatarSrc)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(1.25)" }} />
    </div>
  );

  return (
    <>
      {/* fixed background field (prototype lines 74-75) */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", background: "radial-gradient(1200px 700px at 50% -5%,rgba(90,50,140,.5),transparent 60%),radial-gradient(900px 900px at 8% 100%,rgba(120,30,50,.22),transparent 55%),radial-gradient(900px 900px at 95% 90%,rgba(60,40,120,.3),transparent 55%),linear-gradient(180deg,#1c1030,#0f0820)" }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 0, opacity: 0.4, backgroundImage: "radial-gradient(rgba(232,184,75,.05) 1px,transparent 1px)", backgroundSize: "30px 30px", pointerEvents: "none" }} />

      <div style={{ position: "relative", zIndex: 1, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        {/* ============ TOP NAV ============ */}
        <header style={{ borderBottom: "1px solid rgba(232,184,75,.28)", background: "linear-gradient(180deg,rgba(24,12,44,.9),rgba(18,9,34,.75))", backdropFilter: "blur(10px)", position: "sticky", top: 0, zIndex: 50 }}>
          <div style={{ maxWidth: 1560, margin: "0 auto", padding: "12px 26px", display: "flex", alignItems: "center", gap: 22 }}>
            <div onClick={() => navigate("/")} style={{ display: "flex", alignItems: "center", gap: 13, cursor: "pointer" }}>
              <img src={BRAND.logoSun} alt="" width={44} height={44} style={{ objectFit: "contain", flex: "none" }} />
              <div style={{ lineHeight: 0.9 }}>
                <div style={{ font: "800 15px Cinzel,serif", letterSpacing: "3px", color: "var(--gold-lt)" }}>FILIPINO</div>
                <div style={{ font: "900 26px Cinzel,serif", letterSpacing: "2px", background: "linear-gradient(180deg,#f7e2a0,#d5a63a)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>DAMA</div>
              </div>
            </div>
            {/* Center nav links — visible to everyone (logged out too) so Home,
                Play, Blog, Store, etc. are always reachable. The clean logged-out
                header (Sign In + Play Now on the right) is preserved. Hidden on
                narrow screens, where the hamburger drawer takes over. */}
            <nav className="fd-hide-narrow" style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 30 }}>
              {NAV.map((n) => (
                <button key={n.to} className={`navlink ${isOn(n.to) ? "on" : ""}`} onClick={() => navigate(n.to)}>
                  {n.label}
                </button>
              ))}
            </nav>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
              {/* Hamburger — narrow screens only (CSS shows it below 1100px). Opens
                  the full-screen drawer with all nav + account/auth. */}
              <button
                className="fd-burger"
                aria-label="Menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen(true)}
                style={{ width: 42, height: 42, borderRadius: 10, border: "1px solid rgba(232,184,75,.35)", background: "rgba(15,8,32,.6)", color: "var(--gold-lt)", cursor: "pointer", fontSize: 20, lineHeight: 1, alignItems: "center", justifyContent: "center", flex: "none" }}
              >
                ☰
              </button>
              {registered ? (
                <>
                  {/* ── REGISTERED USER: full account chrome ── */}
                  <span className="pill fd-hide-narrow" style={{ color: "#f2d493" }} title="Gold — earned from daily challenges, quests & matches. Spend it in the Store.">
                    <Icon src={ICONS.coin} alt="Gold" /> {gold.toLocaleString()}
                  </span>
                  <span className="pill fd-hide-narrow" style={{ color: "#ff9aa8", gap: 6, paddingRight: 5 }} title="Diamonds — premium currency. Top up with real money.">
                    <Icon src={ICONS.gem} alt="Diamonds" /> {diamonds.toLocaleString()}
                    <button onClick={() => setTopUpOpen(true)} title="Top up Diamonds" style={{ width: 22, height: 22, flex: "none", borderRadius: "50%", border: "none", background: "linear-gradient(180deg,#f0cf72,#c99a2e)", color: "#3a2405", font: "800 15px Inter", lineHeight: 1, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>+</button>
                  </span>
                  <button onClick={() => setNotifOpen((o) => !o)} title="Notifications" style={{ position: "relative", width: 40, height: 40, borderRadius: 10, border: "1px solid rgba(232,184,75,.35)", background: "rgba(15,8,32,.6)", color: "var(--gold-lt)", cursor: "pointer", fontSize: 18 }}>
                    🔔
                    {notifUnread > 0 && (
                      <span style={{ position: "absolute", top: -5, right: -5, minWidth: 17, height: 17, padding: "0 4px", borderRadius: 9, background: "linear-gradient(180deg,#e0555f,#a8202f)", color: "#fff", font: "800 10px Inter", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #150a24", boxShadow: "0 2px 6px rgba(0,0,0,.5)" }}>
                        {notifUnread > 9 ? "9+" : notifUnread}
                      </span>
                    )}
                  </button>
                  <div style={{ position: "relative" }}>
                    <div onClick={() => setAcctOpen((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: 6, cursor: "pointer" }}>
                      {/* nav avatar + unread-MESSAGES badge (prototype line 146). No DM
                          backend yet → unreadMessages is 0 → badge stays hidden. */}
                      <div style={{ position: "relative", flex: "none" }}>
                        {avatarToken}
                        {unreadMessages > 0 && (
                          <span title="Unread messages" style={{ position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, padding: "0 4px", borderRadius: 9, background: "linear-gradient(180deg,#e0555f,#a8202f)", color: "#fff", font: "800 10px Inter", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #150a24", boxShadow: "0 2px 6px rgba(0,0,0,.5)" }}>
                            {unreadMessages > 9 ? "9+" : unreadMessages}
                          </span>
                        )}
                      </div>
                      <div className="fd-hide-narrow" style={{ flexDirection: "column", alignItems: "flex-start", gap: 1, lineHeight: 1.2 }}>
                        <div style={{ font: "700 14px Inter", color: "#fff", whiteSpace: "nowrap" }}>{displayName}</div>
                        <div style={{ font: "600 11px Inter", color: "var(--gold)", whiteSpace: "nowrap" }}>
                          {tier.label} <span style={{ color: "var(--ink2)", fontFamily: "'JetBrains Mono',monospace" }}>{playerTag}</span>
                        </div>
                      </div>
                      <span className="fd-hide-narrow" style={{ color: "var(--ink2)", fontSize: 11, transform: acctOpen ? "rotate(180deg)" : "none", transition: "transform .15s ease" }}>▼</span>
                    </div>
                    {acctOpen && (
                      <>
                        <div onClick={() => setAcctOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 70 }} />
                        <div style={{ position: "absolute", top: "calc(100% + 10px)", right: 0, zIndex: 71, width: 240, borderRadius: 14, border: "1px solid rgba(232,184,75,.28)", background: "linear-gradient(180deg,#20132f,#170c26)", boxShadow: "0 18px 44px rgba(0,0,0,.55)", overflow: "hidden", animation: "fdrise .18s ease both" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "15px 16px", borderBottom: "1px solid rgba(232,184,75,.14)" }}>
                            {avatarToken}
                            <div style={{ minWidth: 0 }}>
                              <div style={{ font: "700 14px Inter", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayName}</div>
                              <div style={{ font: "700 11px 'JetBrains Mono',monospace", color: "var(--ink2)" }}>{playerTag}</div>
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "11px 16px", borderBottom: "1px solid rgba(232,184,75,.14)" }} title="Trophies — your Ranked ladder rating">
                            <span style={{ font: "600 11px Inter", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--ink2)" }}>Trophies</span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, font: "800 15px 'JetBrains Mono',monospace", color: "var(--gold-lt)" }}>
                              <Icon src={ICONS.trophy} alt="Trophies" size={16} /> {trophies.toLocaleString()}
                            </span>
                          </div>
                          <div style={{ padding: 6 }}>
                            {acctItems.map((mi) => (
                              <button key={mi.label} onClick={() => { setAcctOpen(false); mi.on(); }} style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", padding: "11px 12px", borderRadius: 9, border: "none", background: "none", color: "#efe7fb", font: "600 13px Inter", cursor: "pointer", textAlign: "left" }}>
                                <span style={{ width: 20, textAlign: "center", flex: "none" }}>{mi.icon}</span>
                                {mi.label}
                              </button>
                            ))}
                            {/* Log Out — distinct styling (top border, red), per prototype */}
                            <button onClick={() => { setAcctOpen(false); signOut(); }} style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", padding: "11px 12px", marginTop: 5, borderRadius: 9, border: "none", borderTop: "1px solid rgba(232,184,75,.14)", background: "none", color: "#ff9aa8", font: "600 13px Inter", cursor: "pointer", textAlign: "left" }}>
                              <span style={{ width: 20, textAlign: "center", flex: "none" }}>⏻</span>
                              Log Out
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {/* ── GUEST or LOGGED OUT: identical clean header — only Sign In
                      (ghost) + Play Now (gold). A guest is still a temporary
                      session, but the header looks the same as logged-out. ── */}
                  <button
                    onClick={() => navigate("/login")}
                    style={{
                      padding: "9px 18px",
                      fontSize: 13,
                      fontWeight: 700,
                      borderRadius: 9,
                      border: "1px solid rgba(232,184,75,.4)",
                      background: "rgba(15,8,32,.6)",
                      color: "var(--gold-lt)",
                      cursor: "pointer",
                    }}
                  >
                    Sign In
                  </button>
                  <button onClick={() => navigate("/play")} className="btn btn-gold" style={{ padding: "9px 20px", fontSize: 13, letterSpacing: ".5px" }}>
                    PLAY NOW
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        {/* ============ MOBILE HAMBURGER DRAWER ============ */}
        {/* Slide-in panel (narrow screens). Holds EVERYTHING: primary nav + Blog,
            plus account items/balances when signed in, or Sign In / Sign Up when
            logged out. Opened by the ☰ button; closes on link tap, backdrop, or Esc. */}
        {menuOpen && (
          <div className="fd-drawer-root" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="fd-drawer-backdrop" onClick={() => setMenuOpen(false)} />
            <aside className="fd-drawer">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: "1px solid rgba(232,184,75,.18)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <img src={BRAND.logoSun} alt="" width={34} height={34} style={{ objectFit: "contain", flex: "none" }} />
                  <div style={{ font: "900 20px Cinzel,serif", letterSpacing: "2px", background: "linear-gradient(180deg,#f7e2a0,#d5a63a)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>DAMA</div>
                </div>
                <button aria-label="Close menu" onClick={() => setMenuOpen(false)} style={{ width: 40, height: 40, borderRadius: 10, border: "1px solid rgba(232,184,75,.3)", background: "rgba(15,8,32,.6)", color: "var(--gold-lt)", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>✕</button>
              </div>

              {/* signed-in identity + balances */}
              {me && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: "1px solid rgba(232,184,75,.14)" }}>
                  {avatarToken}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ font: "700 15px Inter", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayName}</div>
                    {registered ? (
                      <div style={{ font: "600 11px Inter", color: "var(--gold)" }}>{tier.label} <span style={{ color: "var(--ink2)", fontFamily: "'JetBrains Mono',monospace" }}>{playerTag}</span></div>
                    ) : (
                      <div style={{ font: "600 11px Inter", color: "var(--ink2)" }}>Playing as guest</div>
                    )}
                  </div>
                  {registered && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, font: "700 12px Inter", color: "#f2d493" }}><Icon src={ICONS.coin} alt="Gold" size={15} /> {gold.toLocaleString()}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, font: "700 12px Inter", color: "#ff9aa8" }}><Icon src={ICONS.gem} alt="Diamonds" size={15} /> {diamonds.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="fd-drawer-scroll">
                {/* primary nav */}
                <div className="fd-drawer-sec">
                  {NAV.map((n) => (
                    <button key={n.to} className={`fd-drawer-item ${isOn(n.to) ? "on" : ""}`} onClick={() => navigate(n.to)}>
                      {n.label}
                    </button>
                  ))}
                </div>

                {/* account section (signed-in) OR auth CTAs (logged-out) */}
                {registered ? (
                  <div className="fd-drawer-sec fd-drawer-sec--top">
                    {acctItems.map((mi) => (
                      <button key={mi.label} className="fd-drawer-item" onClick={mi.on}>
                        <span style={{ width: 22, textAlign: "center", flex: "none" }}>{mi.icon}</span>
                        {mi.label}
                        {mi.label === "View Profile" && unreadMessages > 0 && (
                          <span style={{ marginLeft: "auto", minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: "linear-gradient(180deg,#e0555f,#a8202f)", color: "#fff", font: "800 10px Inter", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{unreadMessages > 9 ? "9+" : unreadMessages}</span>
                        )}
                      </button>
                    ))}
                    <button className="fd-drawer-item" style={{ color: "#ff9aa8" }} onClick={signOut}>
                      <span style={{ width: 22, textAlign: "center", flex: "none" }}>⏻</span>
                      Log Out
                    </button>
                  </div>
                ) : (
                  /* GUEST or LOGGED OUT — identical CTAs (guest looks like logged-out) */
                  <div className="fd-drawer-sec fd-drawer-sec--top" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <button className="btn btn-gold" style={{ width: "100%", justifyContent: "center", padding: "14px", letterSpacing: ".5px" }} onClick={() => navigate("/play")}>PLAY NOW</button>
                    <button className="fd-drawer-item" style={{ justifyContent: "center", border: "1px solid rgba(232,184,75,.4)" }} onClick={() => navigate("/login")}>Sign In</button>
                    <button className="fd-drawer-item" style={{ justifyContent: "center", border: "1px solid rgba(232,184,75,.4)" }} onClick={() => navigate("/register")}>Create Account</button>
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}

        <main style={{ flex: 1 }}>
          <Outlet />
        </main>
        <Footer />
      </div>
      <Toasts />
      <TopUpModal open={topUpOpen} onClose={() => setTopUpOpen(false)} />
      <NotificationsMenu open={notifOpen} onClose={() => setNotifOpen(false)} onUnreadChange={setNotifUnread} />
    </>
  );
}

export default AppLayout;
