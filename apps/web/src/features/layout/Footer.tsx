import { useState } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Footer — site-wide footer, reproduced from the handoff prototype
 * (handoff/FilipinoDama Royal.dc.html footer, lines 2219-2238).
 *
 * Two rows: social icons + tagline + copyright, a hairline divider, then the
 * legal/contact nav + "Rated E for Everyone". Rendered by AppLayout after
 * <main>. Legal links navigate to the four dedicated legal routes; the social
 * icons are inert placeholders (no real URLs yet) but carry aria-labels so an
 * SVG-only button still has an accessible name.
 *
 * The prototype's `style-hover` attribute has no React inline-style equivalent,
 * so the legal-link hover color is done with local hover state (no CSS class,
 * to keep the footer self-contained).
 */

// The three social icons transcribed from the prototype ICONS.fb/yt/discord
// (lines 2783-2785) via the RAW helper (line 2750): a 24x24 viewBox, no fill,
// currentColor stroke, width 2, round caps/joins.
function SocialIcon({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 24,
        height: 24,
        padding: 0,
        background: "none",
        border: "none",
        color: "var(--ink2)",
        cursor: "pointer",
      }}
    >
      <svg
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    </button>
  );
}

const LEGAL_LINKS: { label: string; to: string }[] = [
  { label: "Blog", to: "/blog" },
  { label: "Privacy Policy", to: "/privacy" },
  { label: "Terms of Service", to: "/terms" },
  { label: "Community Guidelines", to: "/community" },
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
          <div style={{ display: "flex", gap: 16, color: "var(--ink2)" }}>
            <SocialIcon label="Facebook">
              <path d="M14 8h2V5h-2a3 3 0 0 0-3 3v2H9v3h2v6h3v-6h2l1-3h-3V8a1 1 0 0 1 1-1z" />
            </SocialIcon>
            <SocialIcon label="YouTube">
              <rect x={3} y={6} width={18} height={12} rx={3} />
              <path d="M11 9l4 3-4 3z" />
            </SocialIcon>
            <SocialIcon label="Discord">
              <path d="M7 8a12 12 0 0 1 10 0M6 16a15 15 0 0 0 12 0M8 17c-1 1-2 2-3 2M16 17c1 1 2 2 3 2M5 16l-1-8 3-2M19 16l1-8-3-2" />
              <circle cx={9} cy={13} r={1} fill="currentColor" />
              <circle cx={15} cy={13} r={1} fill="currentColor" />
            </SocialIcon>
          </div>
          <div style={{ font: "600 12px Cinzel,serif", letterSpacing: 3, color: "var(--gold)" }}>
            STRATEGY · HERITAGE · VICTORY
          </div>
          <div style={{ font: "500 12px Inter", color: "var(--ink2)" }}>© 2025 filipinodama.com</div>
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
