import { useNavigate } from "react-router-dom";
import { Frame, SectionTitle, Button } from "../../components";

export type ComingSoonProps = {
  /** page title shown in the frame */
  title: string;
  /** eyebrow above the title */
  eyebrow?: string;
  /** short blurb */
  blurb?: string;
};

/**
 * ComingSoon — styled placeholder for routes that aren't built yet, so NO nav
 * link is ever dead. Uses the ornate Frame + SectionTitle and offers a way back
 * to Home / Play so the user is never stranded.
 */
export function ComingSoon({
  title,
  eyebrow = "✦ Coming Soon ✦",
  blurb = "This screen is being crafted in the royal style to match your mockup. The design system, board engine, and navigation are all live — this page is next in line.",
}: ComingSoonProps) {
  const navigate = useNavigate();
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px 26px 60px" }}>
      <Frame style={{ padding: 40, textAlign: "center" }}>
        <div style={{ font: "700 12px Inter", letterSpacing: 3, color: "var(--gold)", marginBottom: 14 }}>
          {eyebrow}
        </div>
        <h1
          style={{
            margin: "0 0 6px",
            font: "800 clamp(28px,4vw,40px) Cinzel,serif",
            background: "linear-gradient(180deg,#f7e2a0,#d5a63a)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          {title}
        </h1>
        <SectionTitle style={{ border: "none", margin: "16px 0 10px" }}>In the Royal Workshop</SectionTitle>
        <p style={{ font: "400 15px/1.6 Inter", color: "var(--ink)", maxWidth: 440, margin: "0 auto 24px" }}>
          {blurb}
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Button variant="red" onClick={() => navigate("/play/ai")}>
            ⚔ Play vs AI
          </Button>
          <Button variant="purple" onClick={() => navigate("/")}>
            Back to Home
          </Button>
        </div>
      </Frame>
    </div>
  );
}

export default ComingSoon;
