import type { PieceColor } from "@dama/shared";
import type { PieceSkin } from "../lib/assets";

/**
 * Piece-face palette per colour. Classic glossy Dama discs — deep crimson and
 * royal blue with a bright specular top-left, matching the approved redesign
 * mockup (round checker discs, NOT figurine art). Skins re-tint the same disc.
 */
const FACE: Record<PieceColor, { face: string; rim: string; ringLo: string }> = {
  red: {
    face: "radial-gradient(circle at 36% 26%,#ff9aa0 0%,#e5434f 34%,#b3222e 62%,#7a1420 100%)",
    rim: "#5c0f18",
    ringLo: "rgba(120,20,30,.85)",
  },
  blue: {
    face: "radial-gradient(circle at 36% 26%,#a3c8ff 0%,#3f79d6 34%,#255aa8 62%,#153a72 100%)",
    rim: "#0f2b57",
    ringLo: "rgba(20,45,95,.85)",
  },
};

/** Skin re-tints for the disc (all round discs — the prototype's skin variants). */
const SKIN_FACE: Partial<Record<Exclude<PieceSkin, "default">, Record<PieceColor, { face: string; rim: string; ringLo: string }>>> = {
  jade: {
    red: { face: "radial-gradient(circle at 36% 26%,#ffd9a0 0%,#e8a23c 34%,#b8781f 62%,#7a4d12 100%)", rim: "#5c3a0f", ringLo: "rgba(120,80,20,.85)" },
    blue: { face: "radial-gradient(circle at 36% 26%,#b8f0d0 0%,#3fbf7a 34%,#2a8f57 62%,#175236 100%)", rim: "#0f3a22", ringLo: "rgba(20,80,50,.85)" },
  },
  crimson: {
    red: { face: "radial-gradient(circle at 36% 26%,#ffb0a8 0%,#d63b46 34%,#a01f2b 62%,#66101a 100%)", rim: "#4d0c14", ringLo: "rgba(110,18,26,.85)" },
    blue: { face: "radial-gradient(circle at 36% 26%,#e6c3ff 0%,#8b5cf0 34%,#5f3ab0 62%,#3a2270 100%)", rim: "#281550", ringLo: "rgba(55,30,110,.85)" },
  },
  obsidian: {
    red: { face: "radial-gradient(circle at 36% 26%,#c98a92 0%,#7a3a44 34%,#4d222a 62%,#2a1218 100%)", rim: "#1a0c10", ringLo: "rgba(60,25,32,.85)" },
    blue: { face: "radial-gradient(circle at 36% 26%,#8a9ab8 0%,#3a4a6e 34%,#22304d 62%,#12182a 100%)", rim: "#0a0e18", ringLo: "rgba(25,35,55,.85)" },
  },
  // ── New premium skins: ruby-red vs sapphire-blue enamel discs (matching the
  //    generated coin art), each with a subtle motif-flavoured tint. ──
  sarimanok: {
    red: { face: "radial-gradient(circle at 36% 26%,#ffc9a0 0%,#e04a3a 34%,#a51f1f 62%,#5f0f12 100%)", rim: "#4a0c0e", ringLo: "rgba(110,20,20,.85)" },
    blue: { face: "radial-gradient(circle at 36% 26%,#bfe0ff 0%,#3f7fe0 34%,#274fa5 62%,#132f5f 100%)", rim: "#0e1c4a", ringLo: "rgba(20,45,110,.85)" },
  },
  bakunawa: {
    red: { face: "radial-gradient(circle at 36% 26%,#ffb8b0 0%,#d63b46 34%,#8f1f2b 62%,#54101a 100%)", rim: "#3d0c14", ringLo: "rgba(100,18,26,.85)" },
    blue: { face: "radial-gradient(circle at 36% 26%,#aecdf5 0%,#3a6ae0 34%,#233f9c 62%,#12235f 100%)", rim: "#0c1a4a", ringLo: "rgba(18,35,100,.85)" },
  },
  sunstars: {
    red: { face: "radial-gradient(circle at 36% 26%,#ffd0a0 0%,#e5502e 34%,#a83320 62%,#601a12 100%)", rim: "#4a1408", ringLo: "rgba(110,45,20,.85)" },
    blue: { face: "radial-gradient(circle at 36% 26%,#bcdcff 0%,#3f78d8 34%,#274fa0 62%,#132f60 100%)", rim: "#0e1e50", ringLo: "rgba(20,45,100,.85)" },
  },
  tamaraw: {
    red: { face: "radial-gradient(circle at 36% 26%,#ffc4a8 0%,#d84a2e 34%,#a3341e 62%,#5c1c10 100%)", rim: "#451408", ringLo: "rgba(105,40,20,.85)" },
    blue: { face: "radial-gradient(circle at 36% 26%,#b6d4f0 0%,#3a6ac8 34%,#22406e 62%,#12233f 100%)", rim: "#0c1a3a", ringLo: "rgba(18,35,80,.85)" },
  },
  baybayin: {
    red: { face: "radial-gradient(circle at 36% 26%,#ffbca8 0%,#d13b3b 34%,#9c1f28 62%,#5a1018 100%)", rim: "#420c12", ringLo: "rgba(105,18,24,.85)" },
    blue: { face: "radial-gradient(circle at 36% 26%,#c0d8ff 0%,#4470e0 34%,#2a479c 62%,#152a5f 100%)", rim: "#101e4a", ringLo: "rgba(22,40,100,.85)" },
  },
};

export type PieceProps = {
  color: PieceColor;
  king?: boolean;
  /** disc tint skin ("default" = classic crimson/royal) */
  skin?: PieceSkin;
  /** gold selection ring */
  selected?: boolean;
  /** green must-capture glow */
  glow?: boolean;
};

/**
 * Piece — a single glossy Dama disc, rendered entirely in CSS (no image files).
 *
 * A layered disc that matches the approved redesign: radial-gradient face + dark
 * rim, a raised concentric inner ring (the classic checker groove), a top-left
 * specular highlight, and a gold ♛ crown for kings. Selected → gold ring;
 * must-capture → green glow ring. Sized to fill its Board cell (80% of a square).
 */
export function Piece({ color, king = false, skin = "default", selected = false, glow = false }: PieceProps) {
  const pal =
    skin !== "default" && SKIN_FACE[skin as Exclude<PieceSkin, "default">]
      ? SKIN_FACE[skin as Exclude<PieceSkin, "default">]![color]
      : FACE[color];

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
        // Drop-shadow separates the disc from LIGHT squares; a faint bright halo
        // separates it from DARK squares (e.g. an obsidian skin on the obsidian
        // board). Together they keep EVERY skin legible on EVERY board theme.
        filter:
          "drop-shadow(0 5px 7px rgba(0,0,0,.6)) drop-shadow(0 0 1.5px rgba(255,255,255,.5))",
      }}
    >
      {/* outer disc: glossy face + dark bevel rim */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: pal.face,
          boxShadow:
            "inset 0 -6px 10px rgba(0,0,0,.55), inset 0 5px 8px rgba(255,255,255,.42), 0 0 0 2px " +
            (king ? "#F5D783" : pal.rim) +
            (ringColor ? stateRing : ""),
        }}
      >
        {/* raised concentric ring (the classic checker groove) */}
        <div
          style={{
            position: "absolute",
            inset: "17%",
            borderRadius: "50%",
            border: `2px solid ${pal.ringLo}`,
            boxShadow:
              "inset 0 2px 3px rgba(0,0,0,.5), inset 0 -2px 2px rgba(255,255,255,.2), 0 1px 0 rgba(255,255,255,.15)",
          }}
        />
        {/* inner disc face for depth */}
        <div
          style={{
            position: "absolute",
            inset: "27%",
            borderRadius: "50%",
            background: pal.face,
            boxShadow: "inset 0 3px 6px rgba(0,0,0,.4), inset 0 -2px 4px rgba(255,255,255,.25)",
          }}
        />
        {/* specular highlight */}
        <div
          style={{
            position: "absolute",
            top: "10%",
            left: "18%",
            width: "44%",
            height: "30%",
            borderRadius: "50%",
            background: "radial-gradient(circle,rgba(255,255,255,.7),transparent 70%)",
          }}
        />
        {/* king crown */}
        {king && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "clamp(11px,2.8vw,22px)",
              color: "#F7E29A",
              textShadow: "0 1px 3px rgba(0,0,0,.75), 0 0 6px rgba(247,226,154,.5)",
            }}
          >
            ♛
          </div>
        )}
      </div>
    </div>
  );
}

export default Piece;
