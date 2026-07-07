import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { rankTierFor } from "@dama/shared";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";
import { ICONS, BRAND, avatar as avatarUrl } from "../../lib/assets";
import { Toasts } from "../shared/Toasts";

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

  // Real logged-in user (from the auth session) takes precedence; fall back to the
  // appStore placeholder only when logged out.
  const me = useAuthStore((s) => s.me);
  const logout = useAuthStore((s) => s.logout);

  const phName = useAppStore((s) => s.displayName);
  const phTag = useAppStore((s) => s.playerTag);
  const av = useAppStore((s) => s.avatar);
  const phGold = useAppStore((s) => s.gold);
  const phDiamonds = useAppStore((s) => s.diamonds);
  const phTrophies = useAppStore((s) => s.trophies);
  const showToast = useAppStore((s) => s.showToast);
  const [acctOpen, setAcctOpen] = useState(false);

  const displayName = me?.displayName ?? phName;
  const playerTag = me?.tag ?? phTag;
  const gold = me?.gold ?? phGold;
  const diamonds = me?.diamonds ?? phDiamonds;
  const trophies = me?.trophies ?? phTrophies;
  const avatarSrc = me?.avatarUrl ?? av;

  const tier = rankTierFor(trophies);
  const isOn = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  async function signOut() {
    await logout();
    showToast("Signed out.");
    navigate("/login");
  }

  const acctItems = [
    { icon: "👤", label: "My Profile", on: () => navigate("/profile") },
    { icon: "🎒", label: "Inventory", on: () => showToast("Inventory is coming soon.") },
    { icon: "🧾", label: "Orders", on: () => showToast("Orders are coming soon.") },
    { icon: "⚙️", label: "Settings", on: () => navigate("/settings") },
    me
      ? { icon: "🚪", label: "Sign Out", on: signOut }
      : { icon: "🔑", label: "Sign In", on: () => navigate("/login") },
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
              <span className="pill fd-hide-narrow" style={{ color: "#f2d493" }} title="Gold — earned from daily challenges, quests & matches. Spend it in the Store.">
                <Icon src={ICONS.coin} alt="Gold" /> {gold.toLocaleString()}
              </span>
              <span className="pill fd-hide-narrow" style={{ color: "#ff9aa8", gap: 6, paddingRight: 5 }} title="Diamonds — premium currency. Top up with real money.">
                <Icon src={ICONS.gem} alt="Diamonds" /> {diamonds.toLocaleString()}
                <button onClick={() => showToast("Diamond top-up arrives with payments.")} title="Top up Diamonds" style={{ width: 22, height: 22, flex: "none", borderRadius: "50%", border: "none", background: "linear-gradient(180deg,#f0cf72,#c99a2e)", color: "#3a2405", font: "800 15px Inter", lineHeight: 1, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>+</button>
              </span>
              <button onClick={() => showToast("Notifications arrive with online play.")} title="Notifications" style={{ position: "relative", width: 40, height: 40, borderRadius: 10, border: "1px solid rgba(232,184,75,.35)", background: "rgba(15,8,32,.6)", color: "var(--gold-lt)", cursor: "pointer", fontSize: 18 }}>
                🔔
              </button>
              {!me && (
                <button onClick={() => navigate("/login")} className="btn btn-gold fd-hide-narrow" style={{ padding: "9px 18px", fontSize: 13 }}>
                  Sign In
                </button>
              )}
              <div style={{ position: "relative" }}>
                <div onClick={() => setAcctOpen((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: 6, cursor: "pointer" }}>
                  {avatarToken}
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
                          <button key={mi.label} onClick={() => { setAcctOpen(false); mi.on(); }} style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", padding: "10px 12px", borderRadius: 9, border: "none", background: "none", color: "var(--ink)", font: "600 13px Inter", cursor: "pointer", textAlign: "left" }}>
                            <span style={{ width: 20, textAlign: "center", flex: "none" }}>{mi.icon}</span>
                            {mi.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
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
          <button className={`navlink ${isOn("/profile") ? "on" : ""}`} onClick={() => navigate("/profile")}>Profile</button>
        </nav>

        <main style={{ flex: 1 }}>
          <Outlet />
        </main>
      </div>
      <Toasts />
    </>
  );
}

export default AppLayout;
