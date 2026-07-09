import { useState } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Footer — site-wide footer, reproduced from the handoff prototype
 * (handoff/FilipinoDama Royal.dc.html footer, lines 2219-2238).
 *
 * Two rows: tagline + copyright, a hairline divider, then the legal/contact nav
 * + "Rated E for Everyone". Rendered by AppLayout after <main>. Legal links
 * navigate to the dedicated legal routes.
 *
 * The prototype's `style-hover` attribute has no React inline-style equivalent,
 * so the legal-link hover color is done with local hover state (no CSS class,
 * to keep the footer self-contained).
 */

const LEGAL_LINKS: { label: string; to: string }[] = [
  { label: "Blog", to: "/blog" },
  { label: "Privacy Policy", to: "/privacy" },
  { label: "Terms of Service", to: "/terms" },
  { label: "Community Guidelines", to: "/community" },
  { label: "Fair Play & Anti-Cheat", to: "/anti-cheat" },
  { label: "Data & Account", to: "/data" },
  { label: "Contact", to: "/contact" },
];

export function Footer() {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <footer style={{ borderTop: "1px solid rgba(232,184,75,.2)", marginTop: 20 }}>
      <div
        style={{
          maxWidth: 1560,
          margin: "0 auto",
          padding: "22px 26px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* top row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ font: "600 12px Cinzel,serif", letterSpacing: 3, color: "var(--gold)" }}>
            STRATEGY · HERITAGE · VICTORY
          </div>
          <div style={{ font: "500 12px Inter", color: "var(--ink2)" }}>
            © {new Date().getFullYear()} filipinodama.com
          </div>
        </div>

        <div style={{ height: 1, background: "rgba(232,184,75,.12)" }} />

        {/* bottom row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <nav style={{ display: "flex", flexWrap: "wrap", gap: "6px 4px", alignItems: "center" }}>
            {LEGAL_LINKS.map((l) => (
              <button
                key={l.to}
                type="button"
                onClick={() => navigate(l.to)}
                onMouseEnter={() => setHovered(l.to)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "4px 10px",
                  font: "600 12px Inter",
                  color: hovered === l.to ? "var(--gold-lt)" : "var(--ink2)",
                }}
              >
                {l.label}
              </button>
            ))}
          </nav>
          <div
            style={{
              font: "500 11px Inter",
              color: "rgba(200,190,220,.5)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span>Rated E for Everyone</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
