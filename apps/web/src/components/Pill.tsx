import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { ICONS } from "../lib/assets";

export type PillProps = {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
} & Omit<HTMLAttributes<HTMLSpanElement>, "className" | "style" | "children">;

/**
 * Pill — currency/stat chip. Radius 100px, gold hairline border, translucent
 * ink fill, JetBrains Mono 700 (all from the `.pill` class in index.css).
 * Colour of the text is left to the caller (via `style.color`) so the same
 * chip serves gold (#f2d493), diamond (#ff9aa8), trophy, etc.
 */
export function Pill({ children, className, style, ...rest }: PillProps) {
  return (
    <span
      className={className ? `pill ${className}` : "pill"}
      style={style}
      {...rest}
    >
      {children}
    </span>
  );
}

export type CurrencyKind = "gold" | "diamond" | "trophy";

const CURRENCY: Record<CurrencyKind, { icon: string; color: string; label: string }> = {
  gold: { icon: ICONS.coin, color: "#f2d493", label: "Gold" },
  diamond: { icon: ICONS.gem, color: "#ff9aa8", label: "Diamonds" },
  trophy: { icon: ICONS.trophy, color: "#f2d493", label: "Trophies" },
};

export type CurrencyPillProps = {
  kind: CurrencyKind;
  value: number | string;
  /** icon pixel size (default 18) */
  iconSize?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
};

/**
 * CurrencyPill — convenience wrapper that shows the right icon + accent colour
 * for a gold / diamond / trophy balance. Numeric values are grouped with commas.
 */
export function CurrencyPill({
  kind,
  value,
  iconSize = 18,
  className,
  style,
  title,
}: CurrencyPillProps) {
  const c = CURRENCY[kind];
  const text = typeof value === "number" ? value.toLocaleString() : value;
  return (
    <Pill
      className={className}
      style={{ color: c.color, whiteSpace: "nowrap", ...style }}
      title={title ?? c.label}
    >
      <img
        src={c.icon}
        alt=""
        width={iconSize}
        height={iconSize}
        style={{ display: "block", objectFit: "contain" }}
      />
      {text}
    </Pill>
  );
}

export default Pill;
