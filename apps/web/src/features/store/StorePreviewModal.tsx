import type { CSSProperties, ReactNode } from "react";
import type { PieceColor } from "@dama/shared";
import { Piece } from "../../components/Piece";
import type { PieceSkin } from "../../lib/assets";

/**
 * StorePreviewModal — a faithful reproduction of the prototype's store item
 * preview modal (handoff/FilipinoDama Royal.dc.html, modal at lines 2577-2596 +
 * its art builder `storePreviewArt(pv)` at ~line 2880).
 *
 * The prototype modal is a centred, dimmed, click-outside-to-dismiss overlay with
 * an ornate `.frame` card: an "Item Preview" gold eyebrow, a Cinzel gold title,
 * an uppercase sub-label, a big (min-height 240px) art area whose contents depend
 * on the item type, a price row (coin/gem icon + amount, optional struck-through
 * old price), and either an "✓ Already Owned" chip or an "Add to Cart" gold
 * button, plus a ✕ close button.
 *
 * The art area reproduces each `pv.kind` from the prototype:
 *   - board  → the board texture (or a generated 6×6 board) in a big rounded card
 *   - skin   → red + blue man→king coins for that skin (flat skin art PNGs where
 *              they exist under public/assets, else the CSS <Piece> disc)
 *   - avatar → the portrait in a masked, gold-ringed circle
 *   - frame  → an avatar behind the frame overlay art
 *
 * Everything here is presentation only. The name, sub, price, currency, owned
 * state, and the Add-to-Cart / Buy action are passed in from the live catalog.
 */

const A = (n: string) => `/assets/${n}`;

export type PreviewKind = "board" | "skin" | "avatar" | "frame";

export type StorePreview = {
  kind: PreviewKind;
  name: string;
  sub: string;
  /** coin | gem — drives the price icon + colour */
  cur: "gold" | "gem";
  price: number;
  free: boolean;
  owned: boolean;
  /** board texture file (e.g. "board-marble.png") — for kind==="board" */
  boardFile?: string;
  /** flat piece-art skin key ("crimson" | "jade" | "obsidian") if art PNGs exist */
  skinArt?: "crimson" | "jade" | "obsidian";
  /** CSS <Piece> disc skin fallback (default | crimson | jade | obsidian) */
  pieceSkin?: PieceSkin;
  /** portrait file (e.g. "avatars/sovereign.png" or "babaylan.webp") — avatar/skin-portrait */
  portraitFile?: string;
  /** frame overlay file (e.g. "frames/laurel.png") — for kind==="frame" */
  frameFile?: string;
};

const curColor = (c: "gold" | "gem") => (c === "gem" ? "#ff9aa8" : "#f2d493");

function CurIcon({ cur, size = 20 }: { cur: "gold" | "gem"; size?: number }) {
  return (
    <img
      src={cur === "gem" ? A("ic-gem.png") : A("ic-coin.png")}
      alt={cur === "gem" ? "Diamonds" : "Gold"}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}

// ── one animated coin column: man → king for a colour, matching the prototype's
//    skinCoin (a labelled stack under the coin art). Uses flat skin-art PNGs when
//    available (crimson-/jade-/obsidian-<color>-<man|king>.png), else CSS <Piece>.
/**
 * SkinCoin — the prototype's animated 3D coin (skinCoin, line 2869): a piece that
 * gently bobs (fdcoinbob), flips in 3D from soldier → king (fdcoinflip) showing
 * the man on the front face and the king on the back, with a sheen sweep and a
 * pulsing ground shadow. `delay` offsets the red/blue coins.
 */
function SkinCoin({ color, skinArt, pieceSkin, label, labelColor, delay }: { color: PieceColor; skinArt?: "crimson" | "jade" | "obsidian"; pieceSkin: PieceSkin; label: string; labelColor: string; delay: string }) {
  const S = 116;

  // Default "Classic" skin (no skinArt) → render the procedural CSS disc, which
  // is exactly what the prototype's default pieces are. NO character webp art.
  if (!skinArt) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <div style={{ width: S, height: S, position: "relative", animation: "fdcoinbob 3s ease-in-out infinite", animationDelay: delay }}>
          <Piece color={color} king={false} skin={pieceSkin} />
        </div>
        <span style={{ color: "var(--gold)", font: "700 18px Inter" }}>→</span>
        <div style={{ width: S, height: S, position: "relative", animation: "fdcoinbob 3s ease-in-out infinite", animationDelay: delay }}>
          <Piece color={color} king skin={pieceSkin} />
        </div>
        <div style={{ marginTop: 6, font: "700 11px Inter", letterSpacing: "2px", textTransform: "uppercase", color: labelColor }}>{label}</div>
      </div>
    );
  }

  // Premium skin: real coin art with the 3D flip.
  const artFor = (king: boolean) => A(`pieces/skins/${skinArt}/${color}-${king ? "king" : "man"}.png`);

  const face = (src: string, back: boolean): CSSProperties => ({
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain",
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
    transform: back ? "rotateY(180deg)" : "none",
    filter: "drop-shadow(0 6px 10px rgba(0,0,0,.55))",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <div style={{ width: S, height: S, perspective: "620px", animation: "fdcoinbob 3s ease-in-out infinite", animationDelay: delay }}>
        <div style={{ position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d", WebkitTransformStyle: "preserve-3d", animation: "fdcoinflip 5s cubic-bezier(.66,0,.34,1) infinite", animationDelay: delay }}>
          <img src={artFor(false)} alt="" style={face(artFor(false), false)} />
          <img src={artFor(true)} alt="" style={face(artFor(true), true)} />
          <div style={{ position: "absolute", top: "6%", left: "8%", width: "40%", height: "26%", borderRadius: "50%", background: "linear-gradient(120deg,rgba(255,255,255,.85),transparent)", filter: "blur(3px)", animation: "fdsheen 5s ease-in-out infinite", animationDelay: delay, pointerEvents: "none" }} />
        </div>
      </div>
      <div style={{ width: S * 0.62, height: 14, borderRadius: "50%", background: "radial-gradient(ellipse,rgba(0,0,0,.6),transparent 72%)", animation: "fdshadowpulse 3s ease-in-out infinite", animationDelay: delay }} />
      <div style={{ marginTop: 6, font: "700 11px Inter", letterSpacing: "2px", textTransform: "uppercase", color: labelColor }}>{label}</div>
      {/* pieceSkin kept for the disc fallback signature; not needed for image art */}
      <span style={{ display: "none" }}>{pieceSkin}</span>
    </div>
  );
}

function PreviewArt({ pv }: { pv: StorePreview }) {
  if (pv.kind === "board") {
    // Board texture bobs gently (prototype: fdcoinbob 4s).
    return (
      <div
        style={{
          width: 300,
          maxWidth: "100%",
          aspectRatio: "1 / 1",
          borderRadius: 12,
          backgroundImage: `url(${A(pv.boardFile ?? "board-marble.png")})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          boxShadow: "0 18px 38px rgba(0,0,0,.55), inset 0 0 0 1px rgba(232,184,75,.4)",
          animation: "fdcoinbob 4s ease-in-out infinite",
        }}
      />
    );
  }

  if (pv.kind === "skin") {
    // Portrait-style "skins" (babaylan etc.) render as an animated avatar token.
    if (pv.portraitFile) return <AvatarToken file={pv.portraitFile} />;
    // The two animated 3D flipping coins (red + blue), soldier → king.
    return (
      <div style={{ display: "flex", justifyContent: "center", gap: 52, flexWrap: "wrap" }}>
        <SkinCoin color="red" skinArt={pv.skinArt} pieceSkin={pv.pieceSkin ?? "default"} label="Your Side · Soldier → King" labelColor="#ff9aa8" delay="0s" />
        <SkinCoin color="blue" skinArt={pv.skinArt} pieceSkin={pv.pieceSkin ?? "default"} label="Opponent · Soldier → King" labelColor="#9ac2ff" delay=".9s" />
      </div>
    );
  }

  if (pv.kind === "avatar") {
    return <AvatarToken file={pv.portraitFile ?? "avatars/sovereign.png"} />;
  }

  // frame → avatar behind + frame overlay art (bobbing, prototype fdcoinbob 4.4s)
  return (
    <div style={{ position: "relative", width: 230, height: 230, margin: "0 auto", animation: "fdcoinbob 4.4s ease-in-out infinite" }}>
      <img
        src={A(pv.portraitFile ?? "avatars/sovereign.png")}
        alt=""
        style={{ position: "absolute", top: "50%", left: "50%", width: "58%", height: "58%", transform: "translate(-50%,-50%)", borderRadius: "50%", objectFit: "cover", filter: "brightness(1.15)" }}
      />
      <img
        src={A(pv.frameFile ?? "frames/laurel.png")}
        alt=""
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", filter: "drop-shadow(0 10px 24px rgba(0,0,0,.5))" }}
      />
    </div>
  );
}

// Opaque portraits → masked circle with a brightness lift + gold ring.
function AvatarToken({ file }: { file: string }) {
  // Prototype: avatar bobs (fdcoinbob 3.4s) with a sheen sweep across it.
  return (
    <div style={{ position: "relative", width: 196, height: 196, margin: "0 auto", animation: "fdcoinbob 3.4s ease-in-out infinite" }}>
      <img
        src={A(file)}
        alt=""
        style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 12%", borderRadius: "50%", border: "4px solid rgba(232,184,75,.6)", boxShadow: "0 14px 30px rgba(0,0,0,.55)", filter: "brightness(1.2)" }}
      />
      <div style={{ position: "absolute", top: "8%", left: "12%", width: "40%", height: "26%", borderRadius: "50%", background: "linear-gradient(120deg,rgba(255,255,255,.75),transparent)", filter: "blur(4px)", animation: "fdsheen 3.4s ease-in-out infinite", pointerEvents: "none" }} />
    </div>
  );
}

export type StorePreviewModalProps = {
  pv: StorePreview | null;
  onClose: () => void;
  /** Add-to-Cart / Buy — same purchase path the tiles use. */
  onBuy: () => void;
  /** label for the primary action button (e.g. "Add to Cart" / "Claim"). */
  buyLabel?: string;
};

/**
 * StorePreviewModal — the overlay. Renders nothing when `pv` is null. Clicking the
 * dimmed backdrop or the ✕ dismisses; the inner card stops propagation.
 */
export function StorePreviewModal({ pv, onClose, onBuy, buyLabel = "Add to Cart" }: StorePreviewModalProps) {
  if (!pv) return null;
  return (
    <div onClick={onClose} style={overlay}>
      <div className="frame" onClick={(e) => e.stopPropagation()} style={card}>
        <button onClick={onClose} aria-label="Close preview" style={closeBtn}>
          ✕
        </button>
        <div style={{ font: "700 11px Inter", letterSpacing: "3px", textTransform: "uppercase", color: "var(--gold)" }}>Item Preview</div>
        <h2 style={{ margin: "8px 0 3px", font: "800 28px Cinzel,serif", color: "var(--gold-lt)" }}>{pv.name}</h2>
        <div style={{ font: "600 11px Inter", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--ink2)" }}>{pv.sub}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 240, padding: "24px 0 8px" }}>
          <PreviewArt pv={pv} />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 18 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 7, font: "800 22px 'JetBrains Mono',monospace", color: pv.free ? "var(--ink)" : curColor(pv.cur) }}>
            {pv.free ? "Free" : (
              <>
                <CurIcon cur={pv.cur} /> {pv.price.toLocaleString()}
              </>
            )}
          </span>
        </div>
        {pv.owned ? (
          <div style={ownedChip}>✓ Already Owned</div>
        ) : (
          <button onClick={onBuy} className="btn btn-gold" style={{ padding: "13px 32px" }}>
            {pv.free ? "Claim" : buyLabel}
          </button>
        )}
      </div>
    </div>
  );
}

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 95,
  background: "rgba(8,4,18,.78)",
  backdropFilter: "blur(4px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  animation: "fdfade .2s ease",
};
const card: CSSProperties = {
  width: 600,
  maxWidth: "100%",
  padding: "32px 30px 26px",
  textAlign: "center",
  position: "relative",
  animation: "fdrise .25s ease both",
  background: "radial-gradient(120% 90% at 50% 0%,rgba(45,26,74,.96),rgba(20,11,36,.98))",
};
const closeBtn: CSSProperties = {
  position: "absolute",
  top: 14,
  right: 14,
  width: 34,
  height: 34,
  borderRadius: 9,
  border: "1px solid rgba(232,184,75,.25)",
  background: "rgba(0,0,0,.3)",
  color: "var(--ink2)",
  font: "700 16px Inter",
  cursor: "pointer",
};
const ownedChip: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "12px 24px",
  borderRadius: 9,
  border: "1px solid rgba(63,191,111,.5)",
  background: "rgba(63,191,111,.14)",
  color: "#7ee6a4",
  font: "700 12px Inter",
  letterSpacing: ".5px",
};

export default StorePreviewModal;
