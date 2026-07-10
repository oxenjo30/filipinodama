import type { DamathExpr, DamathPlayerId } from "@dama/shared";
import { formatChip } from "./chipDisplay";

/**
 * Piece-face palette per player. Same glossy-disc language as Classic's
 * <Piece/> (crimson Red vs royal Blue), but a Damath chip's identity is its
 * NUMBER, so the disc is a quiet frame for a bold, legible value.
 */
const FACE: Record<DamathPlayerId, { face: string; rim: string; ink: string }> = {
  red: {
    face: "radial-gradient(circle at 36% 26%,#ff9aa0 0%,#e5434f 34%,#b3222e 62%,#7a1420 100%)",
    rim: "#5c0f18",
    ink: "#fff2f2",
  },
  blue: {
    face: "radial-gradient(circle at 36% 26%,#a3c8ff 0%,#3f79d6 34%,#255aa8 62%,#153a72 100%)",
    rim: "#0f2b57",
    ink: "#eff5ff",
  },
};

export type DamathPieceProps = {
  player: DamathPlayerId;
  value: number;
  /** symbolic form for non-plain-numeric variants (fraction/radical/poly/binary) */
  expr?: DamathExpr;
  dama?: boolean;
  /** gold selection ring */
  selected?: boolean;
  /** must-capture glow */
  glow?: boolean;
};

/**
 * DamathPiece — a glossy numbered chip. The value is the hero: large, high-
 * contrast, centred. A dama gets a gold rim + a small ♛ so its doubled scoring
 * reads at a glance. Sized to fill its board cell like Classic's disc.
 */
export function DamathPiece({
  player,
  value,
  expr,
  dama = false,
  selected = false,
  glow = false,
}: DamathPieceProps) {
  const pal = FACE[player];
  const label = formatChip(value, expr);
  // Longer labels (fractions, radicals, monomials, binary) shrink to fit the disc.
  const fontSize =
    label.length <= 2
      ? "clamp(13px,3.4vw,26px)"
      : label.length <= 4
        ? "clamp(10px,2.6vw,19px)"
        : "clamp(8px,2vw,15px)";
  const ringColor = glow ? "rgba(120,240,160,.95)" : selected ? "#F5D783" : null;
  const stateRing = glow
    ? ", 0 0 0 4px rgba(120,240,160,.95), 0 0 18px rgba(90,220,130,.6)"
    : selected
      ? ", 0 0 0 4px #F5D783, 0 0 16px rgba(245,215,131,.65)"
      : "";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        margin: "auto",
        width: "82%",
        height: "82%",
        borderRadius: "50%",
        filter:
          "drop-shadow(0 5px 7px rgba(0,0,0,.6)) drop-shadow(0 0 1.5px rgba(255,255,255,.5))",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: pal.face,
          boxShadow:
            "inset 0 -6px 10px rgba(0,0,0,.55), inset 0 5px 8px rgba(255,255,255,.42), 0 0 0 2px " +
            (dama ? "#F5D783" : pal.rim) +
            (ringColor ? stateRing : ""),
        }}
      >
        {/* raised concentric groove */}
        <div
          style={{
            position: "absolute",
            inset: "13%",
            borderRadius: "50%",
            border: `2px solid ${dama ? "rgba(245,215,131,.55)" : "rgba(0,0,0,.28)"}`,
            boxShadow: "inset 0 2px 3px rgba(0,0,0,.4)",
          }}
        />
        {/* the value — the hero of the chip (variant-formatted) */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 6%",
            textAlign: "center",
            color: pal.ink,
            font: `800 ${fontSize} 'JetBrains Mono', monospace`,
            textShadow: "0 1px 2px rgba(0,0,0,.7), 0 0 5px rgba(0,0,0,.4)",
            lineHeight: 1,
            userSelect: "none",
            wordBreak: "break-all",
          }}
        >
          {label}
        </div>
        {/* dama crown, tucked top-centre so it never fights the number */}
        {dama && (
          <div
            style={{
              position: "absolute",
              top: "4%",
              left: 0,
              right: 0,
              textAlign: "center",
              fontSize: "clamp(7px,1.7vw,13px)",
              color: "#F7E29A",
              textShadow: "0 1px 2px rgba(0,0,0,.8)",
              pointerEvents: "none",
            }}
          >
            ♛
          </div>
        )}
        {/* specular highlight */}
        <div
          style={{
            position: "absolute",
            top: "9%",
            left: "16%",
            width: "42%",
            height: "26%",
            borderRadius: "50%",
            background: "radial-gradient(circle,rgba(255,255,255,.55),transparent 70%)",
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
}

export default DamathPiece;
