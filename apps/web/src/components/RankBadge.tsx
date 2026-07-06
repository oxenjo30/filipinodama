import type { CSSProperties } from "react";
import { rankTierFor, RANK_TIERS, type RankTier, type RankTierKey } from "@dama/shared";
import { tierArt } from "../lib/assets";

export type RankBadgeProps = {
  /** trophy count — resolves the tier via rankTierFor() */
  trophies?: number;
  /** …or pin a specific tier by key (takes precedence over trophies) */
  tier?: RankTierKey;
  /** badge art diameter in px (default 48) */
  size?: number;
  /** show the tier name label beside the art (default true) */
  showLabel?: boolean;
  /** show the sub-title (e.g. "Champion") under the name */
  showSub?: boolean;
  /** show the trophy count under the name (only when `trophies` is given) */
  showTrophies?: boolean;
  layout?: "row" | "column";
  className?: string;
  style?: CSSProperties;
};

function tierByKey(key: RankTierKey): RankTier {
  return RANK_TIERS.find((t) => t.key === key) ?? RANK_TIERS[0];
}

/**
 * RankBadge — tier crest + name in the tier accent colour.
 *
 * Resolves the rank tier from `tier` (explicit) or `trophies` (via the shared
 * `rankTierFor`), then renders `/assets/achievements/tier-<img>.png` with the
 * tier's label coloured by its accent. Tier data (name, sub, accent, art key)
 * is the single source of truth from @dama/shared RANK_TIERS.
 */
export function RankBadge({
  trophies,
  tier,
  size = 48,
  showLabel = true,
  showSub = false,
  showTrophies = false,
  layout = "row",
  className,
  style,
}: RankBadgeProps) {
  const t: RankTier = tier ? tierByKey(tier) : rankTierFor(trophies ?? 0);
  const column = layout === "column";

  return (
    <div
      className={className}
      title={`${t.label} — ${t.sub}`}
      style={{
        display: "inline-flex",
        flexDirection: column ? "column" : "row",
        alignItems: "center",
        gap: column ? 6 : 10,
        ...style,
      }}
    >
      <img
        src={tierArt(t.img)}
        alt={t.label}
        width={size}
        height={size}
        draggable={false}
        style={{
          objectFit: "contain",
          filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.5))",
          flex: "none",
        }}
      />
      {showLabel && (
        <div style={{ textAlign: column ? "center" : "left", lineHeight: 1.15 }}>
          <div
            style={{
              font: "700 14px Inter",
              letterSpacing: "0.5px",
              color: t.accent,
            }}
          >
            {t.label}
          </div>
          {showSub && (
            <div style={{ font: "600 11px Inter", color: "var(--ink2)", marginTop: 1 }}>
              {t.sub}
            </div>
          )}
          {showTrophies && trophies != null && (
            <div
              style={{
                font: "700 12px 'JetBrains Mono', monospace",
                color: "var(--ink)",
                marginTop: 1,
              }}
            >
              {trophies.toLocaleString()} 🏆
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default RankBadge;
