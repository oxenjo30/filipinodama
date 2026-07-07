import type { PieceColor } from "@dama/shared";
import { Avatar } from "../../components";

export type PlayerPanelProps = {
  name: string;
  rating: number | string;
  color: PieceColor;
  /** avatar key or path */
  avatar: string;
  /** highlight the panel + show "thinking"/turn state when it's this player's turn */
  active: boolean;
  /** number of pieces this player has captured (0–12) */
  captured: number;
  /** show a "Thinking…" label instead of the turn dot (AI panel while pondering) */
  thinking?: boolean;
};

/**
 * StatusBadge — the turn/status chip ("Your move" / "Waiting" / "Thinking…").
 *
 * Rendered on its own row beneath the player name so it never overlaps long
 * names. `whiteSpace: nowrap` keeps the label itself on one line; `flex: none`
 * stops it from being squeezed by the rating on the same row.
 */
function StatusBadge({ active, thinking }: { active: boolean; thinking: boolean }) {
  return (
    <div
      style={{
        flex: "none",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 10px",
        borderRadius: 8,
        border: "1px solid rgba(232,184,75,.4)",
        background: "rgba(0,0,0,.35)",
        whiteSpace: "nowrap",
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
              background: active ? "#3fbf6f" : "rgba(255,255,255,.2)",
              boxShadow: active ? "0 0 8px #3fbf6f" : undefined,
            }}
          />
          <span style={{ font: "700 12px Inter", color: active ? "#fff" : "var(--ink2)" }}>
            {active ? "Your move" : "Waiting"}
          </span>
        </>
      )}
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
    <div
      className="frame"
      style={{
        padding: 16,
        backgroundColor: tint,
        boxShadow: active
          ? "inset 0 0 0 4px rgba(15,8,32,.55),inset 0 0 0 5px rgba(232,184,75,.35),0 0 22px rgba(232,184,75,.2)"
          : undefined,
      }}
    >
      {/* Header: avatar + (name / rating / status). The status badge lives on its
          own row beneath the name so it never competes for horizontal space with
          long player names — a long name simply wraps to a second line above the
          badge instead of colliding with it. */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Avatar src={avatar} size={54} />
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              marginTop: 4,
            }}
          >
            <span style={{ font: "700 12px 'JetBrains Mono',monospace", color: "var(--gold)" }}>
              🏆 {rating}
            </span>
            <StatusBadge active={active} thinking={thinking} />
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
  );
}

export default PlayerPanel;
