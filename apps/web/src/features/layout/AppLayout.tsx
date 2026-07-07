import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { rankTierFor } from "@dama/shared";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";
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
  const [acctOpen, setAcctOpen] = useState(false);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifUnread, setNotifUnread] = useState(0);

  const isGuest = !!me?.isGuest;
  const registered = !!me && !me.isGuest; // a real (non-guest) account
  const displayName = me?.displayName ?? "Guest";
  const playerTag = me?.tag ?? "";
  const gold = me?.gold ?? 0;
  const diamonds = me?.diamonds ?? 0;
  const trophies = me?.trophies ?? 0;
  const avatarSrc = me?.avatarUrl ?? "champion";

  const tier = rankTierFor(trophies);
  const isOn = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  // Unread direct-messages total, driven from a REAL source. There is no DM /
  // chat backend yet, so this is honestly 0 and the badge stays hidden. When the
  // DM backend lands, replace this with the live unread count and both the nav
  // avatar badge and the mobile Profile-tab badge (below) light up automatically.
  const unreadMessages = 0;

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
    { icon: "🎒", label: "Locker", on: () => navigate("/inventory") },
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
            <nav className="fd-hide-narrow" style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 30 }}>
              {NAV.map((n) => (
                <button key={n.to} className={`navlink ${isOn(n.to) ? "on" : ""}`} onClick={() => navigate(n.to)}>
                  {n.label}
                </button>
              ))}
            </nav>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
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
              ) : isGuest ? (
                <>
                  {/* ── GUEST: temporary session — nudge to sign in, no account chrome ── */}
                  <span className="fd-hide-narrow" style={{ font: "600 12px Inter", color: "var(--ink2)" }}>Playing as guest</span>
                  <button onClick={() => navigate("/login")} className="btn btn-gold" style={{ padding: "9px 18px", fontSize: 13 }}>
                    Sign In / Sign Up
                  </button>
                  <button onClick={signOut} title="End guest session" style={{ width: 40, height: 40, borderRadius: 10, border: "1px solid rgba(232,184,75,.3)", background: "rgba(15,8,32,.6)", color: "var(--ink2)", cursor: "pointer", fontSize: 15 }}>
                    ⎋
                  </button>
                </>
              ) : (
                <>
                  {/* ── LOGGED OUT: just Sign In ── */}
                  <button onClick={() => navigate("/login")} className="btn btn-gold" style={{ padding: "9px 20px", fontSize: 13 }}>
                    Sign In
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        {/* mobile nav (prototype lines 173-181) */}
        <nav className="fd-mnav">
          {NAV.map((n) => (
            <button key={n.to} className={`navlink ${isOn(n.to) ? "on" : ""}`} onClick={() => navigate(n.to)}>
              {n.mobileLabel ?? n.label}
            </button>
          ))}
          {/* mobile Profile tab + unread-MESSAGES badge (prototype line 180). No DM
              backend yet → unreadMessages is 0 → badge stays hidden. */}
          <button className={`navlink ${isOn("/profile") ? "on" : ""}`} onClick={() => navigate("/profile")} style={{ position: "relative" }}>
            Profile
            {unreadMessages > 0 && (
              <span title="Unread messages" style={{ position: "absolute", top: -3, right: -5, minWidth: 17, height: 17, padding: "0 4px", borderRadius: 9, background: "linear-gradient(180deg,#e0555f,#a8202f)", color: "#fff", font: "800 10px Inter", display: "inline-flex", alignItems: "center", justifyContent: "center", border: "2px solid #150a24", boxShadow: "0 2px 6px rgba(0,0,0,.5)" }}>
                {unreadMessages > 9 ? "9+" : unreadMessages}
              </span>
            )}
          </button>
        </nav>

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
