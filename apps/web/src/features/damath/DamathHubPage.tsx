import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AiDifficulty, DamathVariant } from "@dama/shared";
import { Button } from "../../components";
import { useAppStore } from "../../stores/appStore";
import { useDamathStore } from "../../stores/damathStore";
import { variantsFor, variantInfo, type DamathLevel } from "./variants";

type Step = "level" | "variant" | "opponent" | "difficulty";

const LEVELS: { key: DamathLevel; title: string; blurb: string; icon: string }[] = [
  { key: "elementary", title: "Elementary", blurb: "Counting, Whole & Fraction number systems.", icon: "🎒" },
  { key: "secondary", title: "Secondary", blurb: "Integers, rationals, radicals & polynomials.", icon: "🎓" },
];

const OPPONENTS: { key: "local" | "ai" | "online"; title: string; blurb: string; icon: string; ready: boolean }[] = [
  { key: "local", title: "Pass & Play", blurb: "Two players on one device.", icon: "👥", ready: true },
  { key: "ai", title: "Play vs AI", blurb: "Practice against the computer.", icon: "🤖", ready: true },
  { key: "online", title: "Online", blurb: "Server-matched, unranked.", icon: "🌐", ready: false },
];

const DIFFICULTIES: { key: AiDifficulty; title: string; blurb: string; dots: number; color: string }[] = [
  { key: "easy", title: "Easy", blurb: "A gentle opponent — forgives loose play.", dots: 1, color: "#3fbf6f" },
  { key: "normal", title: "Normal", blurb: "Plays soundly and punishes free captures.", dots: 2, color: "#E8B84B" },
  { key: "hard", title: "Hard", blurb: "Never blunders; hunts the best-net capture.", dots: 3, color: "#d63b52" },
];

const goldHeading: React.CSSProperties = {
  background: "linear-gradient(180deg,#f7e2a0,#d5a63a)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
};

export function DamathHubPage() {
  const navigate = useNavigate();
  const showToast = useAppStore((s) => s.showToast);
  const newLocalGame = useDamathStore((s) => s.newLocalGame);
  const newAiGame = useDamathStore((s) => s.newAiGame);

  const [step, setStep] = useState<Step>("level");
  const [level, setLevel] = useState<DamathLevel | null>(null);
  const [variant, setVariant] = useState<DamathVariant | null>(null);

  const startLocal = (v: DamathVariant) => {
    newLocalGame(v);
    navigate("/damath/game");
  };

  const startAi = (v: DamathVariant, d: AiDifficulty) => {
    newAiGame(v, d);
    navigate("/damath/game");
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 26px 60px" }}>
      <div style={{ textAlign: "center", marginBottom: 30 }}>
        <div style={{ font: "700 12px Inter", letterSpacing: 3, color: "var(--gold)" }}>
          ✦ EDUCATIONAL MODE ✦
        </div>
        <h1 style={{ margin: "10px 0 6px", font: "800 clamp(28px,4vw,40px) Cinzel,serif" }}>
          <span style={goldHeading}>Math Dama</span>
        </h1>
        <p style={{ font: "400 14px Inter", color: "var(--ink)", margin: 0 }}>
          Capture pieces, solve operations, and win by score.
        </p>
      </div>

      {/* stepper */}
      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 26, flexWrap: "wrap" }}>
        <Crumb n={1} label="Level" done={!!level} active={step === "level"} onClick={() => setStep("level")} />
        <Crumb n={2} label="Variant" done={!!variant} active={step === "variant"} disabled={!level} onClick={() => level && setStep("variant")} />
        <Crumb n={3} label="Opponent" done={false} active={step === "opponent"} disabled={!variant} onClick={() => variant && setStep("opponent")} />
      </div>

      {step === "level" && (
        <div className="fd-diff-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14 }}>
          {LEVELS.map((lv) => (
            <button
              key={lv.key}
              onClick={() => {
                setLevel(lv.key);
                setVariant(null);
                setStep("variant");
              }}
              style={selectCard(level === lv.key)}
            >
              <div style={{ fontSize: 40, marginBottom: 10 }}>{lv.icon}</div>
              <div style={{ font: "800 20px Cinzel,serif", color: "var(--gold-lt)", marginBottom: 5 }}>{lv.title}</div>
              <div style={{ font: "500 12px/1.5 Inter", color: "var(--ink)" }}>{lv.blurb}</div>
            </button>
          ))}
        </div>
      )}

      {step === "variant" && level && (
        <div className="fd-diff-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
          {variantsFor(level).map((v) => {
            const sel = variant === v.key;
            return (
              <button
                key={v.key}
                onClick={() => {
                  if (!v.enabled) {
                    showToast(`${v.label} is coming soon.`);
                    return;
                  }
                  setVariant(v.key);
                  setStep("opponent");
                }}
                style={{ ...selectCard(sel), opacity: v.enabled ? 1 : 0.62, cursor: v.enabled ? "pointer" : "not-allowed", textAlign: "left", position: "relative" }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                  <span style={{ font: "800 17px Cinzel,serif", color: "var(--gold-lt)" }}>{v.label}</span>
                  {v.enabled ? (
                    <span style={badge("#8ce0ad", "rgba(50,150,100,.18)")}>Playable</span>
                  ) : (
                    <span style={badge("#c9a6ff", "rgba(140,90,210,.2)")}>Coming Soon</span>
                  )}
                </div>
                <div style={{ font: "600 11px Inter", color: "var(--gold)", marginBottom: 4 }}>{v.grade}</div>
                <div style={{ font: "500 12px/1.5 Inter", color: "var(--ink)" }}>{v.system}</div>
              </button>
            );
          })}
        </div>
      )}

      {step === "opponent" && variant && (
        <div>
          <div style={{ textAlign: "center", marginBottom: 16, font: "600 13px Inter", color: "var(--ink2)" }}>
            {variantInfo(variant)?.label} · choose your opponent
          </div>
          <div className="fd-diff-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
            {OPPONENTS.map((o) => (
              <button
                key={o.key}
                onClick={() => {
                  if (!o.ready) {
                    showToast(`${o.title} arrives in a later update.`);
                    return;
                  }
                  if (o.key === "ai") setStep("difficulty");
                  else startLocal(variant);
                }}
                style={{ ...selectCard(false), opacity: o.ready ? 1 : 0.6, cursor: o.ready ? "pointer" : "not-allowed" }}
              >
                <div style={{ fontSize: 34, marginBottom: 8 }}>{o.icon}</div>
                <div style={{ font: "800 17px Cinzel,serif", color: "var(--gold-lt)", marginBottom: 4 }}>{o.title}</div>
                <div style={{ font: "500 12px/1.5 Inter", color: "var(--ink)" }}>{o.blurb}</div>
                {!o.ready && <div style={{ marginTop: 8, ...inlineBadge }}>Coming Soon</div>}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === "difficulty" && variant && (
        <div>
          <div style={{ textAlign: "center", marginBottom: 16, font: "600 13px Inter", color: "var(--ink2)" }}>
            {variantInfo(variant)?.label} · vs AI · pick a difficulty
          </div>
          <div className="fd-diff-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
            {DIFFICULTIES.map((d) => (
              <button key={d.key} onClick={() => startAi(variant, d.key)} style={selectCard(false)}>
                <div style={{ font: "800 18px Cinzel,serif", color: "var(--gold-lt)", marginBottom: 5 }}>{d.title}</div>
                <div style={{ font: "500 12px/1.5 Inter", color: "var(--ink)" }}>{d.blurb}</div>
                <div style={{ marginTop: 12, display: "flex", gap: 4, justifyContent: "center" }}>
                  {[0, 1, 2].map((i) => (
                    <span key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: i < d.dots ? d.color : "rgba(232,184,75,.18)" }} />
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 28 }}>
        <button onClick={() => navigate("/play")} style={backBtn}>
          ← Back to Play
        </button>
        {step !== "level" && (
          <Button
            variant="purple"
            onClick={() =>
              setStep(
                step === "difficulty" ? "opponent" : step === "opponent" ? "variant" : "level",
              )
            }
          >
            ‹ Previous step
          </Button>
        )}
      </div>
    </div>
  );
}

function Crumb({
  n,
  label,
  done,
  active,
  disabled,
  onClick,
}: {
  n: number;
  label: string;
  done: boolean;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 14px",
        borderRadius: 100,
        cursor: disabled ? "default" : "pointer",
        border: `1px solid ${active ? "rgba(245,215,131,.6)" : "rgba(232,184,75,.18)"}`,
        background: active ? "rgba(245,215,131,.1)" : "rgba(15,8,32,.5)",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          font: "700 11px 'JetBrains Mono',monospace",
          background: done ? "linear-gradient(180deg,#f0cf72,#c99a2e)" : "rgba(232,184,75,.18)",
          color: done ? "#2a1a05" : "var(--ink2)",
        }}
      >
        {done ? "✓" : n}
      </span>
      <span style={{ font: "700 12px Inter", color: active ? "var(--gold-lt)" : "var(--ink)" }}>{label}</span>
    </button>
  );
}

function selectCard(sel: boolean): React.CSSProperties {
  return {
    textAlign: "center",
    padding: "22px 16px",
    borderRadius: 14,
    cursor: "pointer",
    transition: ".15s",
    background: sel ? "rgba(232,184,75,.08)" : "rgba(15,8,32,.5)",
    border: `1.5px solid ${sel ? "rgba(245,215,131,.5)" : "rgba(232,184,75,.16)"}`,
    boxShadow: sel ? "0 0 22px rgba(232,184,75,.14)" : "none",
  };
}

function badge(color: string, bg: string): React.CSSProperties {
  return {
    font: "700 9px Inter",
    letterSpacing: 1,
    textTransform: "uppercase",
    color,
    background: bg,
    padding: "3px 8px",
    borderRadius: 100,
    flex: "none",
  };
}

const inlineBadge: React.CSSProperties = {
  display: "inline-block",
  font: "700 9px Inter",
  letterSpacing: 1,
  textTransform: "uppercase",
  color: "#c9a6ff",
  background: "rgba(140,90,210,.2)",
  padding: "3px 8px",
  borderRadius: 100,
};

const backBtn: React.CSSProperties = {
  padding: "14px 26px",
  borderRadius: 8,
  border: "1px solid rgba(232,184,75,.35)",
  background: "rgba(15,8,32,.5)",
  color: "var(--gold-lt)",
  font: "700 13px Inter",
  letterSpacing: 1,
  textTransform: "uppercase",
  cursor: "pointer",
};

export default DamathHubPage;
