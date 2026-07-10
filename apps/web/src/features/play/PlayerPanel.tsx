import type { PieceColor } from "@dama/shared";
import { Avatar } from "../../components";

export type PlayerPanelProps = {
  name: string;
  rating: number | string;
  color: PieceColor;
  /** avatar key or path */
  avatar: string;
  /** equipped profile-frame item id, overlaid on the avatar (optional) */
  frame?: string;
  /** highlight the panel + show "thinking"/turn state when it's this player's turn */
  active: boolean;
  /** number of pieces this player has captured (0–12) */
  captured: number;
  /** show a "Thinking…" label instead of the turn dot (AI panel while pondering) */
  thinking?: boolean;
};

/**
 * StatusBanner — the turn/status pill ("Your move" / "Waiting" / "Thinking…").
 *
 * Rendered OUTSIDE and ABOVE the player card so it never competes with — or
 * overlaps — long player names inside the card. The active player's pill is
 * highlighted (green for "Your move", gold spinner for "Thinking…"); the idle
 * player's is a muted "Waiting" pill. `whiteSpace: nowrap` keeps the short
 * label on one line.
 */
function StatusBanner({ active, thinking }: { active: boolean; thinking: boolean }) {
  const highlighted = thinking || active;
  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          padding: "5px 14px",
          borderRadius: 999,
          whiteSpace: "nowrap",
          border: `1px solid ${highlighted ? "rgba(63,191,111,.5)" : "rgba(232,184,75,.3)"}`,
          background: thinking
            ? "rgba(232,184,75,.12)"
            : active
              ? "rgba(50,150,100,.18)"
              : "rgba(15,8,32,.6)",
        }}
      >
        {thinking ? (
          <>
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                border: "2px solid rgba(232,184,75,.3)",
                borderTopColor: "var(--gold)",
                display: "inline-block",
                animation: "fdspin .8s linear infinite",
              }}
            />
            <span style={{ font: "700 12px Inter", color: "var(--gold-lt)" }}>Thinking…</span>
          </>
        ) : (
          <>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: active ? "#3fbf6f" : "rgba(255,255,255,.25)",
                boxShadow: active ? "0 0 8px #3fbf6f" : undefined,
              }}
            />
            <span style={{ font: "700 12px Inter", color: active ? "#8ce0ad" : "var(--ink2)" }}>
              {active ? "Your move" : "Waiting"}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * PlayerPanel — the in-game player card (built locally; not in the shared lib).
 *
 * Mirrors the prototype's `playerCard`: colour-tinted `.frame`, avatar, ✦ name,
 * 🏆 rating, a turn/status chip, and a row of captured-piece dots. When it's this
 * player's turn the frame gets a gold inner ring + glow.
 */
export function PlayerPanel({
  name,
  rating,
  color,
  avatar,
  frame,
  active,
  captured,
  thinking = false,
}: PlayerPanelProps) {
  const isRed = color === "red";
  const tint = isRed ? "rgba(120,30,42,.35)" : "rgba(30,55,110,.35)";
  // Captured pieces are the OPPONENT's colour discs (what this player took).
  const dotFill = isRed
    ? "radial-gradient(circle at 35% 30%,#5f97e6,#1f4a92)" // red captured blue discs
    : "radial-gradient(circle at 35% 30%,#e0555f,#8f1b28)"; // blue captured red discs

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Status pill lives OUTSIDE the card, above it, so it can never overlap a
          long player name inside the card. */}
      <StatusBanner active={active} thinking={thinking} />
      <div
        className="frame fd-panel-compact"
        style={{
          padding: 16,
          backgroundColor: tint,
          boxShadow: active
            ? "inset 0 0 0 4px rgba(15,8,32,.55),inset 0 0 0 5px rgba(232,184,75,.35),0 0 22px rgba(232,184,75,.2)"
            : undefined,
        }}
      >
        {/* Header: avatar + name + rating. The name now has the card's full width
            (no inline badge beside it), so long names wrap cleanly. */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar src={avatar} frame={frame} size={54} className="fd-panel-avatar" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                font: "700 16px Inter",
                color: "#fff",
              }}
            >
              <span style={{ color: "var(--gold)", fontSize: 12, flex: "none" }}>✦</span>
              <span
                style={{
                  // Allow the name up to two lines so long names (e.g. "Tactician
                  // Bot", "Grandmaster Bot", long usernames) are never clipped to
                  // an ellipsis; only clamp beyond two lines.
                  display: "-webkit-box",
                  WebkitBoxOrient: "vertical",
                  WebkitLineClamp: 2,
                  overflow: "hidden",
                  lineHeight: 1.15,
                  wordBreak: "break-word",
                }}
              >
                {name}
              </span>
            </div>
            <div style={{ font: "700 12px 'JetBrains Mono',monospace", color: "var(--gold)", marginTop: 2 }}>
              🏆 {rating}
            </div>
          </div>
        </div>
        <div
          style={{
            font: "600 10px Inter",
            letterSpacing: "1.5px",
            color: "var(--ink2)",
            textAlign: "center",
            margin: "12px 0 8px",
          }}
        >
          CAPTURED PIECES
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <span
              key={i}
              className="fd-capture-dot"
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: i < captured ? dotFill : "rgba(0,0,0,.35)",
                border: "1px solid rgba(232,184,75,.3)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default PlayerPanel;
