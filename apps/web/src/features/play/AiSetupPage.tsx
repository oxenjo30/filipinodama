import { useNavigate } from "react-router-dom";
import type { AiDifficulty } from "@dama/shared";
import { Button } from "../../components";
import { diffEmblem, type DiffEmblemKey } from "../../lib/emblems";
import { useSettingsStore } from "../../stores/settingsStore";

type Level = {
  key: AiDifficulty & DiffEmblemKey;
  label: string;
  desc: string;
  color: string;
  ring: string;
  tint: string;
  dots: number;
};

const LEVELS: Level[] = [
  {
    key: "easy",
    label: "Easy",
    desc: "A gentle opponent. Great for learning the ropes and trying new tactics.",
    color: "#3fbf6f",
    ring: "rgba(63,191,111,.5)",
    tint: "rgba(63,191,111,.14)",
    dots: 1,
  },
  {
    key: "normal",
    label: "Normal",
    desc: "A balanced challenge that punishes loose moves. A fair, steady fight.",
    color: "#E8B84B",
    ring: "rgba(232,184,75,.5)",
    tint: "rgba(232,184,75,.14)",
    dots: 2,
  },
  {
    key: "hard",
    label: "Hard",
    desc: "A ruthless tactician that hunts every capture. Bring your best game.",
    color: "#d63b52",
    ring: "rgba(214,59,82,.5)",
    tint: "rgba(214,59,82,.14)",
    dots: 3,
  },
];

export function AiSetupPage() {
  const navigate = useNavigate();
  const difficulty = useSettingsStore((s) => s.difficulty);
  const setDifficulty = useSettingsStore((s) => s.setDifficulty);

  const selectedLabel = LEVELS.find((l) => l.key === difficulty)?.label ?? "Normal";

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "40px 26px 60px" }}>
      <div style={{ textAlign: "center", marginBottom: 30 }}>
        <div style={{ font: "700 12px Inter", letterSpacing: 3, color: "var(--gold)" }}>
          ✦ OFFLINE PRACTICE ✦
        </div>
        <h1 style={{ margin: "10px 0 6px", font: "800 clamp(28px,4vw,40px) Cinzel,serif" }}>
          <span
            style={{
              background: "linear-gradient(180deg,#f7e2a0,#d5a63a)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            Play vs AI
          </span>
        </h1>
        <p style={{ font: "400 14px Inter", color: "var(--ink)", margin: 0 }}>
          Choose your opponent's strength, then start the match.
        </p>
      </div>

      <div className="fd-diff-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 26 }}>
        {LEVELS.map((lv) => {
          const sel = difficulty === lv.key;
          return (
            <button
              key={lv.key}
              onClick={() => setDifficulty(lv.key)}
              style={{
                textAlign: "center",
                padding: "22px 16px",
                borderRadius: 14,
                cursor: "pointer",
                transition: ".15s",
                background: sel ? "rgba(232,184,75,.08)" : "rgba(15,8,32,.5)",
                border: `1.5px solid ${sel ? lv.ring : "rgba(232,184,75,.16)"}`,
                boxShadow: sel ? `0 0 22px ${lv.tint}` : "none",
              }}
            >
              <div style={{ width: 64, height: 64, margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <img src={diffEmblem(lv.key)} alt="" style={{ width: 58, height: 58, objectFit: "contain" }} />
              </div>
              <div style={{ font: "800 18px Cinzel,serif", color: "var(--gold-lt)", marginBottom: 5 }}>{lv.label}</div>
              <div style={{ font: "500 12px/1.5 Inter", color: "var(--ink)" }}>{lv.desc}</div>
              <div style={{ marginTop: 12, display: "flex", gap: 4, justifyContent: "center" }}>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: i < lv.dots ? lv.color : "rgba(232,184,75,.18)",
                    }}
                  />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
        <button
          onClick={() => navigate("/play")}
          style={{
            padding: "14px 26px",
            borderRadius: 8,
            border: "1px solid rgba(232,184,75,.35)",
            background: "rgba(15,8,32,.5)",
            color: "var(--gold-lt)",
            font: "700 13px Inter",
            letterSpacing: 1,
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          ← Back
        </button>
        <Button
          variant="red"
          onClick={() => navigate("/play/ai/game")}
          style={{ fontSize: 15, padding: "15px 40px" }}
        >
          ⚔ Start Match · {selectedLabel}
        </Button>
      </div>
    </div>
  );
}

export default AiSetupPage;
