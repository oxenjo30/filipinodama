import { useState } from "react";
import { useNavigate } from "react-router-dom";

/**
 * CookieConsent — bottom-fixed cookie/consent bar, reproduced VERBATIM from the
 * prototype. Shown until the visitor chooses; the choice is persisted in
 * localStorage under "fdr.consent" ("all" | "necessary"). Lives once in
 * AppLayout so it appears on every page. z-index 365 intentionally sits above
 * content and the login/onboarding overlays (z 358-360).
 */

const CONSENT_KEY = "fdr.consent";

function readConsent(): string | null {
  try {
    return localStorage.getItem(CONSENT_KEY);
  } catch {
    return null;
  }
}

export function CookieConsent() {
  const navigate = useNavigate();
  // Initialize from localStorage: if a choice already exists, the bar never shows.
  const [visible, setVisible] = useState(() => readConsent() === null);

  if (!visible) return null;

  function choose(value: "all" | "necessary") {
    try {
      localStorage.setItem(CONSENT_KEY, value);
    } catch {
      // localStorage can throw (private mode / disabled) — dismiss anyway.
    }
    setVisible(false);
  }

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 365,
        display: "flex",
        justifyContent: "center",
        padding: 16,
        paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
        pointerEvents: "none",
        animation: "fdslidein .3s ease",
      }}
    >
      <div
        className="frame"
        style={{
          pointerEvents: "auto",
          width: "min(96vw,860px)",
          padding: "18px 22px",
          display: "flex",
          alignItems: "center",
          gap: 18,
          flexWrap: "wrap",
          background: "linear-gradient(180deg,#1c1130,#140a24)",
          boxShadow: "0 18px 46px rgba(0,0,0,.55)",
          overflow: "auto",
        }}
      >
        <div style={{ flex: 1, minWidth: 230 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 5 }}>
            <span style={{ fontSize: 17 }}>🍪</span>
            <span style={{ font: "800 15px Cinzel,serif", color: "var(--gold-lt)" }}>We value your privacy</span>
          </div>
          <p style={{ margin: 0, font: "400 12.5px/1.55 Inter", color: "var(--ink)" }}>
            We use cookies to keep you signed in, remember your preferences, and improve the game. See our{" "}
            <button
              onClick={() => navigate("/privacy")}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                font: "inherit",
                color: "var(--gold-lt)",
                textDecoration: "underline",
                cursor: "pointer",
              }}
            >
              Privacy Policy
            </button>{" "}
            for details.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flex: "none", flexWrap: "wrap" }}>
          <button
            className="btn"
            onClick={() => choose("necessary")}
            style={{
              padding: "12px 20px",
              fontSize: 13,
              border: "1px solid rgba(232,184,75,.35)",
              background: "rgba(255,255,255,.04)",
              color: "#efe7fb",
            }}
          >
            Necessary only
          </button>
          <button className="btn btn-gold" onClick={() => choose("all")} style={{ padding: "12px 22px", fontSize: 13 }}>
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}

export default CookieConsent;
