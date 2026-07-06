import { useLocation, useNavigate } from "react-router-dom";
import { CurrencyPill, Avatar } from "../../components";
import { BRAND } from "../../lib/assets";
import { useAppStore } from "../../stores/appStore";
import { NAV_LINKS, isNavActive } from "./navLinks";

/**
 * TopNav — the sticky desktop header from the prototype: brand lockup (logo +
 * FILIPINO / DAMA), centred nav links (hidden ≤1100px via .fd-hide-narrow), and
 * the currency pills + avatar on the right. Currency values are placeholders
 * from appStore. Tapping the avatar routes to the profile.
 */
export function TopNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { displayName, playerTag, avatar, gold, diamonds, trophies, showToast } =
    useAppStore();

  return (
    <header
      style={{
        borderBottom: "1px solid rgba(232,184,75,.28)",
        background: "linear-gradient(180deg,rgba(24,12,44,.9),rgba(18,9,34,.75))",
        backdropFilter: "blur(10px)",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      <div
        style={{
          maxWidth: 1560,
          margin: "0 auto",
          padding: "12px 26px",
          display: "flex",
          alignItems: "center",
          gap: 22,
        }}
      >
        {/* brand */}
        <div
          onClick={() => navigate("/")}
          style={{ display: "flex", alignItems: "center", gap: 13, cursor: "pointer" }}
        >
          <img
            src={BRAND.logoSun}
            alt="FilipinoDama"
            style={{
              width: 48,
              height: 48,
              objectFit: "contain",
              display: "block",
              filter: "drop-shadow(0 3px 6px rgba(0,0,0,.5))",
            }}
          />
          <div style={{ lineHeight: 0.9 }}>
            <div style={{ font: "800 15px Cinzel,serif", letterSpacing: 3, color: "var(--gold-lt)" }}>
              FILIPINO
            </div>
            <div
              style={{
                font: "900 26px Cinzel,serif",
                letterSpacing: 2,
                background: "linear-gradient(180deg,#f7e2a0,#d5a63a)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              DAMA
            </div>
          </div>
        </div>

        {/* desktop nav */}
        <nav
          className="fd-hide-narrow"
          style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 30 }}
        >
          {NAV_LINKS.map((l) => (
            <button
              key={l.to}
              className={`navlink ${isNavActive(l.to, pathname) ? "on" : ""}`}
              onClick={() => navigate(l.to)}
            >
              {l.label}
            </button>
          ))}
        </nav>

        {/* right cluster */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <CurrencyPill
            kind="gold"
            value={gold}
            className="fd-hide-narrow"
            title="Gold — earned from matches & quests. Spend it in the Store."
          />
          <CurrencyPill
            kind="diamond"
            value={diamonds}
            className="fd-hide-narrow"
            title="Diamonds — premium currency."
          />
          <div
            onClick={() => navigate("/profile")}
            title={`${displayName} ${playerTag}`}
            style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
          >
            <Avatar src={avatar} size={40} />
            <div
              className="fd-hide-narrow"
              style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.2 }}
            >
              <div style={{ font: "700 14px Inter", color: "#fff", whiteSpace: "nowrap" }}>
                {displayName}
              </div>
              <div style={{ font: "600 11px Inter", color: "var(--gold)", whiteSpace: "nowrap" }}>
                🏆 {trophies.toLocaleString()}{" "}
                <span style={{ color: "var(--ink2)", fontFamily: "'JetBrains Mono',monospace" }}>
                  {playerTag}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={() => showToast("Notifications are coming soon.")}
            title="Notifications"
            className="fd-hide-narrow"
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              border: "1px solid rgba(232,184,75,.35)",
              background: "rgba(15,8,32,.6)",
              color: "var(--gold-lt)",
              cursor: "pointer",
              fontSize: 17,
            }}
          >
            🔔
          </button>
        </div>
      </div>
    </header>
  );
}

export default TopNav;
