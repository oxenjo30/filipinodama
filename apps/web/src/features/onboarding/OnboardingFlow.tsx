import { useEffect, useState } from "react";
import { useAuthStore } from "../../stores/authStore";
import { BRAND, ICONS, CRESTS } from "../../lib/assets";

/**
 * OnboardingFlow — a 4-slide first-run tour shown ONCE, right after a user
 * creates a registered (non-guest) account. Reproduces the v2 prototype's
 * onboarding carousel (fixed overlay z-index 358) in the app's gold/dark theme.
 *
 * TRIGGER: mounted once in AppLayout. It shows only when this session's
 * authStore.register() just succeeded (`justRegistered`) for a real (non-guest)
 * account AND localStorage "fdr.onboarded" !== "1". Finishing (Next past the
 * last slide, or Skip) writes the flag so it never shows again — existing
 * already-onboarded users are never interrupted because `justRegistered` is a
 * transient session flag that only register() ever sets.
 */

const ONBOARDED_KEY = "fdr.onboarded";

const EYEBROW = ["✦ Welcome ✦", "How to play", "Your currencies", "Ready to play"];
const TITLE = [
  "Welcome to FilipinoDama Royal",
  "Capture to win",
  "Trophies, Gold & Diamonds",
  "Choose how you play",
];
const BODY = [
  "You’ve joined the royal board of the Philippines. Let’s take a quick tour so you’re ready for your first match.",
  "Move your pieces diagonally and jump over your opponent to capture. Captures are mandatory — reach the far row to promote a piece into a crowned Dama king.",
  "Earn 🏆 Trophies from ranked wins to climb the tiers, spend 🪙 Gold from victories in the store, and unlock premium cosmetics with 💎 Diamonds.",
  "Practice against the AI, jump into ranked matchmaking, or open a private room and invite a friend. Your kingdom awaits.",
];
// Slide art from the existing asset map (no invented paths): logo sun for the
// welcome slide, the crowned crest for the "promote to king" slide, the trophy
// for currencies, and the logo sun again for the final ready-to-play slide.
const IMAGES = [BRAND.logoSun, CRESTS.crown.src, ICONS.trophy, BRAND.logoSun];

const SLIDES = 4;

export function OnboardingFlow() {
  const me = useAuthStore((s) => s.me);
  const justRegistered = useAuthStore((s) => s.justRegistered);
  const clearJustRegistered = useAuthStore((s) => s.clearJustRegistered);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  // Decide whether to show the tour: a real (non-guest) account that just
  // registered this session, and who hasn't already been onboarded.
  useEffect(() => {
    if (open) return;
    if (!me || me.isGuest || !justRegistered) return;
    let onboarded = false;
    try {
      onboarded = localStorage.getItem(ONBOARDED_KEY) === "1";
    } catch {
      /* localStorage unavailable — treat as not onboarded */
    }
    if (onboarded) {
      // Already onboarded (shouldn't normally happen right after register) —
      // clear the transient flag so it can't re-trigger later.
      clearJustRegistered();
      return;
    }
    setStep(0);
    setOpen(true);
  }, [me, justRegistered, open, clearJustRegistered]);

  function finish() {
    try {
      localStorage.setItem(ONBOARDED_KEY, "1");
    } catch {
      /* ignore — best effort */
    }
    clearJustRegistered();
    setOpen(false);
  }

  function next() {
    if (step >= SLIDES - 1) finish();
    else setStep((s) => s + 1);
  }

  if (!open) return null;

  const last = step === SLIDES - 1;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 358,
        overflow: "auto",
        background:
          "radial-gradient(1100px 700px at 50% -6%,rgba(90,50,140,.6),#0c0618 62%),#0c0618",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        animation: "fdfade .25s ease",
      }}
    >
      {/* dot texture overlay — same as the app's other fixed overlays */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.4,
          backgroundImage: "radial-gradient(rgba(232,184,75,.06) 1px,transparent 1px)",
          backgroundSize: "30px 30px",
          pointerEvents: "none",
        }}
      />

      <div
        className="frame"
        style={{
          position: "relative",
          width: "min(95vw,500px)",
          padding: "32px 32px 26px",
          textAlign: "center",
          background: "linear-gradient(180deg,#1c1130,#140a24)",
        }}
      >
        <button
          onClick={finish}
          style={{
            position: "absolute",
            top: 14,
            right: 16,
            border: "none",
            background: "none",
            color: "var(--ink2)",
            font: "600 12px Inter",
            cursor: "pointer",
            padding: 4,
          }}
        >
          Skip
        </button>

        <div
          style={{
            font: "700 10px Inter",
            letterSpacing: 3,
            textTransform: "uppercase",
            color: "var(--gold)",
            marginTop: 4,
          }}
        >
          {EYEBROW[step]}
        </div>

        <div
          style={{
            width: 120,
            height: 120,
            margin: "20px auto 6px",
            borderRadius: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background:
              "radial-gradient(circle at 50% 35%,rgba(232,184,75,.16),rgba(0,0,0,.25))",
            border: "1px solid rgba(232,184,75,.28)",
          }}
        >
          <img
            src={IMAGES[step]}
            alt=""
            width={88}
            height={88}
            style={{ objectFit: "contain" }}
          />
        </div>

        <h1 style={{ margin: "16px 0 0", font: "800 26px Cinzel,serif", color: "var(--gold-lt)" }}>
          {TITLE[step]}
        </h1>

        <p
          style={{
            margin: "12px auto 0",
            maxWidth: 380,
            font: "400 14px/1.6 Inter",
            color: "var(--ink)",
          }}
        >
          {BODY[step]}
        </p>

        {/* dots row */}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", margin: "22px 0 20px" }}>
          {Array.from({ length: SLIDES }).map((_, i) => (
            <button
              key={i}
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => setStep(i)}
              style={{
                width: i === step ? 22 : 9,
                height: 9,
                borderRadius: 100,
                border: "none",
                padding: 0,
                cursor: "pointer",
                background: i === step ? "var(--gold)" : "rgba(232,184,75,.28)",
                transition: "width .18s ease, background .18s ease",
              }}
            />
          ))}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          {step > 0 && (
            <button className="btn" style={{ flex: "none" }} onClick={() => setStep((s) => s - 1)}>
              Back
            </button>
          )}
          <button className="btn btn-gold" style={{ flex: 1 }} onClick={next}>
            {last ? "Enter the Arena" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default OnboardingFlow;
