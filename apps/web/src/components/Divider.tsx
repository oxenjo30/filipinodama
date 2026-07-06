import type { CSSProperties, ReactNode } from "react";

export type DividerProps = {
  /** eyebrow label shown between the two gradient rules, wrapped in ✦ … ✦ */
  children?: ReactNode;
  /** render the ✦ star glyphs around the label (default true) */
  stars?: boolean;
  className?: string;
  style?: CSSProperties;
};

/**
 * Divider — the ✦ eyebrow with gradient hairline rules to the left and right.
 * Matches the prototype's `.divider` (index.css). With no children it renders a
 * simple centred pair of gold-fading rules.
 */
export function Divider({ children, stars = true, className, style }: DividerProps) {
  return (
    <div className={className ? `divider ${className}` : "divider"} style={style}>
      <i />
      {children != null && (
        <span>
          {stars && <span aria-hidden>✦</span>}
          {children}
          {stars && <span aria-hidden>✦</span>}
        </span>
      )}
      <i />
    </div>
  );
}

export type SectionTitleProps = {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
};

/**
 * SectionTitle — the `.ptitle` treatment: uppercase Inter 700, gold-lt, letter
 * spacing, centred, with a gold hairline underline. Use above panel content.
 */
export function SectionTitle({ children, className, style }: SectionTitleProps) {
  return (
    <div className={className ? `ptitle ${className}` : "ptitle"} style={style}>
      {children}
    </div>
  );
}

export default Divider;
