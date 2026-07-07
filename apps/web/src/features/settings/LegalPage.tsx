import { useNavigate } from "react-router-dom";

/**
 * LegalPage (/legal) — Privacy Policy & Terms of Service. Reached from the
 * Settings › "Privacy & Terms" account link. Static policy copy (no user data),
 * styled to match the royal frame system.
 */
export function LegalPage() {
  const navigate = useNavigate();

  const h2: React.CSSProperties = {
    margin: "22px 0 8px",
    font: "800 18px Cinzel,serif",
    color: "var(--gold-lt)",
  };
  const p: React.CSSProperties = { margin: "0 0 12px", font: "400 14px/1.7 Inter", color: "var(--ink)" };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 26 }}>
      <div style={{ textAlign: "center", margin: "6px 0 24px" }}>
        <div
          style={{ font: "700 12px Inter", letterSpacing: 2, textTransform: "uppercase", color: "var(--gold)" }}
        >
          Legal
        </div>
        <h1 style={{ margin: "8px 0 0", font: "800 32px Cinzel,serif", color: "var(--gold-lt)" }}>Privacy &amp; Terms</h1>
      </div>

      <div className="frame" style={{ padding: 26 }}>
        <h2 style={{ ...h2, marginTop: 0 }}>Privacy Policy</h2>
        <p style={p}>
          FilipinoDama Royal collects only the account information needed to run your game: your display name,
          in-game stats, match history, and cosmetics. We never sell your data. You can download a full copy of
          everything we hold from Settings › Export My Data, and permanently delete your account from Settings ›
          Delete Account.
        </p>
        <p style={p}>
          Payments for diamonds and packs are processed by the App Store or Google Play; we do not store your card
          details. Analytics are limited to aggregate gameplay metrics used to balance and improve the game.
        </p>

        <h2 style={h2}>Terms of Service</h2>
        <p style={p}>
          By playing FilipinoDama Royal you agree to play fairly — no cheating, botting, or exploiting bugs — and to
          treat other players with respect. Virtual currencies (gold, diamonds) and cosmetic items have no cash value
          and are non-transferable and non-refundable except where required by law.
        </p>
        <p style={p}>
          We may suspend or close accounts that violate these terms. The game is provided “as is”; we work hard to keep
          it available and fair, but cannot guarantee uninterrupted service.
        </p>

        <h2 style={h2}>Contact</h2>
        <p style={{ ...p, marginBottom: 0 }}>
          Questions about your data or these policies? Reach us in-app through Settings, and we will respond within a
          reasonable time.
        </p>
      </div>

      <div style={{ textAlign: "center", marginTop: 18 }}>
        <button
          type="button"
          className="btn btn-purple"
          onClick={() => navigate("/settings")}
          style={{ padding: "12px 26px" }}
        >
          Back to Settings
        </button>
      </div>
    </div>
  );
}

export default LegalPage;
