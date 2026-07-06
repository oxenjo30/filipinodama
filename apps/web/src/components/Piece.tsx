import { useState } from "react";
import type { PieceColor } from "@dama/shared";
import { pieceArt, type PieceSkin } from "../lib/assets";

/** Piece-face palette per color (radial gradient + rim), ported from the
 *  prototype's default "Classic" skin. Used for the CSS-disc fallback. */
const FACE: Record<PieceColor, { face: string; rim: string }> = {
  red: {
    face: "radial-gradient(circle at 38% 27%,#ff8790 0%,#e5434f 38%,#a81f2b 70%,#67101a 100%)",
    rim: "#7a1420",
  },
  blue: {
    face: "radial-gradient(circle at 38% 27%,#8fbcff 0%,#3f79d6 38%,#1f4a92 70%,#122f63 100%)",
    rim: "#122f5c",
  },
};

export type PieceProps = {
  color: PieceColor;
  king?: boolean;
  /** piece art skin ("default" uses the glossy transparent .webp) */
  skin?: PieceSkin;
  /** gold selection ring */
  selected?: boolean;
  /** green must-capture glow */
  glow?: boolean;
  /** force the CSS radial-gradient disc instead of the image art */
  disc?: boolean;
};

/**
 * Piece — a single glossy playing disc.
 *
 * Two render modes, matching the prototype 1:1:
 *  - image art (default): the transparent skin .webp/.png, insets `-11%` so the
 *    sculpted piece slightly overflows its cell, with a drop-shadow and an
 *    optional coloured glow halo for selected/must-capture.
 *  - CSS disc (fallback, or `disc`): layered radial-gradient face + rim, inner
 *    ring, top-left specular highlight, and a ♛ for kings. Selected → gold ring,
 *    must-capture → green glow ring.
 *
 * Sized to fill its parent (the Board cell wraps it at 80% of the square).
 */
export function Piece({
  color,
  king = false,
  skin = "default",
  selected = false,
  glow = false,
  disc = false,
}: PieceProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const useImage = !disc && !imgFailed;

  const pal = FACE[color];
  const ringColor = glow ? "rgba(120,240,160,.95)" : selected ? "#F5D783" : null;

  if (useImage) {
    const haloColor = glow ? "rgba(120,240,160,1)" : selected ? "rgba(245,215,131,1)" : null;
    const filter =
      "drop-shadow(0 3px 5px rgba(0,0,0,.6))" +
      (haloColor ? ` drop-shadow(0 0 6px ${haloColor}) drop-shadow(0 0 5px ${haloColor})` : "");
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          margin: "auto",
          width: "80%",
          height: "80%",
          borderRadius: "50%",
        }}
      >
        <img
          src={pieceArt(color, king, skin)}
          alt={`${color} ${king ? "king" : "man"}`}
          draggable={false}
          onError={() => setImgFailed(true)}
          style={{
            position: "absolute",
            inset: "-11%",
            width: "122%",
            height: "122%",
            objectFit: "contain",
            pointerEvents: "none",
            filter,
          }}
        />
      </div>
    );
  }

  // CSS-disc fallback (matches the prototype's procedural piece exactly).
  const ring = glow
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
        width: "80%",
        height: "80%",
        borderRadius: "50%",
        filter: "drop-shadow(0 5px 6px rgba(0,0,0,.6))",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: pal.face,
          boxShadow:
            "inset 0 -5px 9px rgba(0,0,0,.55), inset 0 4px 7px rgba(255,255,255,.4), 0 0 0 2px " +
            (king ? "#F5D783" : pal.rim) +
            (ringColor ? ring : ""),
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "19%",
            borderRadius: "50%",
            border: "2px solid rgba(255,255,255,.18)",
            boxShadow: "inset 0 1px 2px rgba(0,0,0,.45), inset 0 -1px 1px rgba(255,255,255,.15)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "11%",
            left: "19%",
            width: "46%",
            height: "32%",
            borderRadius: "50%",
            background: "radial-gradient(circle,rgba(255,255,255,.65),transparent 70%)",
          }}
        />
        {king && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "clamp(11px,2.7vw,21px)",
              color: "#F7E29A",
              textShadow: "0 1px 3px rgba(0,0,0,.7)",
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
