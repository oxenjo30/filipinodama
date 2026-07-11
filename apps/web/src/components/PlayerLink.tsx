import type { CSSProperties, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar } from "./Avatar";

/**
 * PlayerLink — avatar + name that navigates to a player's public profile
 * (/profile/:id). The single choke point for making players clickable across
 * lists. Passes `frame` (NOT frameId) through to Avatar.
 */
export function PlayerLink({
  id,
  name,
  avatar,
  frame,
  size = 40,
  subtitle,
  nameStyle,
}: {
  id: string;
  name: string;
  avatar: string;
  frame?: string;
  size?: number;
  subtitle?: ReactNode;
  nameStyle?: CSSProperties;
}) {
  const navigate = useNavigate();
  const go = () => navigate(`/profile/${id}`);
  return (
    <div
      onClick={go}
      style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", minWidth: 0 }}
    >
      <Avatar src={avatar} size={size} frame={frame} onClick={go} />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            font: "700 14px Inter",
            color: "#fff",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            ...nameStyle,
          }}
        >
          {name}
        </div>
        {subtitle != null && <div style={{ marginTop: 1 }}>{subtitle}</div>}
      </div>
    </div>
  );
}

export default PlayerLink;
