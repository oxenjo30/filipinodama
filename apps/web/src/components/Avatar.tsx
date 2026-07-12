import { useEffect, type CSSProperties } from "react";
import { avatar as resolveAvatar, frameArt, type FrameKey } from "../lib/assets";
import { useCosmeticsStore } from "../stores/cosmeticsStore";

export type AvatarProps = {
  /** avatar key (e.g. "champion"), a full `/assets/...` path, or an uploaded URL */
  src: string;
  /** diameter in px (default 56) */
  size?: number;
  /** optional equipped cosmetic frame overlay (key or path) */
  frame?: FrameKey | string;
  /** show the gold ring border around the token (default true) */
  ring?: boolean;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
  onClick?: () => void;
};

/**
 * Avatar — masked circular portrait token.
 *
 * IMPORTANT: the hero/faction portrait PNGs are OPAQUE renders on near-black
 * backgrounds. They must never appear as raw rectangles on light surfaces, so
 * this component always clips them to a circle (border-radius 50% + overflow
 * hidden) and lifts them with `filter: brightness(1.25)`. An optional cosmetic
 * frame renders as a transparent overlay sized slightly larger than the token.
 */
export function Avatar({
  src,
  size = 56,
  frame,
  ring = true,
  alt = "",
  className,
  style,
  title,
  onClick,
}: AvatarProps) {
  const url = resolveAvatar(src);

  // The `frame` prop carries a FRAME ITEM ID (e.g. "jadedragonf"), which
  // frameArt() can't resolve. Map it to its art key via the shared cosmetics
  // catalog first. Subscribing to byId re-renders once the catalog loads;
  // frameKey falls back to the raw id (so legacy frames like "laurel" still
  // work) and returns null only for a missing/none frame → no overlay.
  const frameKey = useCosmeticsStore((c) => c.frameKey);
  const cosmeticsLoaded = useCosmeticsStore((c) => c.loaded);
  const ensureCatalog = useCosmeticsStore((c) => c.load);
  useEffect(() => {
    if (!cosmeticsLoaded) void ensureCatalog();
  }, [cosmeticsLoaded, ensureCatalog]);
  const resolvedFrame = frame ? frameKey(frame) : null;

  return (
    <div
      className={className}
      onClick={onClick}
      title={title}
      style={{
        position: "relative",
        width: size,
        height: size,
        flex: "none",
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          overflow: "hidden",
          border: ring ? "2px solid rgba(232,184,75,0.6)" : "none",
          boxShadow: "0 4px 12px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(0,0,0,0.4)",
          background: "#160b28",
        }}
      >
        <img
          src={url}
          alt={alt}
          draggable={false}
          onError={(e) => {
            // Never leave a broken-image glyph in the ring. If the resolved URL
            // 404s (stale/unknown avatar key), fall back to the default portrait
            // once (guard against a fallback that itself fails looping forever).
            const img = e.currentTarget;
            const fallback = resolveAvatar("champion");
            if (img.src !== fallback) img.src = fallback;
          }}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "50% 12%",
            filter: "brightness(1.25)",
            display: "block",
          }}
        />
      </div>
      {resolvedFrame && (
        <img
          src={frameArt(resolvedFrame)}
          alt=""
          aria-hidden
          draggable={false}
          onError={(e) => {
            // A frame is decoration; if its art 404s (unknown/legacy frame id),
            // hide the overlay rather than leave a broken square around the
            // portrait. The avatar underneath still renders.
            e.currentTarget.style.display = "none";
          }}
          style={{
            position: "absolute",
            inset: `-${Math.round(size * 0.16)}px`,
            width: `calc(100% + ${Math.round(size * 0.32)}px)`,
            height: `calc(100% + ${Math.round(size * 0.32)}px)`,
            objectFit: "contain",
            pointerEvents: "none",
            filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.5))",
          }}
        />
      )}
    </div>
  );
}

export default Avatar;
