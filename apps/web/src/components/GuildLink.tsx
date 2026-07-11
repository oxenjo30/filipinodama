import { useNavigate } from "react-router-dom";
import { guildCrest } from "../lib/assets";

/**
 * GuildLink — crest + guild name that navigates to a guild's public page
 * (/guilds/:id). Mirrors the crest rendering used by GuildsPage's local
 * `Emblem` component: real crest art via `guildCrest(crestKey, seed)`
 * (falls back to a stable crest derived from the guild id when no
 * `crestKey` is set) — never an initials/text placeholder.
 */
export function GuildLink({
  id,
  name,
  tag,
  crestKey,
  size = 36,
}: {
  id: string;
  name: string;
  tag?: string;
  crestKey?: string | null;
  size?: number;
}) {
  const navigate = useNavigate();
  const go = () => navigate(`/guilds/${id}`);
  const crest = guildCrest(crestKey, id);
  return (
    <div
      onClick={go}
      style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", minWidth: 0 }}
    >
      <img
        src={crest.src}
        alt=""
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          flex: "none",
          objectFit: "contain",
          filter: "drop-shadow(0 6px 14px rgba(0,0,0,.55))",
        }}
      />
      <div style={{ minWidth: 0 }}>
        <div style={{ font: "700 14px Inter", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {name}
        </div>
        {tag != null && <div style={{ font: "600 11px 'JetBrains Mono',monospace", color: "var(--ink2)" }}>{tag}</div>}
      </div>
    </div>
  );
}

export default GuildLink;
