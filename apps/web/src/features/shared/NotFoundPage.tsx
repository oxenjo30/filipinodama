import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/**
 * NotFoundPage — branded 404 catch-all. Reproduces the v2 prototype markup in the
 * app's gold/dark theme: an ornate frame with the big gradient "404", an eyebrow,
 * a headline, a short blurb, and two ways back (Home / Play). Sets document.title
 * on mount so the tab reads "Page not found — FilipinoDama".
 */
export function NotFoundPage() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Page not found — FilipinoDama";
  }, []);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "76px 26px", textAlign: "center" }}>
      <div className="frame" style={{ padding: "52px 40px" }}>
        <div
          style={{
            font: "900 88px Cinzel,serif",
            lineHeight: 1,
            background: "linear-gradient(180deg,#f7e2a0,#d5a63a)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          404
        </div>
        <div
          style={{
            font: "700 12px Inter",
            letterSpacing: 3,
            textTransform: "uppercase",
            color: "var(--gold)",
            marginTop: 8,
          }}
        >
          Off the board
        </div>
        <h1 style={{ margin: "14px 0 6px", font: "800 30px Cinzel,serif", color: "var(--gold-lt)" }}>
          This page doesn't exist
        </h1>
        <p style={{ margin: "0 auto", maxWidth: 410, font: "400 14px/1.6 Inter", color: "var(--ink)" }}>
          The page you're looking for may have been moved, or the link was mistyped. Let's get you back to the game.
        </p>
        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "center",
            flexWrap: "wrap",
            marginTop: 26,
          }}
        >
          <button className="btn btn-gold" style={{ padding: "14px 28px", fontSize: 14 }} onClick={() => navigate("/")}>
            Back to Home
          </button>
          <button
            className="btn btn-purple"
            style={{ padding: "14px 28px", fontSize: 14 }}
            onClick={() => navigate("/play")}
          >
            Go to Play
          </button>
        </div>
      </div>
    </div>
  );
}

export default NotFoundPage;
