import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

export type FrameProps = {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
} & Omit<HTMLAttributes<HTMLDivElement>, "className" | "style" | "children">;

/**
 * Frame — the signature ornate card.
 *
 * Deep royal-purple fill, gold hairline border, layered inset shadows, and four
 * gold ✦ star glyphs pinned in the corners. All of that styling lives in the
 * `.frame` class (index.css, ported verbatim from the prototype); this component
 * just applies it and forwards children + extra classes/styles.
 */
export function Frame({ children, className, style, ...rest }: FrameProps) {
  return (
    <div
      className={className ? `frame ${className}` : "frame"}
      style={{ padding: 20, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}

export default Frame;
