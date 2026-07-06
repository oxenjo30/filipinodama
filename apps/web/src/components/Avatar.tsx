import type { CSSProperties } from "react";
import { avatar as resolveAvatar, frameArt, type FrameKey } from "../lib/assets";

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
      {frame && (
        <img
          src={frameArt(frame)}
          alt=""
          aria-hidden
          draggable={false}
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
